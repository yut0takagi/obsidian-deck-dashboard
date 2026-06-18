import { App, Modal, Notice, Setting, TFile } from "obsidian";
import type { StreamEvent } from "../adapters/claudeCodeStream";
import {
  AISessionRegistry,
  SessionEntry,
  getAISessionRegistry,
} from "../core/AISessionRegistry";

const DEFAULT_PROMPT_TEMPLATE = `次のタスクのうち、AIが実行可能な部分をすべて実施してください。

# 指針
- タスクファイルを読み、何をすべきか把握する
- AIが完遂できる部分は実際に作業する (コード雛形・調査メモ作成・ドキュメント整理など)
- 人間判断・外部連絡・実物確認が必要な部分はTODOとして残す
- 作業内容・残TODO・参考情報をタスクファイルの末尾に "## AI移譲ログ (今日)" セクションを作って追記する
- 作業中の調査メモは vault 内の適切な場所に保存

# タスクファイル
{{TASK_PATH}}

まず {{TASK_PATH}} を Read してタスク内容を把握し、計画を立ててから着手してください。`;

export interface AIDelegationOptions {
  app: App;
  taskFile: TFile;
  vaultRoot: string;
  claudeCmd?: string;
  /** frontmatter field for kanban status (default: "status") */
  statusField?: string;
  /** value to set when AI run succeeds (default: "レビュー待ち") */
  successStatus?: string;
  /** Override registry (mainly for tests). */
  registry?: AISessionRegistry;
}

export class AIDelegationModal extends Modal {
  private opts: AIDelegationOptions;
  private registry: AISessionRegistry;

  private promptArea: HTMLTextAreaElement | null = null;
  private modeSelect: HTMLSelectElement | null = null;
  private runBtn: HTMLButtonElement | null = null;
  private closeBtn: HTMLButtonElement | null = null;
  private abortBtn: HTMLButtonElement | null = null;
  private openLogBtn: HTMLButtonElement | null = null;
  private logEl: HTMLElement | null = null;
  private statusEl: HTMLElement | null = null;

  private entry: SessionEntry | null = null;
  private unsubscribe: (() => void) | null = null;
  private uiLive = true;

  constructor(opts: AIDelegationOptions) {
    super(opts.app);
    this.opts = opts;
    this.registry = opts.registry ?? getAISessionRegistry();
  }

  onOpen(): void {
    this.modalEl.addClass("nd-ai-delegate-modal-wrap");

    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("nd-ai-delegate-modal");
    contentEl.createEl("h2", { text: `✨ AI移譲: ${this.opts.taskFile.basename}` });

    const warn = contentEl.createDiv({ cls: "nd-ai-delegate-warn" });
    warn.setText(
      "⚠️  AIにファイル編集・シェルコマンド実行を許可します。" +
        " 実行中にモーダルを閉じてもセッションは継続し、" +
        " ログは ログ/AI移譲/<timestamp>_<task>.md にリアルタイム書き出しされます。" +
        " ステータスバー右下の AI🤖 から復帰できます。"
    );

    new Setting(contentEl)
      .setName("Permission Mode")
      .setDesc("acceptEdits = 編集は自動承認 / bypassPermissions = 全自動 (危険)")
      .addDropdown((d) => {
        d.addOption("acceptEdits", "acceptEdits (推奨)");
        d.addOption("bypassPermissions", "bypassPermissions (全自動)");
        d.setValue("acceptEdits");
        this.modeSelect = d.selectEl;
      });

    const promptLabel = contentEl.createEl("label", { text: "AIへの指示" });
    promptLabel.addClass("nd-ai-delegate-label");
    this.promptArea = contentEl.createEl("textarea", {
      cls: "nd-ai-delegate-prompt",
    });
    this.promptArea.value = DEFAULT_PROMPT_TEMPLATE.replace(
      /\{\{TASK_PATH\}\}/g,
      this.opts.taskFile.path
    );
    this.promptArea.rows = 12;

    const btnRow = contentEl.createDiv({ cls: "nd-ai-delegate-buttons" });

    this.openLogBtn = btnRow.createEl("button", { text: "📄 ログを開く" });
    this.openLogBtn.disabled = true;
    this.openLogBtn.addEventListener("click", () => void this.openLogFile());

    this.abortBtn = btnRow.createEl("button", { text: "🛑 中止" });
    this.abortBtn.disabled = true;
    this.abortBtn.addEventListener("click", () => this.abortSession());

    this.closeBtn = btnRow.createEl("button", { text: "閉じる" });
    this.closeBtn.addEventListener("click", () => this.close());

    this.runBtn = btnRow.createEl("button", {
      text: "🚀 AIに渡す",
      cls: "mod-cta",
    });
    this.runBtn.addEventListener("click", () => void this.run());

    this.statusEl = contentEl.createDiv({ cls: "nd-ai-delegate-status nd-muted" });
    this.statusEl.setText("待機中");
    this.logEl = contentEl.createDiv({ cls: "nd-ai-delegate-log" });

    // If a session already exists for this task, attach to it.
    const existing = this.registry.get(this.opts.taskFile.path);
    if (existing) {
      this.attach(existing);
    }
  }

