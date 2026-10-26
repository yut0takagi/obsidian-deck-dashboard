import { App, Notice, Plugin, TFile } from "obsidian";
import type { GoogleOAuth } from "../auth/googleOAuth";
import {
  appendRows,
  createSpreadsheet,
  readRange,
  valuesBatchUpdate,
  writeRange,
} from "../adapters/googleSheets";
import {
  TaskFrontmatter,
  TaskRecord,
  backfillTaskIds,
  filterByScope,
  generateTaskId,
  isSyncEnabled,
  listTaskFiles,
  readTask,
  serializeFrontmatter,
  writeTask,
} from "../core/taskModel";
import type { SyncScope } from "../core/taskModel";
import { cleanFolder, settingsOf } from "../core/settings";
import { requireSafeVaultPath, safeFolderName, sanitizeFileTitle } from "../core/safePath";
import { warnOnce } from "../core/claudeCommand";
import { readPluginData, updatePluginData } from "../core/pluginData";
import { t } from "../core/i18n";

// Re-export so consumers (e.g. SyncSettingsTab) can import SyncScope from here.
export type { SyncScope };

const HEADER_ROW = [
  "task_id",
  "タイトル",
  "PJT",
  "担当",
  "依頼者",
  "期限",
  "優先度",
  "ラベル",
  "status",
  "工数",
  "depends",
  "vault_link",
  "last_updated",
  "origin",
];

const COL = {
  task_id: 0,
  title: 1,
  PJT: 2,
  担当: 3,
  依頼者: 4,
  期限: 5,
  優先度: 6,
  ラベル: 7,
  status: 8,
  工数: 9,
  depends: 10,
  vault_link: 11,
  last_updated: 12,
  origin: 13,
} as const;

const SHEETS_OWNED = ["title", "PJT", "担当", "依頼者", "期限", "優先度", "ラベル"] as const;
const VAULT_OWNED = ["status", "工数", "depends"] as const;

const SHEET_NAME = "tasks";

export interface ScopeConfig {
  spreadsheetId?: string;
  spreadsheetUrl?: string;
  last_sync?: string;
}

// Per-scope config keyed by SyncScope so that indexing `config[scope]` with a
// `SyncScope` value type-checks. `Partial` keeps each scope optional.
type ScopeConfigMap = Partial<Record<SyncScope, ScopeConfig>>;

export type SyncConfig = ScopeConfigMap & {
  self_owner?: string;
  // legacy v1 fields (auto-migrated on read)
  spreadsheetId?: string;
  spreadsheetUrl?: string;
  last_sync?: string;
};

interface PluginDataShape {
  sync_config?: SyncConfig;
}

export interface SyncReport {
  pulled: number;
  pushed: number;
  conflicts: number;
  errors: string[];
  spreadsheetUrl?: string;
}

export class SheetsSync {
  /** True while syncNow() is executing — used to suppress auto-sync loops. */
  static isSyncing = false;

  constructor(
    private app: App,
    private plugin: Plugin,
    private oauth: GoogleOAuth
  ) {}

  get syncing(): boolean {
    return SheetsSync.isSyncing;
  }

  /** Task folder from the plugin settings ("" while unset). */
  private taskFolder(): string {
    return settingsOf(this.plugin).taskFolder;
  }

  async getConfig(): Promise<SyncConfig> {
    const data = (await readPluginData(this.plugin)) as PluginDataShape;
    const raw = data.sync_config ?? {};
    // Auto-migrate legacy v1 top-level fields → personal scope
    if (raw.spreadsheetId && !raw.personal) {
      raw.personal = {
        spreadsheetId: raw.spreadsheetId,
        spreadsheetUrl: raw.spreadsheetUrl,
        last_sync: raw.last_sync,
      };
      delete raw.spreadsheetId;
      delete raw.spreadsheetUrl;
      delete raw.last_sync;
      await this.saveConfig(raw);
    }
    return raw;
  }

  private async saveConfig(next: SyncConfig): Promise<void> {
    await updatePluginData(this.plugin, (data) => {
      data.sync_config = next;
    });
  }

  private async updateScopeConfig(scope: SyncScope, patch: Partial<ScopeConfig>): Promise<void> {
    const config = await this.getConfig();
    const current = config[scope] ?? {};
    config[scope] = { ...current, ...patch };
    await this.saveConfig(config);
  }

