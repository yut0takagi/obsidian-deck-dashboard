import { MarkdownRenderer, Notice, Setting } from "obsidian";
import type { WidgetDefinition, WidgetContext } from "./types";
import { chat } from "../adapters/anthropic";
import { runClaudeP } from "../adapters/claudeCode";
import { wireInternalLinks } from "./linkHandler";
import { selectCandidates as sharedSelect, ALWAYS_EXCLUDED, DEFAULT_EXCLUDES } from "../core/vaultRetrieval";

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
    const input = form.createEl("textarea", {
      cls: "nd-ai-input",
      attr: {
        rows: "2",
        placeholder: "聞きたいことを自然な日本語で… (例: 先週のサンプル案件の議論ポイント) — ⌘+Enter で送信",
      },
    });
    const goBtn = form.createEl("button", { text: "✨ 検索 (⌘+↵)", cls: "mod-cta" });

    const meta = el.createDiv({ cls: "nd-ai-meta nd-muted" });
    const result = el.createDiv({ cls: "nd-ai-result" });

    let lastQuery = "";
    let lastVaultAnswer = "";

    const submit = async (): Promise<void> => {
      const q = input.value.trim();
      if (!q) return;
      lastQuery = q;
      lastVaultAnswer = "";
      meta.empty();
      meta.setText("候補抽出中…");
      result.empty();

      // 1) pre-filter via keyword scoring
      const candidates = await sharedSelect(ctx.app, q, {
        topK: settings.topK,
        excerptChars: settings.excerptChars,
        folders: settings.folders,
        excludeFolders: settings.excludeFolders ?? DEFAULT_EXCLUDES,
      });
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
        lastVaultAnswer = answerMd;
        result.empty();
        const md = result.createDiv({ cls: "nd-ai-md" });
        await MarkdownRenderer.render(ctx.app, answerMd, md, ctx.sourcePath, ctx.parent);
        wireInternalLinks(md, ctx.app, ctx.sourcePath);
        renderActions(result, q, answerMd, /* isWebResult */ false);
      } catch (e) {
        meta.empty();
        result.empty();
        result.createEl("pre", { cls: "nd-error", text: `AI search error: ${(e as Error).message}` });
      }
    };

    const runWebSearch = async (query: string): Promise<void> => {
      meta.empty();
      meta.setText("Web検索中…");
      result.empty();

      const webPrompt =
        "WebSearchツールを使って次の質問を調査し、要点を日本語Markdownでまとめてください。\n" +
        "- 信頼できる情報源を3-5件選ぶ (公式ドキュメント・主要メディア・専門ブログ等)\n" +
        "- 各論点を箇条書きで簡潔に\n" +
        "- 最後に \"## 参照\" セクションを作り、見出し+URLでソースを並べる\n" +
        "- 推測・憶測は避け、ソースに無い情報は明記\n" +
        `\n# 質問\n${query}`;

      try {
        const t0 = Date.now();
        const cc = await runClaudeP(webPrompt, settings.claudeCmd);
        const webMd = cc.text.trim();
        const ms = Date.now() - t0;
        meta.setText(`🌐 Web検索完了 / claude -p (WebSearch) / ${ms}ms`);

        const wrap = result.createDiv({ cls: "nd-ai-web-result" });
        wrap.createEl("h4", { text: "🌐 Web検索結果", cls: "nd-ai-web-head" });
        const md = wrap.createDiv({ cls: "nd-ai-md" });
        await MarkdownRenderer.render(ctx.app, webMd, md, ctx.sourcePath, ctx.parent);
        wireInternalLinks(md, ctx.app, ctx.sourcePath);
        renderActions(wrap, query, webMd, /* isWebResult */ true);
      } catch (e) {
        meta.empty();
        result.createEl("pre", {
          cls: "nd-error",
          text: `Web search error: ${(e as Error).message}`,
        });
      }
    };

    const saveAsKnowledge = async (
      query: string,
      contentMd: string,
      kind: "vault" | "web"
    ): Promise<void> => {
      const d = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      const ymd = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      const slug = query.replace(/[\\/:*?"<>|\n\r\t]+/g, "_").slice(0, 50).trim() || "memo";
      const folder = "inbox/temp";
      if (!ctx.app.vault.getAbstractFileByPath(folder)) {
        try {
          await ctx.app.vault.createFolder(folder);
        } catch {
          /* ignore */
        }
      }
      let path = `${folder}/${ymd}_${slug}.md`;
      let i = 2;
      while (ctx.app.vault.getAbstractFileByPath(path)) {
        path = `${folder}/${ymd}_${slug}_${i}.md`;
        i++;
      }
      const fm =
        `---\n` +
        `source: AI Search (${kind === "web" ? "Web" : "vault"})\n` +
        `query: ${JSON.stringify(query)}\n` +
        `created: ${ymd}\n` +
        `status: 未整理\n` +
        `---\n\n` +
        `# ${query}\n\n` +
        contentMd +
        "\n";
      try {
        const created = await ctx.app.vault.create(path, fm);
        new Notice(`保存: ${path}`);
        await ctx.app.workspace.getLeaf("tab").openFile(created);
      } catch (e) {
        new Notice(`保存失敗: ${(e as Error).message}`);
      }
    };

    const renderActions = (
      parent: HTMLElement,
      query: string,
      answerMd: string,
      isWebResult: boolean
    ): void => {
      const actions = parent.createDiv({ cls: "nd-ai-actions" });
      const noVaultMatch = !isWebResult && /該当.*なし|該当ノートなし/.test(answerMd);

      if (!isWebResult) {
        const webBtn = actions.createEl("button", {
          text: noVaultMatch ? "🌐 該当なし — Webで調べる" : "🌐 Webで調べる",
          cls: noVaultMatch ? "mod-cta" : "",
        });
        webBtn.addEventListener("click", () => runWebSearch(query));
      }

      const saveBtn = actions.createEl("button", {
        text: "📚 ナレッジ化 (inbox/temp)",
        cls: isWebResult ? "mod-cta" : "",
      });
      saveBtn.addEventListener("click", () =>
        saveAsKnowledge(query, answerMd, isWebResult ? "web" : "vault")
      );
    };

    goBtn.addEventListener("click", submit);

    // Cmd/Ctrl+Enter to submit. Attach in capture phase on document so we
    // beat Obsidian's own hotkey manager (which also runs in capture).
    const cmdEnterHandler = (e: KeyboardEvent): void => {
      if (e.key !== "Enter") return;
      if (!(e.metaKey || e.ctrlKey)) return;
      if (document.activeElement !== input) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      submit();
    };
    document.addEventListener("keydown", cmdEnterHandler, true);
    ctx.parent.register(() => {
      document.removeEventListener("keydown", cmdEnterHandler, true);
    });
    // Fallback for environments where document-capture is unreachable.
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        e.stopPropagation();
        submit();
      }
    });

    // suppress unused-var warnings in fallback paths
    void lastQuery;
    void lastVaultAnswer;

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
        t.inputEl.addClass("deck-input-full");
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
        t.inputEl.addClass("deck-input-full");
        t.onChange((v) =>
          onChange({
            ...settings,
            excludeFolders: v.split(",").map((s) => s.trim()).filter(Boolean),
          })
        );
      });
  },
};
