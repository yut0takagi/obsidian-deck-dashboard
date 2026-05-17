import { App, Modal, Notice, Setting, TFile } from "obsidian";
import { runClaudeStream, StreamEvent, ClaudeStreamSession } from "../adapters/claudeCodeStream";
import { AILogWriter } from "../adapters/aiLogWriter";

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
}

export class AIDelegationModal extends Modal {
  private opts: AIDelegationOptions;
  private promptArea: HTMLTextAreaElement | null = null;
  private modeSelect: HTMLSelectElement | null = null;
  private runBtn: HTMLButtonElement | null = null;
  private closeBtn: HTMLButtonElement | null = null;
  private abortBtn: HTMLButtonElement | null = null;
  private openLogBtn: HTMLButtonElement | null = null;
  private logEl: HTMLElement | null = null;
  private statusEl: HTMLElement | null = null;

  private session: ClaudeStreamSession | null = null;
  private writer: AILogWriter | null = null;
  private uiLive = true;
  private running = false;

  constructor(opts: AIDelegationOptions) {
    super(opts.app);
    this.opts = opts;
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
        " ログは ログ/AI移譲/<timestamp>_<task>.md にリアルタイム書き出しされます。"
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
    this.promptArea.rows = 10;

    const btnRow = contentEl.createDiv({ cls: "nd-ai-delegate-buttons" });

    this.openLogBtn = btnRow.createEl("button", { text: "📄 ログを開く" });
    this.openLogBtn.disabled = true;
    this.openLogBtn.addEventListener("click", () => this.openLogFile());

    this.abortBtn = btnRow.createEl("button", { text: "🛑 中止" });
    this.abortBtn.disabled = true;
    this.abortBtn.addEventListener("click", () => this.abortSession());

    this.closeBtn = btnRow.createEl("button", { text: "閉じる" });
    this.closeBtn.addEventListener("click", () => this.close());

    this.runBtn = btnRow.createEl("button", {
      text: "🚀 AIに渡す",
      cls: "mod-cta",
    });
    this.runBtn.addEventListener("click", () => this.run());

    this.statusEl = contentEl.createDiv({ cls: "nd-ai-delegate-status nd-muted" });
    this.statusEl.setText("待機中");
    this.logEl = contentEl.createDiv({ cls: "nd-ai-delegate-log" });
  }

  onClose(): void {
    this.uiLive = false;
    // intentionally do NOT cancel the session — it keeps streaming to the
    // log file. The notice tells the user where to look.
    if (this.running && this.writer) {
      new Notice(`AI移譲は継続中。ログ: ${this.writer.path}`, 6000);
    }
    this.contentEl.empty();
  }

  private async openLogFile(): Promise<void> {
    if (!this.writer) return;
    const f = this.app.vault.getAbstractFileByPath(this.writer.path);
    if (!(f instanceof TFile)) {
      new Notice(`ログファイルが見つかりません: ${this.writer.path}`);
      return;
    }
    const leaf = this.app.workspace.getLeaf("split");
    await leaf.openFile(f);
  }

  private abortSession(): void {
    if (!this.session) return;
    this.session.cancel();
    new Notice("AIセッションを中止しました");
  }

  /** On success, move task to the success column (default: レビュー待ち). */
  private async advanceStatus(): Promise<boolean> {
    const field = this.opts.statusField ?? "status";
    const next = this.opts.successStatus ?? "レビュー待ち";
    try {
      await this.app.fileManager.processFrontMatter(this.opts.taskFile, (fm: any) => {
        fm[field] = next;
      });
      return true;
    } catch (e) {
      new Notice(`status更新失敗: ${(e as Error).message}`);
      return false;
    }
  }