  onClose(): void {
    this.uiLive = false;
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    // Intentionally do NOT cancel the session — it keeps streaming to the log
    // file and stays in the registry, accessible from the status bar.
    if (this.entry && this.entry.status === "running") {
      new Notice(`AI移譲は継続中。ログ: ${this.entry.writer.path}`, 6000);
    }
    this.contentEl.empty();
  }

  private async openLogFile(): Promise<void> {
    if (!this.entry) return;
    const f = this.app.vault.getAbstractFileByPath(this.entry.writer.path);
    if (!(f instanceof TFile)) {
      new Notice(`ログファイルが見つかりません: ${this.entry.writer.path}`);
      return;
    }
    const leaf = this.app.workspace.getLeaf("split");
    await leaf.openFile(f);
  }

  private abortSession(): void {
    if (!this.entry) return;
    if (this.registry.abort(this.entry.taskPath)) {
      new Notice("AIセッションを中止しました");
    }
  }

  /** Move kanban status forward on success (called from registry hook). */
  private async advanceStatus(): Promise<boolean> {
    const field = this.opts.statusField ?? "status";
    const next = this.opts.successStatus ?? "レビュー待ち";
    try {
      await this.app.fileManager.processFrontMatter(
        this.opts.taskFile,
        (fm: Record<string, unknown>) => {
          fm[field] = next;
        }
      );
      return true;
    } catch (e) {
      new Notice(`status更新失敗: ${(e as Error).message}`);
      return false;
    }
  }

  /** Attach the modal UI to an existing session entry (replay + live). */
  private attach(entry: SessionEntry): void {
    this.entry = entry;

    if (this.promptArea) {
      this.promptArea.value = entry.prompt;
      this.promptArea.disabled = true;
    }
    if (this.modeSelect) {
      this.modeSelect.value = entry.permissionMode;
      this.modeSelect.disabled = true;
    }
    if (this.runBtn) {
      this.runBtn.disabled = true;
      this.runBtn.setText(
        entry.status === "running" ? "実行中…" : entry.status === "completed" ? "✅ 完了" : "再実行不可"
      );
    }
    if (this.abortBtn) this.abortBtn.disabled = entry.status !== "running";
    if (this.openLogBtn) this.openLogBtn.disabled = false;
    if (this.statusEl) {
      this.statusEl.setText(this.describeStatus(entry));
    }

    // Replay buffered events into the log panel.
    if (this.logEl) {
      this.logEl.empty();
      for (const e of entry.events) this.renderEvent(e);
    }

    // Live subscription.
    this.unsubscribe = this.registry.subscribe(entry.taskPath, (n) => {
      if (!this.uiLive) return;
      if (n.type === "event" && n.event) {
        this.renderEvent(n.event);
      } else if (n.type === "status") {
        if (this.statusEl) this.statusEl.setText(this.describeStatus(entry));
        if (this.abortBtn) this.abortBtn.disabled = entry.status !== "running";
        if (this.runBtn) {
          this.runBtn.disabled = entry.status !== "completed" && entry.status !== "error";
          this.runBtn.setText(entry.status === "completed" ? "✅ 再実行" : "🔁 再試行");
        }
        if (this.promptArea) this.promptArea.disabled = entry.status === "running";
        if (this.modeSelect) this.modeSelect.disabled = entry.status === "running";
      }
    });
  }

