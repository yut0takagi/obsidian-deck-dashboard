import { App, Notice, Plugin, PluginSettingTab, Setting } from "obsidian";
import { GoogleOAuth } from "../auth/googleOAuth";
import { GoogleAuthModal } from "./GoogleAuthModal";
import { SheetsSync, SyncScope } from "../sync/sheetsSync";
import { AutoSyncWatcher } from "../sync/autoSyncWatcher";
import { loadMailConfig, saveMailConfig } from "../core/mailConfig";

/**
 * Settings tab under "Deck" in Obsidian → Settings → Community plugins.
 * Surfaces the same operations as the command palette: authenticate, set up
 * personal/org spreadsheets, kick off a sync, toggle auto-sync, configure
 * self-owner.
 */
export class SyncSettingsTab extends PluginSettingTab {
  constructor(app: App, private plugin: Plugin) {
    super(app, plugin);
  }

  // Synchronous override to satisfy PluginSettingTab.display()'s void signature;
  // the actual async work is delegated to render().
  display(): void {
    void this.render();
  }

  private async render(): Promise<void> {
    const { containerEl } = this;
    containerEl.empty();

    await this.renderGoogleAuthSection(containerEl);
    await this.renderSelfOwnerSection(containerEl);
    await this.renderScopeSection(containerEl, "personal", "個人タスク");
    await this.renderScopeSection(containerEl, "org", "組織タスク");
    await this.renderAutoSyncSection(containerEl);
    await this.renderManualSyncSection(containerEl);
    await this.renderMailSection(containerEl);
  }

  private async renderGoogleAuthSection(parent: HTMLElement): Promise<void> {
    const oauth = new GoogleOAuth(this.plugin);
    const authed = await oauth.isAuthenticated();
    const section = parent.createDiv();
    new Setting(section).setName("Google 認証").setHeading();

    new Setting(section)
      .setName("認証状態")
      .setDesc(authed ? "✅ 認証済み" : "❌ 未認証 — まず認証してください")
      .addButton((b) =>
        b
          .setButtonText(authed ? "再認証 / 設定を開く" : "認証する")
          .setCta()
          .onClick(() => {
            new GoogleAuthModal(this.app, oauth).open();
          })
      );
  }

  private async renderSelfOwnerSection(parent: HTMLElement): Promise<void> {
    const section = parent.createDiv();
    new Setting(section).setName("自分の名前").setHeading();

    const sync = new SheetsSync(this.app, this.plugin, new GoogleOAuth(this.plugin));
    const config = await sync.getConfig();

    new Setting(section)
      .setName("self_owner")
      .setDesc(
        "個人スコープが対象とするフォルダ名。タスク/詳細/{この名前}/*.md が個人タスク扱い"
      )
      .addText((t) => {
        t.setValue(config.self_owner ?? "");
        t.inputEl.placeholder = "例: 髙木";
        t.onChange(async (v) => {
          const next = await sync.getConfig();
          next.self_owner = v.trim() || undefined;
          await this.saveConfig(next);
        });
      });
  }

  private async renderScopeSection(
    parent: HTMLElement,
    scope: SyncScope,
    title: string
  ): Promise<void> {
    const section = parent.createDiv();
    new Setting(section).setName(title).setHeading();

    const sync = new SheetsSync(this.app, this.plugin, new GoogleOAuth(this.plugin));
    const config = await sync.getConfig();
    const scopeCfg = config[scope];
    const hasSheet = !!scopeCfg?.spreadsheetId;

    if (hasSheet) {
      new Setting(section)
        .setName("スプシURL")
        .setDesc(scopeCfg?.spreadsheetUrl ?? "(URL不明)")
        .addButton((b) =>
          b.setButtonText("ブラウザで開く").onClick(() => {
            if (scopeCfg?.spreadsheetUrl) window.open(scopeCfg.spreadsheetUrl, "_blank");
          })
        );
      new Setting(section)
        .setName("最終同期")
        .setDesc(scopeCfg?.last_sync ?? "未同期")
        .addButton((b) =>
          b.setButtonText("今すぐ同期").onClick(async () => {
            try {
              const report = await sync.syncScope(scope);
              new Notice(
                `${title} 同期完了: push ${report.pushed} / pull ${report.pulled}`
              );
              this.display();
            } catch (e) {
              new Notice(`同期失敗: ${(e as Error).message}`);
            }
          })
        );
      new Setting(section)
        .setName("接続解除")
        .setDesc("vault側の設定だけ削除。Sheets本体は残ります。")
        .addButton((b) =>
          b
            .setButtonText("解除")
            .setWarning()
            .onClick(async () => {
              const next = await sync.getConfig();
              next[scope] = {};
              await this.saveConfig(next);
              new Notice(`${title} の接続を解除しました`);
              this.display();
            })
        );
    } else {
      new Setting(section)
        .setName("Google Sheets")
        .setDesc("未設定 — 新規スプシを自動作成します")
        .addButton((b) =>
          b
            .setButtonText("Sheetsを作成")
            .setCta()
            .onClick(async () => {
              try {
                await sync.setupSheet(scope);
                this.display();
              } catch (e) {
                new Notice(`Setup失敗: ${(e as Error).message}`);
              }
            })
        );
    }
  }

