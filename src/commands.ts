import { Modal, Notice, Plugin, TFile, normalizePath } from "obsidian";
import {
  DASHBOARD_EXTENSION,
  DEFAULT_DASHBOARD_FOLDER,
  DEFAULT_HOME_FILENAME,
  VIEW_TYPE_MAIL,
} from "./core/constants";
import {
  createDefaultDashboard,
  serializeDashboard,
} from "./core/DashboardModel";
import type { Dashboard } from "./core/types";
import { DashboardView } from "./core/DashboardView";
import { getHomeTemplate } from "./core/templates/homeTemplate";
import { GoogleOAuth } from "./auth/googleOAuth";
import { GoogleAuthModal } from "./ui/GoogleAuthModal";
import { listCalendars } from "./adapters/googleCalendar";
import { SheetsSync } from "./sync/sheetsSync";
import { AutoSyncWatcher } from "./sync/autoSyncWatcher";

export function registerCommands(plugin: Plugin): void {
  plugin.addCommand({
    id: "create-new",
    name: "Create new dashboard",
    callback: async () => {
      await createNewDashboard(plugin, "Untitled", createDefaultDashboard("Untitled"));
    },
  });

  plugin.addCommand({
    id: "open-home",
    name: "Open home dashboard",
    callback: async () => {
      await openHomeDashboard(plugin);
    },
  });

  plugin.addCommand({
    id: "open-mail",
    name: "メールを開く (Gmail)",
    callback: async () => {
      const { workspace } = plugin.app;
      let leaf = workspace.getLeavesOfType(VIEW_TYPE_MAIL)[0];
      if (!leaf) {
        leaf = workspace.getLeaf("tab");
        await leaf.setViewState({ type: VIEW_TYPE_MAIL, active: true });
      }
      workspace.revealLeaf(leaf);
    },
  });

  plugin.addCommand({
    id: "reset-home",
    name: "Reset home dashboard to template",
    callback: async () => {
      await resetHomeDashboard(plugin);
    },
  });

  plugin.addCommand({
    id: "add-widget",
    name: "Add widget to active dashboard",
    checkCallback: (checking) => {
      const view = activeDashboardView(plugin);
      if (checking) return !!view;
      view?.openAddWidget();
      return true;
    },
  });

  plugin.addCommand({
    id: "toggle-edit",
    name: "Toggle dashboard edit mode",
    checkCallback: (checking) => {
      const view = activeDashboardView(plugin);
      if (checking) return !!view;
      view?.toggleEditMode();
      return true;
    },
  });

  plugin.addCommand({
    id: "google-auth",
    name: "Google Calendar: Authenticate / setup credentials",
    callback: () => {
      new GoogleAuthModal(plugin.app, new GoogleOAuth(plugin)).open();
    },
  });

  plugin.addCommand({
    id: "google-signout",
    name: "Google Calendar: Sign out",
    callback: async () => {
      await new GoogleOAuth(plugin).clearTokens();
      new Notice("Google Calendar からサインアウトしました");
    },
  });

  plugin.addCommand({
    id: "google-list-calendars",
    name: "Google Calendar: List calendars (for calendarId lookup)",
    callback: async () => {
      try {
        const oauth = new GoogleOAuth(plugin);
        const cals = await listCalendars(oauth);
        const lines = cals.map(
          (c) => `${c.primary ? "★" : "  "} ${c.summary}\n   → ${c.id}`
        );
        new Notice(`カレンダー一覧 (${cals.length}件) — コンソールに出力`);
        // eslint-disable-next-line no-console
        console.log("[Deck] Google Calendars:\n" + lines.join("\n\n"));
      } catch (e) {
        new Notice(`取得失敗: ${(e as Error).message}`);
      }
    },
  });

  plugin.addCommand({
    id: "sheets-sync-setup-personal",
    name: "Sheets Sync: Setup personal sheet (個人)",
    callback: async () => {
      try {
        const sync = new SheetsSync(plugin.app, plugin, new GoogleOAuth(plugin));
        const cfg = await sync.setupSheet("personal");
        if (cfg.spreadsheetUrl) {
          // eslint-disable-next-line no-console
          console.log("[Deck] Personal Sheets URL:", cfg.spreadsheetUrl);
        }
      } catch (e) {
        new Notice(`Setup失敗: ${(e as Error).message}`);
      }
    },
  });

  plugin.addCommand({
    id: "sheets-sync-setup-org",
    name: "Sheets Sync: Setup org sheet (組織)",
    callback: async () => {
      try {
        const sync = new SheetsSync(plugin.app, plugin, new GoogleOAuth(plugin));
        const cfg = await sync.setupSheet("org");
        if (cfg.spreadsheetUrl) {
          // eslint-disable-next-line no-console
          console.log("[Deck] Org Sheets URL:", cfg.spreadsheetUrl);
        }
      } catch (e) {
        new Notice(`Setup失敗: ${(e as Error).message}`);
      }
    },
  });

  plugin.addCommand({
    id: "sheets-sync-now",
    name: "Sheets Sync: Sync now (both scopes)",
    callback: async () => {
      try {
        const sync = new SheetsSync(plugin.app, plugin, new GoogleOAuth(plugin));
        new Notice("Sheets同期を開始…");
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
        // eslint-disable-next-line no-console
        console.log("[Deck] Sync report:", results);
      } catch (e) {
        new Notice(`同期失敗: ${(e as Error).message}`);
      }
    },
  });

  plugin.addCommand({
    id: "sheets-sync-now-personal",
    name: "Sheets Sync: Sync now (個人 only)",
    callback: async () => {
      try {
        const sync = new SheetsSync(plugin.app, plugin, new GoogleOAuth(plugin));
        const report = await sync.syncScope("personal");
        new Notice(`個人同期完了: push ${report.pushed} / pull ${report.pulled}`);
      } catch (e) {
        new Notice(`同期失敗: ${(e as Error).message}`);
      }
    },
  });

  plugin.addCommand({
    id: "sheets-sync-now-org",
    name: "Sheets Sync: Sync now (組織 only)",
    callback: async () => {
      try {
        const sync = new SheetsSync(plugin.app, plugin, new GoogleOAuth(plugin));
        const report = await sync.syncScope("org");
        new Notice(`組織同期完了: push ${report.pushed} / pull ${report.pulled}`);
      } catch (e) {
        new Notice(`同期失敗: ${(e as Error).message}`);
      }
    },
  });

  plugin.addCommand({
    id: "sheets-sync-status",
    name: "Sheets Sync: Show status",
    callback: async () => {
      try {
        const sync = new SheetsSync(plugin.app, plugin, new GoogleOAuth(plugin));
        const cfg = await sync.getConfig();
        const lines: string[] = [];
        lines.push(`自分: ${cfg.self_owner ?? "(未設定)"}`);
        if (cfg.personal?.spreadsheetId) {
          lines.push(
            `個人: ${cfg.personal.spreadsheetUrl}\n  最終: ${cfg.personal.last_sync ?? "未同期"}`
          );
        } else {
          lines.push("個人: 未設定");
        }
        if (cfg.org?.spreadsheetId) {
          lines.push(
            `組織: ${cfg.org.spreadsheetUrl}\n  最終: ${cfg.org.last_sync ?? "未同期"}`
          );
        } else {
          lines.push("組織: 未設定");
        }
        const watcher = new AutoSyncWatcher(plugin, plugin.app);
        lines.push(`自動同期: ${(await watcher.isEnabled()) ? "ON" : "OFF"}`);
        new Notice(lines.join("\n"));
        // eslint-disable-next-line no-console
        console.log("[Deck] Status:", cfg);
      } catch (e) {
        new Notice(`取得失敗: ${(e as Error).message}`);
      }
    },
  });

  plugin.addCommand({
    id: "sheets-sync-toggle-auto",
    name: "Sheets Sync: Toggle auto-sync on file change",
    callback: async () => {
      const watcher = new AutoSyncWatcher(plugin, plugin.app);
      const current = await watcher.isEnabled();
      await watcher.setEnabled(!current);
      new Notice(
        `自動同期: ${!current ? "ON" : "OFF"}（次回プラグイン再読み込み時に有効化）`
      );
    },
  });
}