  /**
   * Create a spreadsheet for the given scope. No-op if already configured.
   */
  async setupSheet(scope: SyncScope, title?: string): Promise<ScopeConfig> {
    const config = await this.getConfig();
    const existing = config[scope];
    if (existing?.spreadsheetId) {
      new Notice(t().sheetsSyncSheetIsAlreadyConfigured(scope, existing.spreadsheetUrl));
      return existing;
    }
    const defaultTitle =
      scope === "org" ? t().sheetsSyncObsidianTasksOrganization : t().sheetsSyncObsidianTasksPersonal;
    const finalTitle = title ?? defaultTitle;
    new Notice(t().sheetsSyncGoogleSheetIsBeingCreated(scope));
    const info = await createSpreadsheet(this.oauth, finalTitle, SHEET_NAME);
    await writeRange(this.oauth, info.spreadsheetId, `${SHEET_NAME}!A1:N1`, [HEADER_ROW]);
    const next: ScopeConfig = {
      spreadsheetId: info.spreadsheetId,
      spreadsheetUrl: info.spreadsheetUrl,
    };
    await this.updateScopeConfig(scope, next);
    new Notice(t().sheetsSyncSheetCreated(scope, info.spreadsheetUrl));
    return next;
  }

  /**
   * Sync a single scope.
   */
  async syncScope(scope: SyncScope): Promise<SyncReport> {
    if (SheetsSync.isSyncing) {
      throw new Error(t().sheetsSyncSyncIsAlreadyRunningPlease);
    }
    SheetsSync.isSyncing = true;
    try {
      return await this.runSyncInternal(scope);
    } finally {
      SheetsSync.isSyncing = false;
    }
  }

  /**
   * Sync both scopes if configured. Skips scopes without spreadsheetId silently.
   */
  async syncAll(): Promise<{ personal: SyncReport | null; org: SyncReport | null }> {
    const config = await this.getConfig();
    const result: { personal: SyncReport | null; org: SyncReport | null } = {
      personal: null,
      org: null,
    };
    if (config.personal?.spreadsheetId) {
      result.personal = await this.syncScope("personal");
    }
    if (config.org?.spreadsheetId) {
      result.org = await this.syncScope("org");
    }
    return result;
  }

  /**
   * Backwards-compat alias used by older code paths.
   */
  async syncNow(): Promise<SyncReport> {
    return await this.syncScope("personal");
  }

