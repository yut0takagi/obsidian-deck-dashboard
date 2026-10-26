import { MarkdownRenderer, Modal, Notice, Setting } from "obsidian";
import type { App } from "obsidian";
import type { WidgetDefinition } from "./types";
import { chat } from "../adapters/anthropic";
import { runClaudeP } from "../adapters/claudeCode";
import { wireInternalLinks } from "./linkHandler";
import { selectCandidates as sharedSelect, ALWAYS_EXCLUDED } from "../core/vaultRetrieval";
import { searchExcludes } from "../core/settings";
import { SecretStore } from "../core/secrets";
import { requireWidgetClaudeCommand } from "../ai/claudeCommandGuard";
import { requireSafeVaultPath, sanitizeFileTitle } from "../core/safePath";
import { t } from "../core/i18n";

type Backend = "claude-code" | "api";

/**
 * Simple text-prompt modal. Resolves to the entered string on OK/Enter, or
 * `null` on Cancel/close. Replaces the forbidden `window.prompt()`.
 */
class TextPromptModal extends Modal {
  private value: string;
  private resolved = false;
  constructor(
    app: App,
    private readonly title: string,
    private readonly placeholder: string,
    defaultValue: string,
    private readonly onClose_: (result: string | null) => void
  ) {
    super(app);
    this.value = defaultValue;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: this.title });
    const input = contentEl.createEl("input", {
      cls: "deck-input-full",
      attr: { type: "text", placeholder: this.placeholder },
    });
    input.value = this.value;
    input.addEventListener("input", () => (this.value = input.value));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.finish(this.value);
      } else if (e.key === "Escape") {
        e.preventDefault();
        this.finish(null);
      }
    });
    const row = contentEl.createDiv({ cls: "nd-ai-actions" });
    const okBtn = row.createEl("button", { text: "OK", cls: "mod-cta" });
    okBtn.addEventListener("click", () => this.finish(this.value));
    const cancelBtn = row.createEl("button", { text: t().aiSearchCancel });
    cancelBtn.addEventListener("click", () => this.finish(null));
    window.setTimeout(() => input.focus(), 0);
  }

  private finish(result: string | null): void {
    this.resolved = true;
    this.onClose_(result);
    this.close();
  }

  onClose(): void {
    this.contentEl.empty();
    if (!this.resolved) {
      this.resolved = true;
      this.onClose_(null);
    }
  }
}

function promptText(
  app: App,
  title: string,
  placeholder: string,
  defaultValue = ""
): Promise<string | null> {
  return new Promise((resolve) => {
    new TextPromptModal(app, title, placeholder, defaultValue, resolve).open();
  });
}

interface Settings {
  backend: Backend;
  /**
   * Written by 0.0.x. Never run: the command comes from Settings → Deck only.
   * Kept in the type so a differing value can be reported to the user.
   */
  claudeCmd?: string;
  model: string;
  topK: number;
  excerptChars: number;
  folders: string[]; // empty = whole vault (minus excludes)
  excludeFolders: string[]; // skipped on top of Settings → Deck's exclude list
}