  private async run(): Promise<void> {
    if (!this.promptArea || !this.modeSelect || !this.runBtn) return;
    if (this.running) {
      new Notice("既に実行中です");
      return;
    }
    const prompt = this.promptArea.value.trim();
    if (!prompt) {
      new Notice("指示が空です");
      return;
    }
    const mode = this.modeSelect.value as "acceptEdits" | "bypassPermissions";

    this.running = true;
    this.runBtn.disabled = true;
    this.runBtn.setText("実行中…");
    this.promptArea.disabled = true;
    this.modeSelect.disabled = true;
    if (this.abortBtn) this.abortBtn.disabled = false;
    if (this.openLogBtn) this.openLogBtn.disabled = true;
    if (this.logEl) this.logEl.empty();

    // Create writer & init log file
    try {
      this.writer = await AILogWriter.create(this.app, this.opts.taskFile.basename);
      await this.writer.init({
        taskPath: this.opts.taskFile.path,
        permissionMode: mode,
        prompt,
      });
    } catch (e) {
      this.running = false;
      if (this.runBtn) {
        this.runBtn.disabled = false;
        this.runBtn.setText("🚀 AIに渡す");
      }
      if (this.statusEl) this.statusEl.setText(`ログ作成失敗: ${(e as Error).message}`);
      new Notice(`ログ作成失敗: ${(e as Error).message}`);
      return;
    }
    if (this.openLogBtn) this.openLogBtn.disabled = false;
    // Auto-open the log file in a split so the user can watch it live.
    void this.openLogFile();

    const t0 = Date.now();
    let toolCount = 0;

    const onEvent = (e: StreamEvent): void => {
      if (e.kind === "tool_use") toolCount++;

      // Write to log file (best-effort, never throws into pipeline).
      if (this.writer) void this.writer.logEvent(e);

      // Update modal UI if still open.
      if (!this.uiLive || !this.logEl) return;
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
        const dur = ((Date.now() - t0) / 1000).toFixed(1);
        body.setText(`✅ 完了 (${dur}s, tools=${toolCount})`);
      } else if (e.kind === "stderr") body.setText(`stderr: ${e.text}`);
      else if (e.kind === "error") {
        body.setText(`❌ ${e.text}`);
        line.addClass("nd-ai-log-error");
      }
      this.logEl.scrollTop = this.logEl.scrollHeight;
    };

    if (this.statusEl) this.statusEl.setText("claude起動中…");

    try {
      this.session = runClaudeStream({
        prompt,
        cwd: this.opts.vaultRoot,
        claudeCmd: this.opts.claudeCmd ?? "claude",
        permissionMode: mode,
        onEvent,
      });
      if (this.statusEl) this.statusEl.setText("実行中… (閉じても継続)");

      const res = await this.session.done;
      const dur = Date.now() - t0;
      this.session = null;

      // Always finalize log file, even if modal closed.
      if (this.writer) {
        await this.writer.finalize({
          ok: res.ok,
          cancelled: res.code === null && !res.ok,
          durationMs: dur,
          toolCount,
        });
      }

      this.running = false;

      // Notify regardless of modal state.
      if (res.ok) {
        const moved = await this.advanceStatus();
        const tail = moved ? ` → ${this.opts.successStatus ?? "レビュー待ち"}` : "";
        new Notice(
          `AI移譲完了: ${this.opts.taskFile.basename} (${(dur / 1000).toFixed(1)}s)${tail}`
        );
      } else {
        new Notice(`AI移譲失敗 (code=${res.code}) — ログ参照`);
      }

      // Update UI if still visible.
      if (this.uiLive) {
        if (this.statusEl) {
          this.statusEl.setText(
            res.ok ? `完了 ${(dur / 1000).toFixed(1)}s` : `エラー (code=${res.code})`
          );
        }
        if (this.runBtn) {
          this.runBtn.disabled = false;
          this.runBtn.setText(res.ok ? "✅ 再実行" : "🔁 再試行");
        }
        if (this.abortBtn) this.abortBtn.disabled = true;
        if (this.promptArea) this.promptArea.disabled = false;
        if (this.modeSelect) this.modeSelect.disabled = false;
      }
    } catch (e) {
      this.running = false;
      const msg = (e as Error).message;
      if (this.writer) {
        await this.writer.finalize({
          ok: false,
          durationMs: Date.now() - t0,
          toolCount,
        });
      }
      new Notice(`起動失敗: ${msg}`);
      if (this.uiLive) {
        if (this.statusEl) this.statusEl.setText(`起動失敗: ${msg}`);
        if (this.runBtn) {
          this.runBtn.disabled = false;
          this.runBtn.setText("🔁 再試行");
        }
        if (this.abortBtn) this.abortBtn.disabled = true;
        if (this.promptArea) this.promptArea.disabled = false;
        if (this.modeSelect) this.modeSelect.disabled = false;
      }
    }
  }
}