function activeDashboardView(plugin: Plugin): DashboardView | null {
  const leaf = plugin.app.workspace.getActiveViewOfType(DashboardView as any);
  return (leaf as DashboardView | null) ?? null;
}

async function createNewDashboard(
  plugin: Plugin,
  baseTitle: string,
  initial: Dashboard
): Promise<TFile> {
  const folder = normalizePath(DEFAULT_DASHBOARD_FOLDER);
  if (!plugin.app.vault.getAbstractFileByPath(folder)) {
    await plugin.app.vault.createFolder(folder);
  }
  const baseName = sanitizeFilename(baseTitle);
  const path = await uniquePath(
    plugin,
    `${folder}/${baseName}.${DASHBOARD_EXTENSION}`
  );
  const file = await plugin.app.vault.create(path, serializeDashboard(initial));
  await openInDashboardView(plugin, file);
  new Notice(`Dashboard created: ${file.path}`);
  return file;
}

async function openHomeDashboard(plugin: Plugin): Promise<void> {
  const folder = normalizePath(DEFAULT_DASHBOARD_FOLDER);
  const homePath = `${folder}/${DEFAULT_HOME_FILENAME}.${DASHBOARD_EXTENSION}`;
  let file = plugin.app.vault.getAbstractFileByPath(homePath);
  if (!(file instanceof TFile)) {
    if (!plugin.app.vault.getAbstractFileByPath(folder)) {
      await plugin.app.vault.createFolder(folder);
    }
    file = await plugin.app.vault.create(
      homePath,
      serializeDashboard(getHomeTemplate(DEFAULT_HOME_FILENAME))
    );
    new Notice(`Home dashboard created at ${homePath}`);
  }
  await openInDashboardView(plugin, file as TFile);
}

