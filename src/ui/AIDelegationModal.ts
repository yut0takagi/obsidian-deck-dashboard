import { App, Modal, Notice, Setting, TFile } from "obsidian";
import { runClaudeStream, StreamEvent } from "../adapters/claudeCodeStream";

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
}

export class AIDelegationModal extends Modal {
  private opts: AIDelegationOptions;
  private promptArea: HTMLTextAreaElement | null = null;
  private modeSelect: HTMLSelectElement | null = null;
  private runBtn: HTMLButtonElement | null = null;
  private cancelBtn: HTMLButtonElement | null = null;
  private logEl: HTMLElement | null = null;
  private statusEl: HTMLElement | null = null;
  private session: ReturnType<typeof runClaudeStream> | null = null;

  constructor(opts: AIDelegationOptions) {
    super(opts.app);
    this.opts = opts;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("nd-ai-delegate-modal");
    contentEl.createEl("h2", { text: `✨ AI移譲: ${this.opts.taskFile.basename}` });

    const warn = contentEl.createDiv({ cls: "nd-ai-delegate-warn" });
    warn.setText(
      "⚠️  AIにファイル編集・シェルコマンド実行を許可します。" +
        " permission-mode に応じて確認なしで実行されるアクションがあります。"
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
    promptLabel.style.fontWeight = "600";
    promptLabel.style.display = "block";
    promptLabel.style.marginTop = "12px";
    this.promptArea = contentEl.createEl("textarea", {
      cls: "nd-ai-delegate-prompt",
    });
    this.promptArea.value = DEFAULT_PROMPT_TEMPLATE.replace(
      /\{\{TASK_PATH\}\}/g,
      this.opts.taskFile.path
    );
    this.promptArea.rows = 10;

    const btnRow = contentEl.createDiv({ cls: "nd-ai-delegate-buttons" });
    this.cancelBtn = btnRow.createEl("button", { text: "閉じる" });
    this.cancelBtn.addEventListener("click", () => {
      if (this.session) {
        this.session.cancel();
        new Notice("AIセッションをキャンセルしました");
      }
      this.close();
    });
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
    if (this.session) {
      this.session.cancel();
    }
    this.contentEl.empty();
  }

  private async run(): Promise<void> {
    if (!this.promptArea || !this.modeSelect || !this.runBtn) return;
    const prompt = this.promptArea.value.trim();
    if (!prompt) {
      new Notice("指示が空です");
      return;
    }
    const mode = this.modeSelect.value as "acceptEdits" | "bypassPermissions";
    this.runBtn.disabled = true;
    this.runBtn.setText("実行中…");
    if (this.logEl) this.logEl.empty();
    if (this.statusEl) this.statusEl.setText("claude起動中…");

    const t0 = Date.now();
    let textBuf = "";
    let toolCount = 0;

    const onEvent = (e: StreamEvent): void => {
      const log = this.logEl;
      if (!log) return;
      const line = log.createDiv({ cls: `nd-ai-log-line nd-ai-log-${e.kind}` });
      const ts = new Date().toLocaleTimeString();
      line.createSpan({ cls: "nd-ai-log-ts", text: ts });
      const body = line.createSpan({ cls: "nd-ai-log-body" });

      if (e.kind === "system") {
        body.setText(e.text ?? "(system)");
      } else if (e.kind === "text") {
        body.setText(e.text ?? "");
        textBuf += (e.text ?? "") + "\n";
      } else if (e.kind === "tool_use") {
        toolCount++;
        body.setText(`🔧 ${e.text}`);
      } else if (e.kind === "tool_result") {
        body.setText(`  ↳ ${e.text}`);
        if (e.isError) line.addClass("nd-ai-log-error");
      } else if (e.kind === "result") {
        const dur = ((Date.now() - t0) / 1000).toFixed(1);
        body.setText(`✅ 完了 (${dur}s, tools=${toolCount})`);
      } else if (e.kind === "stderr") {
        body.setText(`stderr: ${e.text}`);
      } else if (e.kind === "error") {
        body.setText(`❌ ${e.text}`);
        line.addClass("nd-ai-log-error");
      }
      log.scrollTop = log.scrollHeight;
    };

    try {
      this.session = runClaudeStream({
        prompt,
        cwd: this.opts.vaultRoot,
        claudeCmd: this.opts.claudeCmd ?? "claude",
        permissionMode: mode,
        onEvent,
      });
      if (this.statusEl) this.statusEl.setText("実行中…");
      const res = await this.session.done;
      this.session = null;
      const dur = ((Date.now() - t0) / 1000).toFixed(1);
      if (this.statusEl) {
        this.statusEl.setText(
          res.ok ? `完了 ${dur}s` : `エラー (code=${res.code})`
        );
      }
      if (this.runBtn) {
        this.runBtn.disabled = false;
        this.runBtn.setText(res.ok ? "✅ 再実行" : "🔁 再試行");
      }
      if (res.ok) {
        new Notice(`AI移譲完了: ${this.opts.taskFile.basename} (${dur}s)`);
      } else if (this.statusEl) {
        new Notice(`AI移譲失敗 — ログを確認してください`);
      }
      // textBuf is incremental assistant text; final result is also captured in
      // res.finalText. Claude itself should have appended to the task file via
      // its Edit tool. We don't auto-append a duplicate.
    } catch (e) {
      const msg = (e as Error).message;
      if (this.statusEl) this.statusEl.setText(`起動失敗: ${msg}`);
      new Notice(`起動失敗: ${msg}`);
      if (this.runBtn) {
        this.runBtn.disabled = false;
        this.runBtn.setText("🔁 再試行");
      }
    }
  }
}
