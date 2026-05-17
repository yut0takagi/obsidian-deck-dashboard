import { MarkdownRenderer, Notice, Setting, TFile } from "obsidian";
import type { WidgetDefinition, WidgetContext } from "./types";
import { chat } from "../adapters/anthropic";
import { runClaudeP } from "../adapters/claudeCode";
import { wireInternalLinks } from "./linkHandler";

type Backend = "claude-code" | "api";

interface Settings {
  backend: Backend;
  claudeCmd: string;
  model: string;
  topK: number;
  excerptChars: number;
  folders: string[]; // empty = whole vault (minus excludes)
  excludeFolders: string[]; // always skipped, even when folders is empty
}

// Always skipped regardless of user settings (system/junk folders).
const ALWAYS_EXCLUDED = [".obsidian", ".trash", ".claude", "node_modules"];

// Sensible vault defaults — auto-generated/binary-heavy/temp folders.
const DEFAULT_EXCLUDES = ["ログ", "アーカイブ", "添付", "inbox/temp"];

interface PluginData {
  anthropic_api_key?: string;
}

export const aiSearchWidget: WidgetDefinition<Settings> = {
  type: "ai-search",
  label: "AI Search (自然言語検索)",
  description:
    "自然言語クエリ → vault内候補をkeyword pre-filter → Claudeに渡して関連ノートを要約付きで返す。",
  defaultSettings: () => ({
    backend: "claude-code",
    claudeCmd: "claude",
    model: "claude-haiku-4-5-20251001",
    topK: 30,
    excerptChars: 300,
    folders: [],
    excludeFolders: [...DEFAULT_EXCLUDES],
  }),
  async render(el, settings, ctx) {
    el.empty();
    el.addClass("nd-widget-ai-search");

    const data = ((await ctx.plugin.loadData()) ?? {}) as PluginData;

    // API backend requires API key. claude-code backend doesn't.
    if (settings.backend === "api" && !data.anthropic_api_key) {
      const empty = el.createDiv({ cls: "nd-empty" });
      empty.createEl("p", { text: "Anthropic API キーが未設定です (API backend用)。" });
      const btn = empty.createEl("button", { text: "🔑 APIキーを設定", cls: "mod-cta" });
      btn.addEventListener("click", async () => {
        const key = window.prompt("Anthropic API key (sk-ant-... 形式):", "");
        if (!key) return;
        const next = ((await ctx.plugin.loadData()) ?? {}) as PluginData;
        next.anthropic_api_key = key.trim();
        await ctx.plugin.saveData(next);
        new Notice("APIキーを保存しました");
        aiSearchWidget.render(el, settings, ctx);
      });
      const note = empty.createEl("p", { cls: "nd-muted" });
      note.setText("または ⚙ から backend を「claude-code」に切替で `claude -p` 経由 (Pro/Maxサブスクで動作・APIキー不要)");
      return;
    }

    const form = el.createDiv({ cls: "nd-ai-form" });
    const input = form.createEl("input", {
      cls: "nd-ai-input",
      attr: { type: "text", placeholder: "聞きたいことを自然な日本語で… (例: 先週のロリエ案件の議論ポイント)" },
    });
    const goBtn = form.createEl("button", { text: "✨ 検索", cls: "mod-cta" });

    const meta = el.createDiv({ cls: "nd-ai-meta nd-muted" });
    const result = el.createDiv({ cls: "nd-ai-result" });

    const submit = async (): Promise<void> => {
      const q = input.value.trim();
      if (!q) return;
      meta.empty();
      meta.setText("候補抽出中…");
      result.empty();

      // 1) pre-filter via keyword scoring
      const candidates = await selectCandidates(ctx, q, settings);
      meta.setText(`候補 ${candidates.length} 件 / Claude 問い合わせ中…`);

      // 2) build context
      const ctxBlock = candidates
        .map(
          (c, i) =>
            `[${i + 1}] ${c.path}\n${c.excerpt.replace(/\n+/g, " ").trim()}\n`
        )
        .join("\n");

      const system =
        "あなたはObsidian vaultの検索アシスタントです。ユーザーの質問に対して、提示されたノート候補から最も関連度の高い 3-7 件を選び、Markdownで日本語で回答してください。\n" +
        "- 各回答ノートは [[ファイル名]] 形式でリンク (拡張子なし、basenameのみ)\n" +
        "- なぜ関連するかを1-2文で添える\n" +
        "- 該当なしなら正直に「該当ノートなし」と言う\n" +
        "- 候補リスト外を発明しない";

      const user = `# 質問\n${q}\n\n# vault候補ノート\n${ctxBlock}`;

      try {
        let answerMd: string;
        if (settings.backend === "claude-code") {
          // claude -p reads prompt from stdin; combine system+user
          const merged = `${system}\n\n---\n\n${user}`;
          const t0 = Date.now();
          const cc = await runClaudeP(merged, settings.claudeCmd);
          answerMd = cc.text.trim();
          const ms = Date.now() - t0;
          meta.setText(
            `候補 ${candidates.length} 件 / claude -p (${settings.claudeCmd}) / ${ms}ms`
          );
        } else {
          const apiKey = data.anthropic_api_key as string;
          const res = await chat(
            apiKey,
            settings.model,
            system,
            [{ role: "user", content: user }],
            800
          );
          answerMd = res.text;
          meta.setText(
            `候補 ${candidates.length} 件 / API ${settings.model} / 入力 ${res.inputTokens}t 出力 ${res.outputTokens}t`
          );
        }
        result.empty();
        const md = result.createDiv({ cls: "nd-ai-md" });
        await MarkdownRenderer.render(ctx.app, answerMd, md, ctx.sourcePath, ctx.parent);
        wireInternalLinks(md, ctx.app, ctx.sourcePath);
      } catch (e) {
        meta.empty();
        result.empty();
        result.createEl("pre", { cls: "nd-error", text: `AI search error: ${(e as Error).message}` });
      }
    };

    goBtn.addEventListener("click", submit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submit();
    });

    setTimeout(() => input.focus(), 50);
  },
  renderSettingsForm(container, settings, onChange) {
    new Setting(container)
      .setName("バックエンド")
      .setDesc("claude-code = `claude -p` 経由 (Pro/Maxサブスク・APIキー不要・desktop限定) / api = Anthropic API 直叩き")
      .addDropdown((d) =>
        d
          .addOption("claude-code", "claude -p (subscription)")
          .addOption("api", "Anthropic API (key)")
          .setValue(settings.backend)
          .onChange((v) => onChange({ ...settings, backend: v as Backend }))
      );
    new Setting(container)
      .setName("claude コマンド (claude-code backend用)")
      .setDesc('PATHに通ってる名前 or 絶対パス。デフォルト "claude"')
      .addText((t) =>
        t.setValue(settings.claudeCmd).onChange((v) =>
          onChange({ ...settings, claudeCmd: v.trim() || "claude" })
        )
      );
    new Setting(container)
      .setName("モデル (api backendのみ)")
      .setDesc("claude-haiku-4-5-20251001 推奨 (安価)。賢く欲しければ claude-sonnet-4-6 等")
      .addText((t) => t.setValue(settings.model).onChange((v) => onChange({ ...settings, model: v.trim() })));
    new Setting(container)
      .setName("候補数 (top-K)")
      .setDesc("Claudeに送る候補ノート数。多いほど精度高/高コスト。20-50推奨")
      .addText((t) =>
        t.setValue(String(settings.topK)).onChange((v) => {
          const n = parseInt(v, 10);
          if (!isNaN(n) && n > 0 && n <= 100) onChange({ ...settings, topK: n });
        })
      );
    new Setting(container)
      .setName("抜粋文字数")
      .setDesc("各候補ノートから何文字を文脈として送るか")
      .addText((t) =>
        t.setValue(String(settings.excerptChars)).onChange((v) => {
          const n = parseInt(v, 10);
          if (!isNaN(n) && n > 50) onChange({ ...settings, excerptChars: n });
        })
      );
    new Setting(container)
      .setName("検索対象フォルダ (カンマ区切り)")
      .setDesc("空 = vault全体（除外フォルダを除く）。例: 議事録, ナレッジ, 日報")
      .addText((t) => {
        t.setValue(settings.folders.join(", "));
        t.inputEl.style.width = "100%";
        t.onChange((v) =>
          onChange({
            ...settings,
            folders: v.split(",").map((s) => s.trim()).filter(Boolean),
          })
        );
      });
    new Setting(container)
      .setName("除外フォルダ (カンマ区切り)")
      .setDesc(
        `常に検索対象から外す。デフォルト: ${DEFAULT_EXCLUDES.join(", ")}。` +
        `${ALWAYS_EXCLUDED.join(", ")} は強制除外`
      )
      .addText((t) => {
        t.setValue((settings.excludeFolders ?? DEFAULT_EXCLUDES).join(", "));
        t.inputEl.style.width = "100%";
        t.onChange((v) =>
          onChange({
            ...settings,
            excludeFolders: v.split(",").map((s) => s.trim()).filter(Boolean),
          })
        );
      });
  },
};