  private async runSyncInternal(scope: SyncScope): Promise<SyncReport> {
    const report: SyncReport = { pulled: 0, pushed: 0, conflicts: 0, errors: [] };
    const config = await this.getConfig();
    const scopeCfg = config[scope];
    if (!scopeCfg?.spreadsheetId) {
      throw new Error(
        t().sheetsSyncSheetIsNotConfiguredRun(scope, scope)
      );
    }
    report.spreadsheetUrl = scopeCfg.spreadsheetUrl;
    const selfOwner = config.self_owner?.trim() ?? "";
    // The org sheet is "everyone's folders except mine". Without knowing which
    // folder is mine, the user's own tasks would be pushed to the shared sheet.
    if (scope === "org" && !selfOwner) {
      throw new Error(
        t().sheetsSyncSelfOwnerIsNotSet
      );
    }

    const taskFolder = this.taskFolder();
    if (!taskFolder) {
      throw new Error(t().setFirstNotice(t().taskFolderName));
    }

    // 1. Backfill missing task_ids
    const newIds = await backfillTaskIds(this.app, taskFolder);
    if (newIds > 0) new Notice(t().sheetsSyncAssignedTaskIdToTasks(newIds));

    // 2. Load both sides
    const vaultTasks = await this.loadVaultTasks(scope, selfOwner);
    const sheetRows = await readRange(
      this.oauth,
      scopeCfg.spreadsheetId,
      `${SHEET_NAME}!A2:N`
    );

    // Build "known anywhere in vault" task_id set to avoid creating duplicate
    // md files when a sheet row belongs to a different scope (e.g. personal
    // task surfaced into the org sheet by an earlier sync).
    const allKnownIds = await this.loadAllKnownTaskIds();

    const vaultById = new Map<string, TaskRecord>();
    for (const t of vaultTasks) {
      if (t.frontmatter.task_id) vaultById.set(t.frontmatter.task_id, t);
    }
    const sheetByIdRow = new Map<string, { row: number; values: string[] }>();
    sheetRows.forEach((vals, idx) => {
      const id = String(vals[COL.task_id] ?? "").trim();
      if (id) sheetByIdRow.set(id, { row: idx + 2, values: vals });
    });

    const now = new Date().toISOString();

    // 3. Reconcile each task that exists in either side
    const allIds = new Set<string>([...vaultById.keys(), ...sheetByIdRow.keys()]);

    const updates: { range: string; values: (string | null)[][] }[] = [];
    const appends: (string | null)[][] = [];

    for (const id of allIds) {
      const vault = vaultById.get(id);
      const sheet = sheetByIdRow.get(id);

      if (vault && !sheet) {
        // New in vault → append to sheet
        appends.push(buildRowFromVault(vault, "vault", now));
        const fm = { ...vault.frontmatter };
        fm.sync_meta = {
          ...(fm.sync_meta ?? {}),
          last_sync: now,
          origin: "vault",
        };
        await writeTask(this.app, vault, fm);
        report.pushed++;
        continue;
      }

      if (!vault && sheet) {
        // Sheet has the row but the current scope's vault doesn't.
        // If the task_id exists elsewhere in vault (different scope), skip —
        // it'll be reconciled by that scope's own sync.
        if (allKnownIds.has(id)) {
          // Out-of-scope row: exists in another scope's vault; let that scope reconcile it.
          continue;
        }
        // Truly new → create md file
        try {
          await this.createVaultTaskFromSheet(sheet.values, now, scope, selfOwner);
          report.pulled++;
        } catch (e) {
          report.errors.push(t().sheetsSyncPullFailed(id, (e as Error).message));
        }
        continue;
      }

      if (vault && sheet) {
        // Both sides exist → merge based on column ownership
        const { mergedFm, mergedRow, conflict } = mergeBoth(vault, sheet.values, now);

        const vaultNeedsWrite = !fmEquivalent(vault.frontmatter, mergedFm);
        const sheetNeedsWrite = !rowEquivalent(sheet.values, mergedRow);

        if (sheetNeedsWrite) {
          updates.push({
            range: `${SHEET_NAME}!A${sheet.row}:N${sheet.row}`,
            values: [mergedRow],
          });
          report.pushed++;
        }
        if (vaultNeedsWrite) {
          await writeTask(this.app, vault, mergedFm);
          report.pulled++;
        }
        if (conflict) report.conflicts++;
      }
    }

    // 4. Apply batched updates to sheet (single API call vs N calls → avoids 429)
    if (updates.length > 0) {
      await valuesBatchUpdate(this.oauth, scopeCfg.spreadsheetId, updates);
    }
    if (appends.length > 0) {
      await appendRows(
        this.oauth,
        scopeCfg.spreadsheetId,
        `${SHEET_NAME}!A1`,
        appends
      );
    }

    // 5. Save scope last_sync
    await this.updateScopeConfig(scope, { last_sync: now });

    // 6. Log
    await this.appendLog(scope, report, now);

    return report;
  }

  /**
   * Collect every task_id present anywhere under the task folder (no scope filter).
   * Used to suppress duplicate md creation when a sheet row's task already
   * lives in a different scope's folder.
   */
  private async loadAllKnownTaskIds(): Promise<Set<string>> {
    const ids = new Set<string>();
    for (const f of await listTaskFiles(this.app, this.taskFolder())) {
      const rec = await readTask(this.app, f);
      const id = rec.frontmatter.task_id;
      if (typeof id === "string" && id.length > 0) ids.add(id);
    }
    return ids;
  }

  private async loadVaultTasks(scope: SyncScope, selfOwner: string): Promise<TaskRecord[]> {
    const taskFolder = this.taskFolder();
    const files = filterByScope(
      await listTaskFiles(this.app, taskFolder),
      scope,
      selfOwner,
      taskFolder
    );
    const out: TaskRecord[] = [];
    for (const f of files) {
      const rec = await readTask(this.app, f);
      if (!isSyncEnabled(rec.frontmatter)) continue;
      out.push(rec);
    }
    return out;
  }