  private describeStatus(entry: SessionEntry): string {
    if (entry.status === "running") return "実行中… (閉じても継続)";
    if (entry.status === "completed") {
      const sec = entry.final ? (entry.final.durationMs / 1000).toFixed(1) : "?";
      return `完了 ${sec}s`;
    }
    if (entry.status === "cancelled") return "中止";
    if (entry.status === "error") return `エラー (code=${entry.final?.code ?? "?"})`;
    return entry.status;
  }

  private renderEvent(e: StreamEvent): void {
    if (!this.logEl) return;
    const line = this.logEl.createDiv({ cls: `nd-ai-log-line nd-ai-log-${e.kind}` });
    const ts = new Date().toLocaleTimeString();
    line.createSpan({ cls: "nd-ai-log-ts", text: ts });
    const body = line.createSpan({ cls: "nd-ai-log-body" });

    if (e.kind === "system") body.setText(e.text ?? "(system)");
    else if (e.kind === "text") body.setText(e.text ?? "");
    else if (e.kind === "tool_use") body.setText(`🔧 ${e.text}`);
    else if (e.kind === "tool_result") {
      body.setText(`  ↳ ${e.text}`);
      if (e.isError) line.addClass("nd-ai-log-error");
    } else if (e.kind === "result") {
      body.setText(`✅ ${e.text ?? "完了"}`);
    } else if (e.kind === "stderr") body.setText(`stderr: ${e.text}`);
    else if (e.kind === "error") {
      body.setText(`❌ ${e.text}`);
      line.addClass("nd-ai-log-error");
    }
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  private async run(): Promise<void> {
    if (!this.promptArea || !this.modeSelect || !this.runBtn) return;
    if (this.registry.has(this.opts.taskFile.path)) {
      new Notice("既に実行中です");
      return;
    }
    const prompt = this.promptArea.value.trim();
    if (!prompt) {
      new Notice("指示が空です");
      return;
    }
    const mode = this.modeSelect.value as "acceptEdits" | "bypassPermissions";

    this.runBtn.disabled = true;
    this.runBtn.setText("起動中…");
    this.promptArea.disabled = true;
    this.modeSelect.disabled = true;
    if (this.statusEl) this.statusEl.setText("claude起動中…");

    let entry: SessionEntry;
    try {
      entry = await this.registry.start({
        app: this.app,
        taskFile: this.opts.taskFile,
        vaultRoot: this.opts.vaultRoot,
        permissionMode: mode,
        prompt,
        claudeCmd: this.opts.claudeCmd,
        onFinalize: async (e, final) => {
          if (final.ok) {
            const moved = await this.advanceStatus();
            const tail = moved ? ` → ${this.opts.successStatus ?? "レビュー待ち"}` : "";
            new Notice(
              `AI移譲完了: ${e.taskBasename} (${(final.durationMs / 1000).toFixed(1)}s)${tail}`
            );
          } else if (final.cancelled) {
            new Notice(`AI移譲中止: ${e.taskBasename}`);
          } else {
            new Notice(`AI移譲失敗 (code=${final.code}) — ログ参照`);
          }
        },
      });
    } catch (e) {
      const msg = (e as Error).message;
      new Notice(`起動失敗: ${msg}`);
      if (this.uiLive) {
        if (this.statusEl) this.statusEl.setText(`起動失敗: ${msg}`);
        if (this.runBtn) {
          this.runBtn.disabled = false;
          this.runBtn.setText("🔁 再試行");
        }
        if (this.promptArea) this.promptArea.disabled = false;
        if (this.modeSelect) this.modeSelect.disabled = false;
      }
      return;
    }

    this.attach(entry);
    // Auto-open the log file in a split so the user can watch it live.
    void this.openLogFile();
  }
}

/** Helper exported for testing: returns the default prompt for a given path. */
export function renderDefaultPrompt(taskPath: string): string {
  return DEFAULT_PROMPT_TEMPLATE.replace(/\{\{TASK_PATH\}\}/g, taskPath);
}