export const aiSearchWidget: WidgetDefinition<Settings> = {
  type: "ai-search",
  label: t().aiSearchAiSearchNaturalLanguage,
  description:
    t().aiSearchFindCandidateNotesByKeyword,
  defaultSettings: () => ({
    backend: "claude-code",
    model: "claude-haiku-4-5-20251001",
    topK: 30,
    excerptChars: 300,
    folders: [],
    excludeFolders: [],
  }),
  async render(el, settings, ctx) {
    el.empty();
    el.addClass("nd-widget-ai-search");

    const secrets = new SecretStore(ctx.plugin);
    const apiKey = settings.backend === "api" ? await secrets.get<string>("anthropic_api_key") : null;

    // API backend requires API key. claude-code backend doesn't.
    if (settings.backend === "api" && !apiKey) {
      const empty = el.createDiv({ cls: "nd-empty" });
      empty.createEl("p", { text: t().aiSearchAnthropicApiKeyIsNot });
      const btn = empty.createEl("button", { text: t().aiSearchSetApiKey, cls: "mod-cta" });
      btn.addEventListener("click", () => {
        void (async () => {
          const key = await promptText(
            ctx.app,
            "Anthropic API key",
            t().aiSearchSkAnt,
            ""
          );
          if (!key) return;
          await secrets.set("anthropic_api_key", key.trim());
          new Notice(t().aiSearchApiKeySaved);
          void aiSearchWidget.render(el, settings, ctx);
        })();
      });
      const note = empty.createEl("p", { cls: "nd-muted" });
      note.setText(t().aiSearchOrSwitchTheBackendTo);
      return;
    }

    const form = el.createDiv({ cls: "nd-ai-form" });
    const input = form.createEl("textarea", {
      cls: "nd-ai-input",
      attr: {
        rows: "2",
        placeholder: t().aiSearchAskAQuestionEG,
      },
    });
    const goBtn = form.createEl("button", { text: t().aiSearchSearch, cls: "mod-cta" });

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
      meta.setText(t().aiSearchFindingCandidateNotes);
      result.empty();

      // 1) pre-filter via keyword scoring
      const candidates = await sharedSelect(ctx.app, q, {
        topK: settings.topK,
        excerptChars: settings.excerptChars,
        folders: settings.folders,
        excludeFolders: searchExcludes(ctx.settings, settings.excludeFolders ?? []),
      });
      meta.setText(t().aiSearchCandidatesQueryingClaude(candidates.length));

      // 2) build context
      const ctxBlock = candidates
        .map(
          (c, i) =>
            `[${i + 1}] ${c.path}\n${c.excerpt.replace(/\n+/g, " ").trim()}\n`
        )
        .join("\n");

      const system =
        t().aiSearchYouAreASearchAssistant +
        t().aiSearchLinkEachNoteAsFile +
        t().aiSearchAdd12SentencesOn +
        t().aiSearchIfNothingMatchesSayNo +
        t().aiSearchDoNotInventNotesOutside;

      const user = t().aiSearchQuestionCandidateVaultNotes(q, ctxBlock);

      try {
        let answerMd: string;
        if (settings.backend === "claude-code") {
          // claude -p reads prompt from stdin; combine system+user
          const merged = `${system}\n\n---\n\n${user}`;
          const t0 = Date.now();
          const cmd = requireWidgetClaudeCommand(settings, ctx.settings);
          const cc = await runClaudeP(merged, cmd);
          answerMd = cc.text.trim();
          const ms = Date.now() - t0;
          meta.setText(t().aiSearchCandidatesClaudePMs(candidates.length, cmd, ms));
        } else {
          const res = await chat(
            apiKey ?? "",
            settings.model,
            system,
            [{ role: "user", content: user }],
            800
          );
          answerMd = res.text;
          meta.setText(
            t().aiSearchCandidatesApiInputTokensOutput(candidates.length, settings.model, res.inputTokens, res.outputTokens)
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
      meta.setText(t().aiSearchSearchingTheWeb);
      result.empty();

      const webPrompt =
        t().aiSearchUseTheWebsearchToolTo +
        t().aiSearchPick35ReliableSources +
        t().aiSearchKeepEachPointToA +
        t().aiSearchEndWithASourcesSection +
        t().aiSearchAvoidGuessingSayClearlyWhen +
        t().aiSearchQuestion(query);

      try {
        const t0 = Date.now();
        const cc = await runClaudeP(webPrompt, requireWidgetClaudeCommand(settings, ctx.settings));
        const webMd = cc.text.trim();
        const ms = Date.now() - t0;
        meta.setText(t().aiSearchWebSearchCompleteClaudeP(ms));

        const wrap = result.createDiv({ cls: "nd-ai-web-result" });
        wrap.createEl("h4", { text: t().aiSearchWebSearchResults, cls: "nd-ai-web-head" });
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
      const slug = sanitizeFileTitle(query).slice(0, 50).trim() || "memo";
      if (!ctx.settings.aiNotesFolder) {
        new Notice(t().setFirstNotice(t().aiNotesFolderName));
        ctx.openSettings();
        return;
      }
      let folder: string;
      try {
        folder = requireSafeVaultPath(ctx.settings.aiNotesFolder, "");
      } catch (e) {
        new Notice((e as Error).message, 8000);
        return;
      }
      if (!ctx.app.vault.getAbstractFileByPath(folder)) {
        try {
          await ctx.app.vault.createFolder(folder);
        } catch {
          /* ignore */
        }
      }
      let path = requireSafeVaultPath(`${folder}/${ymd}_${slug}.md`, folder);
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
        new Notice(t().aiSearchSaved(path));
        await ctx.app.workspace.getLeaf("tab").openFile(created);
      } catch (e) {
        new Notice(t().aiSearchFailedToSave((e as Error).message));
      }
    };

    const renderActions = (
      parent: HTMLElement,
      query: string,
      answerMd: string,
      isWebResult: boolean
    ): void => {
      const actions = parent.createDiv({ cls: "nd-ai-actions" });
      const noVaultMatch = !isWebResult && /該当.*なし|該当ノートなし|no matching notes/i.test(answerMd);

      if (!isWebResult) {
        const webBtn = actions.createEl("button", {
          text: noVaultMatch ? t().aiSearchNoMatchesSearchTheWeb : t().aiSearchSearchTheWeb,
          cls: noVaultMatch ? "mod-cta" : "",
        });
        webBtn.addEventListener("click", () => void runWebSearch(query));
      }

      const saveBtn = actions.createEl("button", {
        text: ctx.settings.aiNotesFolder ? t().aiSearchSaveAsNote(ctx.settings.aiNotesFolder) : t().aiSearchSaveAsNote2,
        cls: isWebResult ? "mod-cta" : "",
      });
      saveBtn.addEventListener("click", () =>
        void saveAsKnowledge(query, answerMd, isWebResult ? "web" : "vault")
      );
    };

    goBtn.addEventListener("click", () => void submit());

    // Cmd/Ctrl+Enter to submit. Attach in capture phase on document so we
    // beat Obsidian's own hotkey manager (which also runs in capture).
    const cmdEnterHandler = (e: KeyboardEvent): void => {
      if (e.key !== "Enter") return;
      if (!(e.metaKey || e.ctrlKey)) return;
      if (activeDocument.activeElement !== input) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      void submit();
    };
    // ctx.parent is unloaded before the next render, which removes this.
    ctx.parent.registerDomEvent(activeDocument, "keydown", cmdEnterHandler, { capture: true });
    // Fallback for environments where document-capture is unreachable.
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        e.stopPropagation();
        void submit();
      }
    });

    // suppress unused-var warnings in fallback paths
    void lastQuery;
    void lastVaultAnswer;

    window.setTimeout(() => input.focus(), 50);
  },
  renderSettingsForm(container, settings, onChange) {
    new Setting(container)
      .setName(t().aiSearchBackend)
      .setDesc(t().aiSearchClaudeCodeThroughClaudeP)
      .addDropdown((d) =>
        d
          .addOption("claude-code", "claude -p (subscription)")
          .addOption("api", "Anthropic API (key)")
          .setValue(settings.backend)
          .onChange((v) => onChange({ ...settings, backend: v as Backend }))
      );
    new Setting(container)
      .setName(t().aiSearchModelApiBackendOnly)
      .setDesc(t().aiSearchClaudeHaiku4520251001)
      .addText((t) => t.setValue(settings.model).onChange((v) => onChange({ ...settings, model: v.trim() })));
    new Setting(container)
      .setName(t().aiSearchCandidateCountTopK)
      .setDesc(t().aiSearchNumberOfCandidateNotesSent)
      .addText((t) =>
        t.setValue(String(settings.topK)).onChange((v) => {
          const n = parseInt(v, 10);
          if (!isNaN(n) && n > 0 && n <= 100) onChange({ ...settings, topK: n });
        })
      );
    new Setting(container)
      .setName(t().aiSearchExcerptLength)
      .setDesc(t().aiSearchNumberOfCharactersSentFrom)
      .addText((t) =>
        t.setValue(String(settings.excerptChars)).onChange((v) => {
          const n = parseInt(v, 10);
          if (!isNaN(n) && n > 50) onChange({ ...settings, excerptChars: n });
        })
      );
    new Setting(container)
      .setName(t().aiSearchSearchFoldersCommaSeparated)
      .setDesc(t().aiSearchEmptyTheWholeVaultMinus)
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
      .setName(t().aiSearchExcludedFoldersCommaSeparated)
      .setDesc(
        t().aiSearchExcludedFromSearchInAddition +
        t().aiSearchAreAlwaysExcluded(ALWAYS_EXCLUDED.join(", "))
      )
      .addText((t) => {
        t.setValue((settings.excludeFolders ?? []).join(", "));
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