async function resetHomeDashboard(plugin: Plugin): Promise<void> {
  const folder = normalizePath(DEFAULT_DASHBOARD_FOLDER);
  const homePath = `${folder}/${DEFAULT_HOME_FILENAME}.${DASHBOARD_EXTENSION}`;
  const existing = plugin.app.vault.getAbstractFileByPath(homePath);

  const confirmed = await confirmModal(
    plugin,
    "ホームダッシュボードをリセット",
    existing instanceof TFile
      ? `現在の「${homePath}」を初期テンプレートで上書きします。元のレイアウトとウィジェット設定は失われます。よろしいですか？`
      : `「${homePath}」を初期テンプレートで作成します。`
  );
  if (!confirmed) return;

  const payload = serializeDashboard(getHomeTemplate(DEFAULT_HOME_FILENAME));
  if (existing instanceof TFile) {
    await plugin.app.vault.modify(existing, payload);
    new Notice(`Home dashboard reset: ${homePath}`);
    await openInDashboardView(plugin, existing);
  } else {
    if (!plugin.app.vault.getAbstractFileByPath(folder)) {
      await plugin.app.vault.createFolder(folder);
    }
    const created = await plugin.app.vault.create(homePath, payload);
    new Notice(`Home dashboard created from template: ${homePath}`);
    await openInDashboardView(plugin, created);
  }
}

async function openInDashboardView(plugin: Plugin, file: TFile): Promise<void> {
  // .dashboard is registered to VIEW_TYPE_DASHBOARD via registerExtensions,
  // so openFile routes to DashboardView automatically.
  const leaf = plugin.app.workspace.getLeaf(false);
  await leaf.openFile(file);
  plugin.app.workspace.revealLeaf(leaf);
}

async function uniquePath(plugin: Plugin, desired: string): Promise<string> {
  if (!plugin.app.vault.getAbstractFileByPath(desired)) return desired;
  const dot = desired.lastIndexOf(".");
  const stem = desired.slice(0, dot);
  const ext = desired.slice(dot);
  let i = 2;
  while (plugin.app.vault.getAbstractFileByPath(`${stem} ${i}${ext}`)) i++;
  return `${stem} ${i}${ext}`;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").trim() || "Untitled";
}

class ConfirmModal extends Modal {
  private result = false;

  constructor(
    plugin: Plugin,
    private readonly heading: string,
    private readonly message: string,
    private readonly onDone: (ok: boolean) => void
  ) {
    super(plugin.app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: this.heading });
    contentEl.createEl("p", { text: this.message });

    const buttons = contentEl.createDiv({ cls: "modal-button-container" });
    const cancel = buttons.createEl("button", { text: "キャンセル" });
    cancel.addEventListener("click", () => {
      this.result = false;
      this.close();
    });
    const ok = buttons.createEl("button", { text: "リセット", cls: "mod-warning" });
    ok.addEventListener("click", () => {
      this.result = true;
      this.close();
    });
  }

  onClose(): void {
    this.contentEl.empty();
    this.onDone(this.result);
  }
}

function confirmModal(
  plugin: Plugin,
  heading: string,
  message: string
): Promise<boolean> {
  return new Promise((resolve) => {
    new ConfirmModal(plugin, heading, message, resolve).open();
  });
}