  private async createVaultTaskFromSheet(
    values: string[],
    now: string,
    scope: SyncScope,
    selfOwner: string
  ): Promise<TFile> {
    const taskFolder = this.taskFolder();
    const plan = planSheetTask(values, now, scope, selfOwner, taskFolder);
    if (plan.rejectedOwner !== null && warnOnce(rejectedOwners, plan.rejectedOwner)) {
      new Notice(
        t().sheetsSyncOwnerCanTBeUsed(plan.rejectedOwner.replace(/\s+/g, " ")),
        10000
      );
    }
    const folder = requireSafeVaultPath(plan.folder, taskFolder);
    let acc = "";
    for (const part of folder.split("/")) {
      acc = acc ? `${acc}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(acc)) await this.app.vault.createFolder(acc);
    }
    return await this.app.vault.create(requireSafeVaultPath(plan.path, folder), plan.content);
  }

  private async appendLog(scope: SyncScope, report: SyncReport, now: string): Promise<void> {
    const date = now.slice(0, 10);
    const configured = settingsOf(this.plugin).syncLogFolder;
    if (!configured) return; // no log folder configured → keep no log
    const dir = requireSafeVaultPath(configured, "");
    try {
      const folder = this.app.vault.getAbstractFileByPath(dir);
      if (!folder) await this.app.vault.createFolder(dir);
    } catch {
      /* ignore */
    }
    const path = requireSafeVaultPath(`${dir}/${date}.jsonl`, dir);
    const line =
      JSON.stringify({
        ts: now,
        scope,
        pulled: report.pulled,
        pushed: report.pushed,
        conflicts: report.conflicts,
        errors: report.errors,
      }) + "\n";
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
      const cur = await this.app.vault.read(existing);
      await this.app.vault.modify(existing, cur + line);
    } else {
      await this.app.vault.create(path, line);
    }
  }
}

function buildRowFromVault(
  rec: TaskRecord,
  origin: "vault" | "sheets",
  now: string
): (string | null)[] {
  const fm = rec.frontmatter;
  return [
    fm.task_id ?? "",
    rec.title,
    cellStr(fm.PJT),
    cellStr(fm.担当),
    cellStr(fm.依頼者),
    cellStr(fm.期限),
    cellStr(fm.優先度),
    cellStr(fm.ラベル),
    cellStr(fm.status),
    cellStr(fm.工数),
    cellStr(fm.depends),
    rec.path,
    now,
    origin,
  ];
}

interface MergeResult {
  mergedFm: TaskFrontmatter;
  mergedRow: (string | null)[];
  conflict: boolean;
}

/**
 * Column-ownership merge.
 * - Sheets owns: title (file rename out of scope), PJT, 担当, 依頼者, 期限, 優先度, ラベル
 *   → take sheet value, write to vault frontmatter
 * - Vault owns: status, 工数, depends
 *   → take vault value, write to sheet
 * - Conflict detection: when both sides changed since last_sync, log it but apply ownership.
 */
/** Owner values already reported as unusable this session. */
const rejectedOwners = new Set<string>();

const UNASSIGNED = "未割当";

export interface SheetTaskPlan {
  folder: string;
  path: string;
  content: string;
  /** The 担当 cell when it was not usable as a folder name. */
  rejectedOwner: string | null;
}

/**
 * Where and what to write for a sheet row that has no note yet. Sheet cells
 * are edited by other people, so the owner must be exactly one safe folder
 * name (otherwise the note goes to 未割当), the title becomes a plain file
 * name, and every value is written as a single-line YAML scalar.
 */
function planSheetTask(
  values: string[],
  now: string,
  scope: SyncScope,
  selfOwner: string,
  taskFolder: string
): SheetTaskPlan {
  const title = String(values[COL.title] ?? "").trim();
  if (!title) throw new Error(t().sheetsSyncTitleIsEmpty);
  const id = String(values[COL.task_id] ?? "").trim() || generateTaskId();
  // Owner resolution:
  // - explicit 担当 cell wins (when it is a usable folder name)
  // - else personal scope falls back to selfOwner
  // - else org scope routes to 未割当 (never flat root — protects user's
  //   fine-grained personal tasks from being polluted by sheet-side rows)
  const ownerCell = cellStr(values[COL.担当]);
  const ownerFolder = ownerCell ? safeFolderName(ownerCell) : null;
  const rejectedOwner = ownerCell && !ownerFolder ? ownerCell : null;
  const fallback = scope === "personal" ? safeFolderName(selfOwner) ?? UNASSIGNED : UNASSIGNED;
  const owner = ownerFolder ?? (rejectedOwner ? UNASSIGNED : fallback);
  const fm: TaskFrontmatter = {
    task_id: id,
    PJT: cellStr(values[COL.PJT]),
    期限: cellStr(values[COL.期限]),
    優先度: cellStr(values[COL.優先度]),
    ラベル: cellStr(values[COL.ラベル]),
    status: cellStr(values[COL.status]) || "着手前",
    工数: cellStr(values[COL.工数]),
    depends: cellStr(values[COL.depends]) || "なし",
    担当: ownerCell || owner,
    依頼者: cellStr(values[COL.依頼者]),
  };
  for (const k of Object.keys(fm)) if (fm[k] === "") delete fm[k];
  fm.sync_meta = { last_sync: now, origin: "sheets" };
  const fileTitle = sanitizeFileTitle(title);
  const folder = `${cleanFolder(taskFolder)}/${owner}`;
  const heading = title.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
  const body = t().sheetsSyncTaskFromSheetsSeeThe(heading);
  return {
    folder,
    path: `${folder}/${fileTitle}.md`,
    content: `---\n${serializeFrontmatter(fm)}---\n${body}`,
    rejectedOwner,
  };
}

function mergeBoth(
  vault: TaskRecord,
  sheetRow: string[],
  now: string
): MergeResult {
  const vfm = vault.frontmatter;
  const lastSync = vfm.sync_meta?.last_sync;
  const sheetLast = String(sheetRow[COL.last_updated] ?? "");

  // Sheets-owned fields flow into vault
  const merged: TaskFrontmatter = {
    ...vfm,
    PJT: cellStr(sheetRow[COL.PJT]) || vfm.PJT,
    担当: cellStr(sheetRow[COL.担当]) || vfm.担当,
    依頼者: cellStr(sheetRow[COL.依頼者]) || vfm.依頼者,
    期限: cellStr(sheetRow[COL.期限]) || vfm.期限,
    優先度: cellStr(sheetRow[COL.優先度]) || vfm.優先度,
    ラベル: cellStr(sheetRow[COL.ラベル]) || vfm.ラベル,
    sync_meta: {
      ...(vfm.sync_meta ?? {}),
      last_sync: now,
      origin: "vault",
      sheet_row: vfm.sync_meta?.sheet_row,
    },
  };

  // Vault-owned fields flow into sheet
  const mergedRow: (string | null)[] = [
    vfm.task_id ?? "",
    vault.title,
    cellStr(sheetRow[COL.PJT]) || cellStr(vfm.PJT),
    cellStr(sheetRow[COL.担当]) || cellStr(vfm.担当),
    cellStr(sheetRow[COL.依頼者]) || cellStr(vfm.依頼者),
    cellStr(sheetRow[COL.期限]) || cellStr(vfm.期限),
    cellStr(sheetRow[COL.優先度]) || cellStr(vfm.優先度),
    cellStr(sheetRow[COL.ラベル]) || cellStr(vfm.ラベル),
    cellStr(vfm.status),
    cellStr(vfm.工数),
    cellStr(vfm.depends),
    vault.path,
    now,
    "vault",
  ];

  // Conflict: both sheet last_updated AND vault mtime are newer than last_sync
  let conflict = false;
  if (lastSync) {
    const lastSyncTs = Date.parse(lastSync);
    const vaultChanged = vault.lastModified > lastSyncTs;
    const sheetChanged = sheetLast ? Date.parse(sheetLast) > lastSyncTs : false;
    if (vaultChanged && sheetChanged) conflict = true;
  }

  return { mergedFm: merged, mergedRow, conflict };
}

function cellStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v).trim();
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean" || typeof v === "bigint") {
    return String(v).trim();
  }
  return "";
}

/**
 * Compare two frontmatters for content equivalence — ignores sync_meta
 * (which would always differ because of last_sync timestamps).
 */
function fmEquivalent(a: TaskFrontmatter, b: TaskFrontmatter): boolean {
  const keys: (keyof TaskFrontmatter)[] = [
    "task_id",
    "PJT",
    "期限",
    "優先度",
    "ラベル",
    "status",
    "工数",
    "depends",
    "担当",
    "依頼者",
  ];
  return keys.every((k) => cellStr(a[k]) === cellStr(b[k]));
}

/**
 * Compare a sheet row's value cells to a candidate row, ignoring last_updated
 * and origin (which always change on sync).
 */
function rowEquivalent(current: string[], candidate: (string | null)[]): boolean {
  // Check all columns except last_updated (M) and origin (N)
  for (let i = 0; i <= COL.vault_link; i++) {
    if (cellStr(current[i]) !== cellStr(candidate[i])) return false;
  }
  return true;
}

// Re-exports for tests
export const __test = {
  mergeBoth,
  planSheetTask,
  buildRowFromVault,
  fmEquivalent,
  rowEquivalent,
  COL,
  HEADER_ROW,
  SHEETS_OWNED,
  VAULT_OWNED,
};
