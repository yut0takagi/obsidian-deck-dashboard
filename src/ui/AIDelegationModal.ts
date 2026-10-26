import { App, Modal, Notice, Setting, TFile } from "obsidian";
import type { StreamEvent } from "../adapters/claudeCodeStream";
import {
  AISessionRegistry,
  SessionEntry,
  getAISessionRegistry,
} from "../core/AISessionRegistry";
import { t } from "../core/i18n";
import type { DeckSettings } from "../core/settings";
import { requireClaudeCommand } from "../ai/claudeCommandGuard";

const DEFAULT_PROMPT_TEMPLATE = t().aiDelegationDoEveryPartOfThe;

export interface AIDelegationOptions {
  app: App;
  taskFile: TFile;
  vaultRoot: string;
  /**
   * Plugin settings: the log folder (running is blocked while empty) and the
   * Claude Code command, which is only ever taken from here.
   */
  settings: DeckSettings;
  /** Opens Settings → Deck (offered when logFolder is empty). */
  openSettings?: () => void;
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
    contentEl.createEl("h2", { text: t().aiDelegationAiDelegation(this.opts.taskFile.basename) });

    const warn = contentEl.createDiv({ cls: "nd-ai-delegate-warn" });
    warn.setText(
      t().aiDelegationThisLetsTheAiEdit +
        t().aiDelegationClosingThisWindowKeepsThe +
        t().aiDelegationAndTheLogIsWritten(this.opts.settings.aiLogFolder || t().notSetPlaceholder) +
        t().aiDelegationReopenItFromAiAt
    );

    new Setting(contentEl)
      .setName("Permission Mode")
      .setDesc(t().aiDelegationAccepteditsEditsAreApprovedAutomatically)
      .addDropdown((d) => {
        d.addOption("acceptEdits", t().aiDelegationAccepteditsRecommended);
        d.addOption("bypassPermissions", t().aiDelegationBypasspermissionsFullyAutomatic);
        d.setValue("acceptEdits");
        this.modeSelect = d.selectEl;
      });

    const promptLabel = contentEl.createEl("label", { text: t().aiDelegationInstructionsForAi });
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

    this.openLogBtn = btnRow.createEl("button", { text: t().aiDelegationOpenLog });
    this.openLogBtn.disabled = true;
    this.openLogBtn.addEventListener("click", () => void this.openLogFile());

    this.abortBtn = btnRow.createEl("button", { text: t().aiDelegationStopped });
    this.abortBtn.disabled = true;
    this.abortBtn.addEventListener("click", () => this.abortSession());

    this.closeBtn = btnRow.createEl("button", { text: t().aiDelegationClose });
    this.closeBtn.addEventListener("click", () => this.close());

    this.runBtn = btnRow.createEl("button", {
      text: t().aiDelegationDelegateToAi,
      cls: "mod-cta",
    });
    this.runBtn.addEventListener("click", () => void this.run());

    if (!this.opts.settings.aiLogFolder) {
      // Without a log folder there is nowhere to record what the AI did.
      this.runBtn.disabled = true;
      const notice = contentEl.createDiv({ cls: "nd-empty nd-setup-notice" });
      notice.createEl("p", { text: t().setFirstNotice(t().aiLogFolderName) });
      const open = this.opts.openSettings;
      if (open) {
        const btn = notice.createEl("button", { cls: "mod-cta", text: t().openSettings });
        btn.addEventListener("click", () => {
          this.close();
          open();
        });
      }
    }

    this.statusEl = contentEl.createDiv({ cls: "nd-ai-delegate-status nd-muted" });
    this.statusEl.setText(t().aiDelegationWaiting);
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
      new Notice(t().aiDelegationAiDelegationContinuesLog(this.entry.writer.path), 6000);
    }
    this.contentEl.empty();
  }

  private async openLogFile(): Promise<void> {
    if (!this.entry) return;
    const f = this.app.vault.getAbstractFileByPath(this.entry.writer.path);
    if (!(f instanceof TFile)) {
      new Notice(t().aiDelegationLogFileNotFound(this.entry.writer.path));
      return;
    }
    const leaf = this.app.workspace.getLeaf("split");
    await leaf.openFile(f);
  }

  private abortSession(): void {
    if (!this.entry) return;
    if (this.registry.abort(this.entry.taskPath)) {
      new Notice(t().aiDelegationAiSessionStopped);
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
      new Notice(t().aiDelegationStatusUpdateFailed((e as Error).message));
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
        entry.status === "running" ? t().aiDelegationRunning : entry.status === "completed" ? t().aiDelegationComplete : t().aiDelegationCannotRunAgain
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
          this.runBtn.setText(entry.status === "completed" ? t().aiDelegationRunAgain : t().aiDelegationRetry);
        }
        if (this.promptArea) this.promptArea.disabled = entry.status === "running";
        if (this.modeSelect) this.modeSelect.disabled = entry.status === "running";
      }
    });
  }

  private describeStatus(entry: SessionEntry): string {
    if (entry.status === "running") return t().aiDelegationRunningContinuesWhenClosed;
    if (entry.status === "completed") {
      const sec = entry.final ? (entry.final.durationMs / 1000).toFixed(1) : "?";
      return t().aiDelegationCompletedS(sec);
    }
    if (entry.status === "cancelled") return t().aiDelegationStopped2;
    if (entry.status === "error") return t().aiDelegationErrorCode(entry.final?.code ?? "?");
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
      body.setText(t().aiDelegationText(e.text ?? t().doneLabel));
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
      new Notice(t().aiDelegationAlreadyRunning);
      return;
    }
    const prompt = this.promptArea.value.trim();
    if (!prompt) {
      new Notice(t().aiDelegationInstructionsAreEmpty);
      return;
    }
    const mode = this.modeSelect.value as "acceptEdits" | "bypassPermissions";
    let claudeCmd: string;
    try {
      claudeCmd = requireClaudeCommand(this.opts.settings);
    } catch (e) {
      new Notice((e as Error).message, 10000);
      return;
    }

    this.runBtn.disabled = true;
    this.runBtn.setText(t().aiDelegationStarting);
    this.promptArea.disabled = true;
    this.modeSelect.disabled = true;
    if (this.statusEl) this.statusEl.setText(t().aiDelegationStartingClaude);

    let entry: SessionEntry;
    try {
      entry = await this.registry.start({
        app: this.app,
        taskFile: this.opts.taskFile,
        vaultRoot: this.opts.vaultRoot,
        permissionMode: mode,
        prompt,
        claudeCmd,
        logFolder: this.opts.settings.aiLogFolder,
        onFinalize: async (e, final) => {
          if (final.ok) {
            const moved = await this.advanceStatus();
            const tail = moved ? ` → ${this.opts.successStatus ?? "レビュー待ち"}` : "";
            new Notice(
              t().aiDelegationAiDelegationCompletedS(e.taskBasename, (final.durationMs / 1000).toFixed(1), tail)
            );
          } else if (final.cancelled) {
            new Notice(t().aiDelegationAiDelegationStopped(e.taskBasename));
          } else {
            new Notice(t().aiDelegationAiDelegationFailedCodeSee(final.code));
          }
        },
      });
    } catch (e) {
      const msg = (e as Error).message;
      new Notice(t().aiDelegationFailedToStart(msg));
      if (this.uiLive) {
        if (this.statusEl) this.statusEl.setText(t().aiDelegationFailedToStart(msg));
        if (this.runBtn) {
          this.runBtn.disabled = false;
          this.runBtn.setText(t().aiDelegationRetry);
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
