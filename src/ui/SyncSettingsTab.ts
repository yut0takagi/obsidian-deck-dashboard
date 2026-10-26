import { App, Notice, Plugin, PluginSettingTab, Setting } from "obsidian";
import { GoogleOAuth } from "../auth/googleOAuth";
import { GoogleAuthModal } from "./GoogleAuthModal";
import { SheetsSync, SyncScope } from "../sync/sheetsSync";
import { AutoSyncWatcher } from "../sync/autoSyncWatcher";
import { loadMailConfig, saveMailConfig } from "../core/mailConfig";
import { renderDeckSettings, type SettingsSectionHost } from "./DeckSettingsSection";
import { updatePluginData } from "../core/pluginData";
import { renderCalendarSources } from "./CalendarSourcesSection";
import { t } from "../core/i18n";

/**
 * Settings tab under "Deck" in Obsidian → Settings → Community plugins.
 * Starts with the home dashboard and folders, then surfaces the same
 * operations as the command palette: authenticate, set up personal/org
 * spreadsheets, kick off a sync, toggle auto-sync, configure self-owner.
 */
export class SyncSettingsTab extends PluginSettingTab {
  constructor(app: App, private plugin: Plugin & SettingsSectionHost) {
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

    renderDeckSettings(containerEl, this.app, this.plugin);
    await renderCalendarSources(containerEl, this.plugin, this.plugin, () => this.display());
    await this.renderGoogleAuthSection(containerEl);
    await this.renderSelfOwnerSection(containerEl);
    await this.renderScopeSection(containerEl, "personal", t().syncSettingsPersonalTasks);
    await this.renderScopeSection(containerEl, "org", t().syncSettingsOrganizationTasks);
    await this.renderAutoSyncSection(containerEl);
    await this.renderManualSyncSection(containerEl);
    await this.renderMailSection(containerEl);
  }

  private async renderGoogleAuthSection(parent: HTMLElement): Promise<void> {
    const oauth = new GoogleOAuth(this.plugin);
    const authed = await oauth.isAuthenticated();
    const section = parent.createDiv();
    new Setting(section).setName(t().syncSettingsGoogleAuthentication).setHeading();

    new Setting(section)
      .setName(t().syncSettingsAuthenticationStatus)
      .setDesc(authed ? t().syncSettingsAuthenticated : t().syncSettingsNotAuthenticatedAuthenticateFirst)
      .addButton((b) =>
        b
          .setButtonText(authed ? t().syncSettingsReauthenticateOpenSettings : t().syncSettingsAuthenticate)
          .setCta()
          .onClick(() => {
            new GoogleAuthModal(this.app, oauth).open();
          })
      );
  }

