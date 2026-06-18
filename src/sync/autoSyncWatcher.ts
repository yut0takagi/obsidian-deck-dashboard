import { App, Notice, Plugin, TAbstractFile, TFile } from "obsidian";
import { GoogleOAuth } from "../auth/googleOAuth";
import { SheetsSync } from "./sheetsSync";

const TASK_DIR = "タスク/詳細";
const DEBOUNCE_MS = 2000;
const SETTLE_AFTER_SYNC_MS = 2000;

interface AutoSyncSettings {
  auto_sync?: boolean;
}

/**
 * Watches the vault for changes to `タスク/詳細/*.md` and triggers a debounced
 * bidirectional sync. Suppresses re-fire while a sync is in progress (and for
 * a short tail afterwards to ignore the writes the sync itself caused).
 */
export class AutoSyncWatcher {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pendingPaths = new Set<string>();
  private lastSyncEnd = 0;
  private sync: SheetsSync;

  constructor(private plugin: Plugin, private app: App) {
    this.sync = new SheetsSync(app, plugin, new GoogleOAuth(plugin));
  }

  async install(): Promise<void> {
    const enabled = await this.isEnabled();
    // eslint-disable-next-line no-console
    console.log("[ND auto-sync] install called, enabled=", enabled);
    if (!enabled) return;
    this.plugin.registerEvent(
      this.app.vault.on("modify", (file: TAbstractFile) => this.onModify(file))
    );
    // eslint-disable-next-line no-console
    console.log("[ND auto-sync] vault.on(modify) listener registered");
  }

  async isEnabled(): Promise<boolean> {
    const data = ((await this.plugin.loadData()) ?? {}) as AutoSyncSettings;
    // Default ON when sheet is configured.
    return data.auto_sync !== false;
  }

  async setEnabled(value: boolean): Promise<void> {
    const data = ((await this.plugin.loadData()) ?? {}) as AutoSyncSettings;
    data.auto_sync = value;
    await this.plugin.saveData(data);
  }

  private onModify(file: TAbstractFile): void {
    if (!(file instanceof TFile)) {
      // eslint-disable-next-line no-console
      console.log("[ND auto-sync] skip: not a TFile", file?.path);
      return;
    }
    if (!file.path.startsWith(TASK_DIR + "/")) {
      // eslint-disable-next-line no-console
      console.log("[ND auto-sync] skip: outside task dir", file.path);
      return;
    }
    if (SheetsSync.isSyncing) {
      // Don't drop — queue it. Flush will re-fire after current sync ends.
      // eslint-disable-next-line no-console
      console.log("[ND auto-sync] queued (sync in progress):", file.path);
      this.pendingPaths.add(file.path);
      return;
    }
    if (Date.now() - this.lastSyncEnd < SETTLE_AFTER_SYNC_MS) {
      // eslint-disable-next-line no-console
      console.log("[ND auto-sync] skip: in cooldown", file.path);
      return;
    }
    // eslint-disable-next-line no-console
    console.log("[ND auto-sync] queued:", file.path);
    this.pendingPaths.add(file.path);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, DEBOUNCE_MS);
  }

  private async flush(): Promise<void> {
    const paths = Array.from(this.pendingPaths);
    this.pendingPaths.clear();
    if (paths.length === 0) return;
    // eslint-disable-next-line no-console
    console.log("[ND auto-sync] flush start, paths=", paths);

    const config = await this.sync.getConfig();
    if (!config.personal?.spreadsheetId && !config.org?.spreadsheetId) {
      // eslint-disable-next-line no-console
      console.log("[ND auto-sync] flush abort: no sheet configured");
      return;
    }

    try {
      const results = await this.sync.syncAll();
      this.lastSyncEnd = Date.now();
      // eslint-disable-next-line no-console
      console.log("[ND auto-sync] flush ok, results=", results);
      const parts: string[] = [];
      if (results.personal && (results.personal.pushed || results.personal.pulled)) {
        parts.push(
          `個人 push:${results.personal.pushed} pull:${results.personal.pulled}`
        );
      }
      if (results.org && (results.org.pushed || results.org.pulled)) {
        parts.push(`組織 push:${results.org.pushed} pull:${results.org.pulled}`);
      }
      if (parts.length > 0) {
        new Notice(`📊 自動同期: ${parts.join(" / ")} (${paths.length}件)`);
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[ND auto-sync] flush failed:", e);
      const msg = (e as Error).message;
      if (msg.includes("429")) {
        new Notice("自動同期: Sheets APIレート制限。30秒後に再試行します。");
        // Re-queue all known paths and retry after cooldown
        for (const p of paths) this.pendingPaths.add(p);
        setTimeout(() => void this.flush(), 30_000);
      } else {
        new Notice(`自動同期エラー: ${msg}`);
      }
    }

    // If new modifications arrived during the sync, flush them now.
    if (this.pendingPaths.size > 0) {
      // eslint-disable-next-line no-console
      console.log("[ND auto-sync] re-flushing (pending during sync):", this.pendingPaths.size);
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        this.timer = null;
        void this.flush();
      }, DEBOUNCE_MS);
    }
  }
}