interface Candidate {
  path: string;
  excerpt: string;
  score: number;
}

async function selectCandidates(
  ctx: WidgetContext,
  query: string,
  settings: Settings
): Promise<Candidate[]> {
  const tokens = tokenize(query);
  const files: TFile[] = (ctx.app.vault as any).getMarkdownFiles();
  const candidates: Candidate[] = [];
  // For perf: only sample up to 2000 files for content scoring
  const userExcludes = settings.excludeFolders ?? DEFAULT_EXCLUDES;
  const excludes = [...ALWAYS_EXCLUDED, ...userExcludes];
  const filtered = files.filter((f) => {
    if (excludes.some((ex) => f.path === ex || f.path.startsWith(ex + "/"))) return false;
    if (settings.folders.length === 0) return true;
    return settings.folders.some((fld) => f.path === fld || f.path.startsWith(fld + "/"));
  });

  // Cheap pass: score by filename + tag-ish path matches first
  const scoredByName = filtered
    .map((f) => ({ f, sc: scoreFilename(f.path, tokens) }))
    .sort((a, b) => b.sc - a.sc)
    .slice(0, Math.min(200, filtered.length)); // narrow content read to top 200

  for (const { f, sc } of scoredByName) {
    let content = "";
    try {
      content = await ctx.app.vault.cachedRead(f);
    } catch {
      continue;
    }
    const contentScore = scoreContent(content, tokens);
    const total = sc * 3 + contentScore;
    if (total <= 0) continue;
    candidates.push({
      path: f.path,
      excerpt: stripFrontmatter(content).slice(0, settings.excerptChars),
      score: total,
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, settings.topK);
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[、。！？「」『』（）()【】\[\]]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

function scoreFilename(path: string, tokens: string[]): number {
  const lower = path.toLowerCase();
  let s = 0;
  for (const t of tokens) {
    if (lower.includes(t)) s += 1;
  }
  return s;
}

function scoreContent(content: string, tokens: string[]): number {
  const lower = content.toLowerCase();
  let s = 0;
  for (const t of tokens) {
    const re = new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
    const m = lower.match(re);
    if (m) s += Math.min(5, m.length); // cap per-token score
  }
  return s;
}

function stripFrontmatter(s: string): string {
  if (!s.startsWith("---")) return s;
  const end = s.indexOf("\n---", 4);
  if (end < 0) return s;
  return s.slice(end + 4).trimStart();
}
