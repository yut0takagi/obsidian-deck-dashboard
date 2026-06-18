import { App, TFile } from "obsidian";

export interface TaskFrontmatter {
  task_id?: string;
  PJT?: string;
  期限?: string;
  優先度?: string;
  ラベル?: string;
  status?: string;
  工数?: string;
  depends?: string;
  担当?: string;
  依頼者?: string;
  sync?: boolean | "false";
  sync_meta?: {
    sheet_row?: number;
    last_sync?: string;
    origin?: "vault" | "sheets";
  };
  [key: string]: unknown;
}

export interface TaskRecord {
  file: TFile;
  path: string;
  title: string;
  frontmatter: TaskFrontmatter;
  body: string;
  rawFrontmatter: string;
  lastModified: number;
}

export const TASK_DIR = "タスク/詳細";
const FM_RE = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

export type SyncScope = "personal" | "org";

/**
 * List all task detail files in タスク/詳細/ (recursive, all subfolders).
 */
export async function listTaskFiles(app: App): Promise<TFile[]> {
  const all = app.vault.getMarkdownFiles();
  return all.filter((f) => f.path.startsWith(TASK_DIR + "/"));
}

/**
 * Return the owner segment for a task file path.
 * - `タスク/詳細/foo.md` (flat) → null (defaults to "self")
 * - `タスク/詳細/高木悠人/foo.md` → "高木悠人"
 * - `タスク/詳細/嵯峨/foo.md` → "嵯峨"
 */
export function ownerFromPath(path: string): string | null {
  const stripped = path.startsWith(TASK_DIR + "/") ? path.slice(TASK_DIR.length + 1) : path;
  const parts = stripped.split("/");
  if (parts.length < 2) return null; // flat file
  return parts[0];
}

/**
 * Filter task files by scope.
 *
 * - "personal": flat files (fine-grained personal todos) + selfOwner subfolder
 * - "org": member subfolders EXCLUDING the selfOwner folder
 *
 * Rationale: personal todos (whether at flat root or in the self folder) are
 * fine-grained internal items the user doesn't want surfaced to the team.
 * Only other members' folders are shared org work.
 */
export function filterByScope(
  files: TFile[],
  scope: SyncScope,
  selfOwner: string
): TFile[] {
  if (scope === "org") {
    return files.filter((f) => {
      const owner = ownerFromPath(f.path);
      return owner !== null && owner !== selfOwner;
    });
  }
  return files.filter((f) => {
    const owner = ownerFromPath(f.path);
    return owner === null || owner === selfOwner;
  });
}

export async function readTask(app: App, file: TFile): Promise<TaskRecord> {
  const raw = await app.vault.read(file);
  const m = FM_RE.exec(raw);
  let rawFm = "";
  let body = raw;
  let fm: TaskFrontmatter = {};
  if (m) {
    rawFm = m[1];
    body = m[2];
    fm = parseFrontmatter(rawFm);
  }
  const title = file.basename;
  return {
    file,
    path: file.path,
    title,
    frontmatter: fm,
    body,
    rawFrontmatter: rawFm,
    lastModified: file.stat.mtime,
  };
}

export async function writeTask(
  app: App,
  record: TaskRecord,
  nextFm: TaskFrontmatter,
  nextBody?: string
): Promise<void> {
  const fmText = serializeFrontmatter(nextFm);
  const body = nextBody ?? record.body;
  const out = `---\n${fmText}---\n${body}`;
  await app.vault.modify(record.file, out);
}

/**
 * Parse YAML-ish frontmatter. Supports flat key:value plus nested sync_meta block.
 * We intentionally avoid pulling in a full YAML lib — the schema is constrained.
 */
export function parseFrontmatter(raw: string): TaskFrontmatter {
  const out: TaskFrontmatter = {};
  const lines = raw.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const m = /^([^:\s][^:]*?):\s*(.*)$/.exec(line);
    if (!m) {
      i++;
      continue;
    }
    const key = m[1].trim();
    const value = m[2].trim();
    if (key === "sync_meta" && value === "") {
      // Nested block: read indented children
      const meta: NonNullable<TaskFrontmatter["sync_meta"]> = {};
      i++;
      while (i < lines.length && /^\s+/.test(lines[i])) {
        const child = /^\s+([^:]+):\s*(.*)$/.exec(lines[i]);
        if (child) {
          const ck = child[1].trim();
          const cv = child[2].trim();
          if (ck === "sheet_row") meta.sheet_row = Number(cv) || undefined;
          else if (ck === "last_sync") meta.last_sync = cv || undefined;
          else if (ck === "origin")
            meta.origin = (cv === "vault" || cv === "sheets") ? cv : undefined;
        }
        i++;
      }
      out.sync_meta = meta;
      continue;
    }
    if (value === "true" || value === "false") {
      out[key] = value === "true";
    } else {
      out[key] = value;
    }
    i++;
  }
  return out;
}

export function serializeFrontmatter(fm: TaskFrontmatter): string {
  const keys: (keyof TaskFrontmatter)[] = [
    "PJT",
    "期限",
    "優先度",
    "ラベル",
    "status",
    "工数",
    "depends",
    "担当",
    "依頼者",
    "task_id",
    "sync",
  ];
  const lines: string[] = [];
  for (const k of keys) {
    const val = scalarToString(fm[k]);
    if (val === null) continue;
    lines.push(`${k}: ${val}`);
  }
  // Preserve unknown keys in stable order
  const knownKeys = new Set<string>(keys as string[]);
  for (const k of Object.keys(fm)) {
    if (knownKeys.has(k)) continue;
    if (k === "sync_meta") continue;
    const val = scalarToString(fm[k]);
    if (val === null) continue;
    lines.push(`${k}: ${val}`);
  }
  if (fm.sync_meta) {
    lines.push("sync_meta:");
    if (fm.sync_meta.sheet_row !== undefined)
      lines.push(`  sheet_row: ${fm.sync_meta.sheet_row}`);
    if (fm.sync_meta.last_sync !== undefined)
      lines.push(`  last_sync: ${fm.sync_meta.last_sync}`);
    if (fm.sync_meta.origin !== undefined)
      lines.push(`  origin: ${fm.sync_meta.origin}`);
  }
  return lines.join("\n") + "\n";
}

/**
 * Serialize a frontmatter scalar (string / number / boolean) to a line value.
 * Returns null for nullish or non-scalar values so the caller can skip them.
 * Frontmatter fields are always scalars at runtime; objects (e.g. sync_meta)
 * are handled separately and never reach here.
 */
function scalarToString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

/**
 * Generate task_id format: t-YYYYMMDD-{6chars}
 */
export function generateTaskId(now: Date = new Date()): string {
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const arr = new Uint8Array(3);
  crypto.getRandomValues(arr);
  const rand = Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
  return `t-${yyyy}${mm}${dd}-${rand}`;
}

export function isSyncEnabled(fm: TaskFrontmatter): boolean {
  if (fm.sync === false) return false;
  if (fm.sync === "false") return false;
  return true;
}

/**
 * Ensure every task md has a task_id. Returns count of newly assigned ids.
 */
export async function backfillTaskIds(app: App): Promise<number> {
  const files = await listTaskFiles(app);
  let count = 0;
  for (const f of files) {
    const rec = await readTask(app, f);
    if (rec.frontmatter.task_id) continue;
    if (!isSyncEnabled(rec.frontmatter)) continue;
    const nextFm: TaskFrontmatter = {
      ...rec.frontmatter,
      task_id: generateTaskId(new Date(rec.file.stat.ctime)),
    };
    await writeTask(app, rec, nextFm);
    count++;
  }
  return count;
}
