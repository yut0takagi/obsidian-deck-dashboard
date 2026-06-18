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
  SyncScope,
  TaskFrontmatter,
  TaskRecord,
  backfillTaskIds,
  filterByScope,
  generateTaskId,
  isSyncEnabled,
  listTaskFiles,
  readTask,
  writeTask,
} from "../core/taskModel";

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

export interface SyncConfig {
  personal?: ScopeConfig;
  org?: ScopeConfig;
  self_owner?: string;
  // legacy v1 fields (auto-migrated on read)
  spreadsheetId?: string;
  spreadsheetUrl?: string;
  last_sync?: string;
}

const DEFAULT_SELF_OWNER = "髙木";

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

  async getConfig(): Promise<SyncConfig> {
    const data = ((await this.plugin.loadData()) ?? {}) as PluginDataShape;
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
    if (!raw.self_owner) raw.self_owner = DEFAULT_SELF_OWNER;
    return raw;
  }

  private async saveConfig(next: SyncConfig): Promise<void> {
    const data = ((await this.plugin.loadData()) ?? {}) as PluginDataShape;
    data.sync_config = next;
    await this.plugin.saveData(data);
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
      new Notice(`${scope} スプシは既に設定済み: ${existing.spreadsheetUrl}`);
      return existing;
    }
    const defaultTitle =
      scope === "org" ? "Obsidian Tasks (組織)" : "Obsidian Tasks (個人)";
    const finalTitle = title ?? defaultTitle;
    new Notice(`${scope} のGoogle Sheetsを作成中…`);
    const info = await createSpreadsheet(this.oauth, finalTitle, SHEET_NAME);
    await writeRange(this.oauth, info.spreadsheetId, `${SHEET_NAME}!A1:N1`, [HEADER_ROW]);
    const next: ScopeConfig = {
      spreadsheetId: info.spreadsheetId,
      spreadsheetUrl: info.spreadsheetUrl,
    };
    await this.updateScopeConfig(scope, next);
    new Notice(`✅ ${scope} スプシ作成完了: ${info.spreadsheetUrl}`);
    return next;
  }

  /**
   * Sync a single scope.
   */
  async syncScope(scope: SyncScope): Promise<SyncReport> {
    if (SheetsSync.isSyncing) {
      throw new Error("既に同期中です。完了をお待ちください。");
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
        `${scope} スプシ未設定。'Sheets Sync: Setup ${scope}' を先に実行してください。`
      );
    }
    report.spreadsheetUrl = scopeCfg.spreadsheetUrl;
    const selfOwner = config.self_owner ?? DEFAULT_SELF_OWNER;

    // 1. Backfill missing task_ids
    const newIds = await backfillTaskIds(this.app);
    if (newIds > 0) new Notice(`task_id を ${newIds} 件付与`);

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
          // eslint-disable-next-line no-console
          console.log(`[ND sync] skip out-of-scope row: ${id} (exists in another scope)`);
          continue;
        }
        // Truly new → create md file
        try {
          await this.createVaultTaskFromSheet(sheet.values, now, scope, selfOwner);
          report.pulled++;
        } catch (e) {
          report.errors.push(`pull失敗 ${id}: ${(e as Error).message}`);
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
   * Collect every task_id present anywhere under タスク/詳細/ (no scope filter).
   * Used to suppress duplicate md creation when a sheet row's task already
   * lives in a different scope's folder.
   */
  private async loadAllKnownTaskIds(): Promise<Set<string>> {
    const ids = new Set<string>();
    for (const f of await listTaskFiles(this.app)) {
      const rec = await readTask(this.app, f);
      const id = rec.frontmatter.task_id;
      if (typeof id === "string" && id.length > 0) ids.add(id);
    }
    return ids;
  }

  private async loadVaultTasks(scope: SyncScope, selfOwner: string): Promise<TaskRecord[]> {
    const files = filterByScope(await listTaskFiles(this.app), scope, selfOwner);
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
    const title = String(values[COL.title] ?? "").trim();
    if (!title) throw new Error("タイトルが空");
    const id = String(values[COL.task_id] ?? "").trim() || generateTaskId();
    // Owner resolution:
    // - explicit 担当 cell wins
    // - else personal scope falls back to selfOwner
    // - else org scope routes to 未割当 (never flat root — protects user's
    //   fine-grained personal tasks from being polluted by sheet-side rows)
    const owner =
      cellStr(values[COL.担当]) ||
      (scope === "personal" ? selfOwner : "未割当");
    const fm: TaskFrontmatter = {
      task_id: id,
      PJT: cellStr(values[COL.PJT]),
      期限: cellStr(values[COL.期限]),
      優先度: cellStr(values[COL.優先度]),
      ラベル: cellStr(values[COL.ラベル]),
      status: cellStr(values[COL.status]) || "着手前",
      工数: cellStr(values[COL.工数]),
      depends: cellStr(values[COL.depends]) || "なし",
      担当: owner,
      依頼者: cellStr(values[COL.依頼者]),
      sync_meta: { last_sync: now, origin: "sheets" },
    };
    const fmText = Object.entries(fm)
      .filter(([k, v]) => v !== undefined && v !== "" && k !== "sync_meta")
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");
    const body = `# ${title}\n\nSheets発のタスク。詳細はSheets側を参照。\n`;
    const safeTitle = title.replace(/[\/\\:]/g, "_");
    const folder = `タスク/詳細/${owner}`;
    const existing = this.app.vault.getAbstractFileByPath(folder);
    if (!existing) await this.app.vault.createFolder(folder);
    const path = `${folder}/${safeTitle}.md`;
    const fullText = `---\n${fmText}\nsync_meta:\n  last_sync: ${now}\n  origin: sheets\n---\n${body}`;
    return await this.app.vault.create(path, fullText);
  }

  private async appendLog(scope: SyncScope, report: SyncReport, now: string): Promise<void> {
    const date = now.slice(0, 10);
    const dir = "ログ/sync";
    try {
      const folder = this.app.vault.getAbstractFileByPath(dir);
      if (!folder) await this.app.vault.createFolder(dir);
    } catch {
      /* ignore */
    }
    const path = `${dir}/${date}.jsonl`;
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
  return String(v).trim();
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
  buildRowFromVault,
  fmEquivalent,
  rowEquivalent,
  COL,
  HEADER_ROW,
  SHEETS_OWNED,
  VAULT_OWNED,
};