  private async renderAutoSyncSection(parent: HTMLElement): Promise<void> {
    const section = parent.createDiv();
    new Setting(section).setName("自動同期").setHeading();

    const watcher = new AutoSyncWatcher(this.plugin, this.app);
    const enabled = await watcher.isEnabled();

    new Setting(section)
      .setName("ファイル変更時に自動同期")
      .setDesc(
        "タスク/詳細/*.md を更新すると 2秒のデバウンス後に自動同期します。変更を反映するにはプラグインを再読み込みしてください。"
      )
      .addToggle((tog) => {
        tog.setValue(enabled);
        tog.onChange(async (v) => {
          await watcher.setEnabled(v);
          new Notice(`自動同期 ${v ? "ON" : "OFF"}（次回プラグイン再読み込みで有効化）`);
        });
      });
  }

  private async renderManualSyncSection(parent: HTMLElement): Promise<void> {
    const section = parent.createDiv();
    new Setting(section).setName("手動同期 (まとめて)").setHeading();

    const sync = new SheetsSync(this.app, this.plugin, new GoogleOAuth(this.plugin));

    new Setting(section)
      .setName("両スコープを同期")
      .setDesc("個人と組織の両方を実行します。両方setup済みでないと一部スキップ。")
      .addButton((b) =>
        b
          .setButtonText("全部同期")
          .setCta()
          .onClick(async () => {
            try {
              const results = await sync.syncAll();
              const parts: string[] = [];
              if (results.personal) {
                parts.push(
                  `個人 push:${results.personal.pushed} pull:${results.personal.pulled}`
                );
              }
              if (results.org) {
                parts.push(`組織 push:${results.org.pushed} pull:${results.org.pulled}`);
              }
              new Notice(`同期完了: ${parts.join(" / ") || "対象なし"}`);
              this.display();
            } catch (e) {
              new Notice(`同期失敗: ${(e as Error).message}`);
            }
          })
      );
  }

  private async renderMailSection(parent: HTMLElement): Promise<void> {
    const section = parent.createDiv();
    new Setting(section).setName("メール (Gmail)").setHeading();
    const cfg = await loadMailConfig(this.plugin);

    new Setting(section)
      .setName("受信クエリ")
      .setDesc("一覧の既定の絞り込み。例: in:inbox / is:unread")
      .addText((t) => {
        t.setValue(cfg.query);
        t.onChange(async (v) => {
          cfg.query = v.trim() || "in:inbox";
          await saveMailConfig(this.plugin, cfg);
        });
      });

    new Setting(section)
      .setName("表示件数")
      .addText((t) =>
        t.setValue(String(cfg.maxItems)).onChange(async (v) => {
          const n = parseInt(v, 10);
          if (!isNaN(n) && n > 0) {
            cfg.maxItems = n;
            await saveMailConfig(this.plugin, cfg);
          }
        })
      );

    new Setting(section)
      .setName("AIバックエンド")
      .setDesc("claude-code = `claude -p`（サブスク・APIキー不要）/ api = Anthropic API")
      .addDropdown((d) =>
        d
          .addOption("claude-code", "claude -p")
          .addOption("api", "Anthropic API")
          .setValue(cfg.backend)
          .onChange(async (v) => {
            cfg.backend = v as typeof cfg.backend;
            await saveMailConfig(this.plugin, cfg);
          })
      );

    new Setting(section)
      .setName("AI返信の参照フォルダ (カンマ区切り)")
      .setDesc("返信ドラフト生成時に過去背景として参照する vault フォルダ。例: 議事録, ナレッジ")
      .addText((t) => {
        t.setValue(cfg.ragFolders.join(", "));
        t.inputEl.addClass("deck-input-full");
        t.onChange(async (v) => {
          cfg.ragFolders = v.split(",").map((s) => s.trim()).filter(Boolean);
          await saveMailConfig(this.plugin, cfg);
        });
      });
  }

  private async saveConfig(next: unknown): Promise<void> {
    const data = ((await this.plugin.loadData()) ?? {}) as Record<string, unknown>;
    data.sync_config = next;
    await this.plugin.saveData(data);
  }
}
