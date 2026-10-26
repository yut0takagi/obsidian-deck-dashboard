import { Modal, Notice, Plugin, TFile, normalizePath } from "obsidian";
import { DASHBOARD_EXTENSION, VIEW_TYPE_DASHBOARD, VIEW_TYPE_MAIL } from "./core/constants";
import { findLeafShowingFile, startupLeafMode } from "./core/homeLeaf";
import { dashboardFolderPath, homeDashboardPath, type DeckHost } from "./core/settings";
import { t } from "./core/i18n";
import { requireSafeVaultPath } from "./core/safePath";
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

/** The plugin as seen by the commands. */
export type CommandHost = Plugin & DeckHost;

export function registerCommands(plugin: CommandHost): void {
  plugin.addCommand({
    id: "create-new",
    name: "Create new dashboard",
    callback: async () => {
      await createNewDashboard(plugin, "Untitled", createDefaultDashboard("Untitled")).catch(
        (e: unknown) => new Notice((e as Error).message, 8000)
      );
    },
  });

  plugin.addCommand({
    id: "open-home",
    name: "Open home dashboard",
    callback: async () => {
      await openHomeDashboard(plugin).catch((e: unknown) => new Notice((e as Error).message, 8000));
    },
  });

  plugin.addCommand({
    id: "open-mail",
    name: t().commandsOpenMailGmail,
    callback: async () => {
      const { workspace } = plugin.app;
      let leaf = workspace.getLeavesOfType(VIEW_TYPE_MAIL)[0];
      if (!leaf) {
        leaf = workspace.getLeaf("tab");
        await leaf.setViewState({ type: VIEW_TYPE_MAIL, active: true });
      }
      void workspace.revealLeaf(leaf);
    },
  });

  plugin.addCommand({
    id: "reset-home",
    name: "Reset home dashboard to template",
    callback: async () => {
      await resetHomeDashboard(plugin).catch((e: unknown) => new Notice((e as Error).message, 8000));
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
      new Notice(t().commandsSignedOutOfGoogleCalendar);
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
        new Notice(t().commandsCalendars(cals.length, lines.join("\n")), 15000);
      } catch (e) {
        new Notice(t().commandsFailedToRetrieve((e as Error).message));
      }
    },
  });

  plugin.addCommand({
    id: "sheets-sync-setup-personal",
    name: t().commandsSheetsSyncSetupPersonalSheet,
    callback: async () => {
      try {
        const sync = new SheetsSync(plugin.app, plugin, new GoogleOAuth(plugin));
        const cfg = await sync.setupSheet("personal");
        if (cfg.spreadsheetUrl) {
          new Notice(t().commandsPersonalSheetCreated(cfg.spreadsheetUrl), 10000);
        }
      } catch (e) {
        new Notice(t().commandsSetupFailed((e as Error).message));
      }
    },
  });

  plugin.addCommand({
    id: "sheets-sync-setup-org",
    name: t().commandsSheetsSyncSetupOrganizationSheet,
    callback: async () => {
      try {
        const sync = new SheetsSync(plugin.app, plugin, new GoogleOAuth(plugin));
        const cfg = await sync.setupSheet("org");
        if (cfg.spreadsheetUrl) {
          new Notice(t().commandsOrganizationSheetCreated(cfg.spreadsheetUrl), 10000);
        }
      } catch (e) {
        new Notice(t().commandsSetupFailed((e as Error).message));
      }
    },
  });

  plugin.addCommand({
    id: "sheets-sync-now",
    name: "Sheets Sync: Sync now (both scopes)",
    callback: async () => {
      try {
        const sync = new SheetsSync(plugin.app, plugin, new GoogleOAuth(plugin));
        new Notice(t().commandsStartingSheetsSync);
        const results = await sync.syncAll();
        const parts: string[] = [];
        if (results.personal) {
          parts.push(
            t().commandsPersonalPushPull(results.personal.pushed, results.personal.pulled)
          );
        }
        if (results.org) {
          parts.push(t().commandsOrganizationPushPull(results.org.pushed, results.org.pulled));
        }
        new Notice(t().commandsSyncComplete(parts.join(" / ") || t().nothingToSync));
      } catch (e) {
        new Notice(t().commandsSyncFailed((e as Error).message));
      }
    },
  });

  plugin.addCommand({
    id: "sheets-sync-now-personal",
    name: t().commandsSheetsSyncSyncNowPersonal,
    callback: async () => {
      try {
        const sync = new SheetsSync(plugin.app, plugin, new GoogleOAuth(plugin));
        const report = await sync.syncScope("personal");
        new Notice(t().commandsPersonalSyncCompletePushPull(report.pushed, report.pulled));
      } catch (e) {
        new Notice(t().commandsSyncFailed((e as Error).message));
      }
    },
  });

  plugin.addCommand({
    id: "sheets-sync-now-org",
    name: t().commandsSheetsSyncSyncNowOrganization,
    callback: async () => {
      try {
        const sync = new SheetsSync(plugin.app, plugin, new GoogleOAuth(plugin));
        const report = await sync.syncScope("org");
        new Notice(t().commandsOrganizationSyncCompletePushPull(report.pushed, report.pulled));
      } catch (e) {
        new Notice(t().commandsSyncFailed((e as Error).message));
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
        lines.push(t().commandsYourName(cfg.self_owner ?? t().notSetPlaceholder));
        if (cfg.personal?.spreadsheetId) {
          lines.push(
            t().commandsPersonalLastSync(cfg.personal.spreadsheetUrl, cfg.personal.last_sync ?? t().neverSynced)
          );
        } else {
          lines.push(t().commandsPersonalNotConfigured);
        }
        if (cfg.org?.spreadsheetId) {
          lines.push(
            t().commandsOrganizationLastSync(cfg.org.spreadsheetUrl, cfg.org.last_sync ?? t().neverSynced)
          );
        } else {
          lines.push(t().commandsOrganizationNotConfigured);
        }
        const watcher = new AutoSyncWatcher(plugin, plugin.app);
        lines.push(t().commandsAutoSync((await watcher.isEnabled()) ? "ON" : "OFF"));
        new Notice(lines.join("\n"));
      } catch (e) {
        new Notice(t().commandsFailedToRetrieve((e as Error).message));
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
        t().commandsAutoSyncTakesEffectAfter(!current ? "ON" : "OFF")
      );
    },
  });
}