  private async renderSelfOwnerSection(parent: HTMLElement): Promise<void> {
    const section = parent.createDiv();
    new Setting(section).setName(t().syncSettingsYourName).setHeading();

    const sync = new SheetsSync(this.app, this.plugin, new GoogleOAuth(this.plugin));
    const config = await sync.getConfig();

    new Setting(section)
      .setName("self_owner")
      .setDesc(
        t().syncSettingsFolderNameForYourPersonal
      )
      .addText((text) => {
        text.setValue(config.self_owner ?? "");
        text.inputEl.placeholder = t().syncSettingsExampleYamada;
        text.onChange(async (v) => {
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
        .setName(t().syncSettingsSpreadsheetUrl)
        .setDesc(scopeCfg?.spreadsheetUrl ?? t().syncSettingsUrlUnavailable)
        .addButton((b) =>
          b.setButtonText(t().syncSettingsOpenInBrowser).onClick(() => {
            if (scopeCfg?.spreadsheetUrl) window.open(scopeCfg.spreadsheetUrl, "_blank");
          })
        );
      new Setting(section)
        .setName(t().syncSettingsLastSync)
        .setDesc(scopeCfg?.last_sync ?? t().syncSettingsNeverSynced)
        .addButton((b) =>
          b.setButtonText(t().syncSettingsSyncNow).onClick(async () => {
            try {
              const report = await sync.syncScope(scope);
              new Notice(
                t().syncSettingsSyncCompletePushPull(title, report.pushed, report.pulled)
              );
              this.display();
            } catch (e) {
              new Notice(t().syncSettingsSyncFailed((e as Error).message));
            }
          })
        );
      new Setting(section)
        .setName(t().syncSettingsDisconnect)
        .setDesc(t().syncSettingsRemovesThisVaultSConnection)
        .addButton((b) =>
          b
            .setButtonText(t().syncSettingsDisconnect2)
            .setWarning()
            .onClick(async () => {
              const next = await sync.getConfig();
              next[scope] = {};
              await this.saveConfig(next);
              new Notice(t().syncSettingsDisconnected(title));
              this.display();
            })
        );
    } else {
      new Setting(section)
        .setName("Google Sheets")
        .setDesc(t().syncSettingsNotConfiguredANewSpreadsheet)
        .addButton((b) =>
          b
            .setButtonText(t().syncSettingsCreateSpreadsheet)
            .setCta()
            .onClick(async () => {
              try {
                await sync.setupSheet(scope);
                this.display();
              } catch (e) {
                new Notice(t().syncSettingsSetupFailed((e as Error).message));
              }
            })
        );
    }
  }

  private async renderAutoSyncSection(parent: HTMLElement): Promise<void> {
    const section = parent.createDiv();
    new Setting(section).setName(t().syncSettingsAutomaticSynchronization).setHeading();

    const watcher = new AutoSyncWatcher(this.plugin, this.app);
    const enabled = await watcher.isEnabled();

    new Setting(section)
      .setName(t().syncSettingsSyncAutomaticallyWhenTaskFiles)
      .setDesc(
        t().syncSettingsEditingAMdInThe
      )
      .addToggle((tog) => {
        tog.setValue(enabled);
        tog.onChange(async (v) => {
          await watcher.setEnabled(v);
          new Notice(t().syncSettingsAutoSyncTakesEffectAfter(v ? "ON" : "OFF"));
        });
      });
  }

  private async renderManualSyncSection(parent: HTMLElement): Promise<void> {
    const section = parent.createDiv();
    new Setting(section).setName(t().syncSettingsManualSynchronization).setHeading();

    const sync = new SheetsSync(this.app, this.plugin, new GoogleOAuth(this.plugin));

    new Setting(section)
      .setName(t().syncSettingsSyncBothScopes)
      .setDesc(t().syncSettingsSyncPersonalAndOrganizationTasks)
      .addButton((b) =>
        b
          .setButtonText(t().syncSettingsSyncAll)
          .setCta()
          .onClick(async () => {
            try {
              const results = await sync.syncAll();
              const parts: string[] = [];
              if (results.personal) {
                parts.push(
                  t().syncSettingsPersonalPushPull(results.personal.pushed, results.personal.pulled)
                );
              }
              if (results.org) {
                parts.push(t().syncSettingsOrganizationPushPull(results.org.pushed, results.org.pulled));
              }
              new Notice(t().syncSettingsSyncComplete(parts.join(" / ") || t().nothingToSync));
              this.display();
            } catch (e) {
              new Notice(t().syncSettingsSyncFailed((e as Error).message));
            }
          })
      );
  }

  private async renderMailSection(parent: HTMLElement): Promise<void> {
    const section = parent.createDiv();
    new Setting(section).setName(t().syncSettingsMailGmail).setHeading();
    const cfg = await loadMailConfig(this.plugin);

    new Setting(section)
      .setName(t().syncSettingsInboxQuery)
      .setDesc(t().syncSettingsDefaultEmailFilterExamplesIn)
      .addText((t) => {
        t.setValue(cfg.query);
        t.onChange(async (v) => {
          cfg.query = v.trim() || "in:inbox";
          await saveMailConfig(this.plugin, cfg);
        });
      });

    new Setting(section)
      .setName(t().syncSettingsMessageLimit)
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
      .setName(t().syncSettingsAiBackend)
      .setDesc(t().syncSettingsClaudeCodeClaudePSubscription)
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
      .setName(t().syncSettingsAiReplyReferenceFoldersComma)
      .setDesc(t().syncSettingsVaultFoldersUsedAsBackground)
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
    await updatePluginData(this.plugin, (data) => {
      data.sync_config = next;
    });
  }
}
