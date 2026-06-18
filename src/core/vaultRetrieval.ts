import type { App, TFile } from "obsidian";

export interface Candidate {
  path: string;
  excerpt: string;
  score: number;
}

export interface RetrievalOptions {
  topK: number;
  excerptChars: number;
  folders: string[]; // empty = whole vault (minus excludes)
  excludeFolders: string[];
}

export const ALWAYS_EXCLUDED = [".trash", ".claude", "node_modules"];
export const DEFAULT_EXCLUDES = ["ログ", "アーカイブ", "添付", "inbox/temp"];

export async function selectCandidates(
  app: App,
  query: string,
  opts: RetrievalOptions
): Promise<Candidate[]> {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  const files: TFile[] = app.vault.getMarkdownFiles();
  const excludes = [
    app.vault.configDir,
    ...ALWAYS_EXCLUDED,
    ...(opts.excludeFolders ?? DEFAULT_EXCLUDES),
  ];
  const filtered = files.filter((f) => {
    if (excludes.some((ex) => f.path === ex || f.path.startsWith(ex + "/"))) return false;
    if (opts.folders.length === 0) return true;
    return opts.folders.some((fld) => f.path === fld || f.path.startsWith(fld + "/"));
  });

  const scoredByName = filtered
    .map((f) => ({ f, sc: scoreFilename(f.path, tokens) }))
    .sort((a, b) => b.sc - a.sc)
    .slice(0, Math.min(200, filtered.length));

  const candidates: Candidate[] = [];
  for (const { f, sc } of scoredByName) {
    let content = "";
    try {
      content = await app.vault.cachedRead(f);
    } catch {
      continue;
    }
    const total = sc * 3 + scoreContent(content, tokens);
    if (total <= 0) continue;
    candidates.push({
      path: f.path,
      excerpt: stripFrontmatter(content).slice(0, opts.excerptChars),
      score: total,
    });
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, opts.topK);
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[、。！？「」『』（）()【】[\]]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

function scoreFilename(path: string, tokens: string[]): number {
  const lower = path.toLowerCase();
  let s = 0;
  for (const t of tokens) if (lower.includes(t)) s += 1;
  return s;
}

function scoreContent(content: string, tokens: string[]): number {
  const lower = content.toLowerCase();
  let s = 0;
  for (const t of tokens) {
    const re = new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
    const m = lower.match(re);
    if (m) s += Math.min(5, m.length);
  }
  return s;
}

function stripFrontmatter(s: string): string {
  if (!s.startsWith("---")) return s;
  const end = s.indexOf("\n---", 4);
  if (end < 0) return s;
  return s.slice(end + 4).trimStart();
}

export const __test = { tokenize, scoreFilename, scoreContent, stripFrontmatter };