function activeDashboardView(plugin: Plugin): DashboardView | null {
  return plugin.app.workspace.getActiveViewOfType(DashboardView) ?? null;
}

async function createNewDashboard(
  plugin: CommandHost,
  baseTitle: string,
  initial: Dashboard
): Promise<TFile> {
  const configured = dashboardFolderPath(plugin.settings);
  const folder = configured ? requireSafeVaultPath(configured, "") : "";
  if (folder) await ensureFolder(plugin, folder);
  const baseName = sanitizeFilename(baseTitle);
  const path = requireSafeVaultPath(
    await uniquePath(plugin, normalizePath(`${folder ? folder + "/" : ""}${baseName}.${DASHBOARD_EXTENSION}`)),
    folder
  );
  const file = await plugin.app.vault.create(path, serializeDashboard(initial));
  await openInDashboardView(plugin, file);
  new Notice(`Dashboard created: ${file.path}`);
  return file;
}

/** Create every missing folder along `path` ("a/b/c"). */
async function ensureFolder(plugin: Plugin, path: string): Promise<void> {
  let acc = "";
  for (const part of path.split("/").filter(Boolean)) {
    acc = acc ? `${acc}/${part}` : part;
    if (!plugin.app.vault.getAbstractFileByPath(acc)) {
      await plugin.app.vault.createFolder(acc);
    }
  }
}

function parentFolder(path: string): string {
  const i = path.lastIndexOf("/");
  return i > 0 ? path.slice(0, i) : "";
}

function homeTemplatePayload(): string {
  const s = t();
  return serializeDashboard(getHomeTemplate(s.homeTitle, s));
}

/**
 * Open the home dashboard. If a tab already shows it, switch to that tab.
 * `atStartup` avoids replacing the note the user had open: it reuses an
 * empty tab or opens a new one.
 */
export async function openHomeDashboard(
  plugin: CommandHost,
  opts: { atStartup?: boolean } = {}
): Promise<void> {
  const { workspace } = plugin.app;
  const homePath = requireSafeVaultPath(normalizePath(homeDashboardPath(plugin.settings)), "");
  const open = findLeafShowingFile(workspace.getLeavesOfType(VIEW_TYPE_DASHBOARD), homePath);
  if (open) {
    workspace.setActiveLeaf(open, { focus: true });
    await workspace.revealLeaf(open);
    return;
  }

  const existing = plugin.app.vault.getAbstractFileByPath(homePath);
  let file: TFile;
  if (existing instanceof TFile) {
    file = existing;
  } else {
    const folder = parentFolder(homePath);
    if (folder) await ensureFolder(plugin, folder);
    file = await plugin.app.vault.create(homePath, homeTemplatePayload());
    new Notice(`Home dashboard created at ${homePath}`);
  }
  if (opts.atStartup) {
    const recent = workspace.getMostRecentLeaf();
    const mode = startupLeafMode(recent?.view.getViewType());
    const leaf = mode === "reuse" && recent ? recent : workspace.getLeaf("tab");
    await leaf.openFile(file);
    workspace.setActiveLeaf(leaf, { focus: true });
    return;
  }
  await openInDashboardView(plugin, file);
}

async function resetHomeDashboard(plugin: CommandHost): Promise<void> {
  const homePath = requireSafeVaultPath(normalizePath(homeDashboardPath(plugin.settings)), "");
  const existing = plugin.app.vault.getAbstractFileByPath(homePath);

  const confirmed = await confirmModal(
    plugin,
    t().commandsResetHomeDashboard,
    existing instanceof TFile
      ? t().commandsTheDashboardWillBeOverwritten(homePath)
      : t().commandsWillBeCreatedFromThe(homePath)
  );
  if (!confirmed) return;

  const payload = homeTemplatePayload();
  if (existing instanceof TFile) {
    await plugin.app.vault.modify(existing, payload);
    new Notice(`Home dashboard reset: ${homePath}`);
    await openInDashboardView(plugin, existing);
  } else {
    const folder = parentFolder(homePath);
    if (folder) await ensureFolder(plugin, folder);
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
  void plugin.app.workspace.revealLeaf(leaf);
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
    const cancel = buttons.createEl("button", { text: t().commandsCancel });
    cancel.addEventListener("click", () => {
      this.result = false;
      this.close();
    });
    const ok = buttons.createEl("button", { text: t().commandsReset, cls: "mod-warning" });
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

