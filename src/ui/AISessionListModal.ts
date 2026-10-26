import type { DeckSettings } from "../core/settings";
import { App, Modal, Notice, TFile } from "obsidian";
import {
  AISessionRegistry,
  SessionEntry,
  getAISessionRegistry,
} from "../core/AISessionRegistry";
import { AIDelegationModal } from "./AIDelegationModal";
import { t } from "../core/i18n";

export interface AISessionListOptions {
  app: App;
  vaultRoot: string;
  /** Plugin settings, passed on when a session is reopened. */
  settings: DeckSettings;
  openSettings?: () => void;
  registry?: AISessionRegistry;
}

/** Lightweight list of all current / recently-finished AI delegation sessions. */
export class AISessionListModal extends Modal {
  private registry: AISessionRegistry;
  private vaultRoot: string;
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly opts: AISessionListOptions) {
    super(opts.app);
    this.registry = opts.registry ?? getAISessionRegistry();
    this.vaultRoot = opts.vaultRoot;
  }

  onOpen(): void {
    this.modalEl.addClass("nd-ai-list-modal-wrap");
    this.render();
    this.unsubscribe = this.registry.onChange(() => this.render());
  }

  onClose(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.contentEl.empty();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("nd-ai-list-modal");
    contentEl.createEl("h2", { text: t().aiSessionListAiDelegationSessions });

    const entries = this.registry.list();
    if (entries.length === 0) {
      contentEl.createEl("p", {
        cls: "nd-empty",
        text: t().aiSessionListNoActiveAiDelegationSessions,
      });
      return;
    }

    // Running first, then most-recent finished.
    entries.sort((a, b) => {
      if (a.status === "running" && b.status !== "running") return -1;
      if (a.status !== "running" && b.status === "running") return 1;
      return b.startedAt - a.startedAt;
    });

    const list = contentEl.createDiv({ cls: "nd-ai-list" });
    for (const entry of entries) {
      this.renderRow(list, entry);
    }
  }

  private renderRow(parent: HTMLElement, entry: SessionEntry): void {
    const row = parent.createDiv({ cls: `nd-ai-list-row nd-ai-list-${entry.status}` });

    const head = row.createDiv({ cls: "nd-ai-list-head" });
    head.createSpan({ cls: "nd-ai-list-icon", text: this.statusIcon(entry) });
    head.createSpan({ cls: "nd-ai-list-name", text: entry.taskBasename });
    head.createSpan({
      cls: "nd-ai-list-meta",
      text: this.metaLine(entry),
    });

    const actions = row.createDiv({ cls: "nd-ai-list-actions" });

    if (entry.status === "running") {
      const reopenBtn = actions.createEl("button", { text: t().aiSessionListOpen });
      reopenBtn.addEventListener("click", () => this.reopen(entry));

      const abortBtn = actions.createEl("button", { text: t().aiSessionListStopped });
      abortBtn.addEventListener("click", () => {
        if (this.registry.abort(entry.taskPath)) {
          new Notice(t().aiSessionListStopped2(entry.taskBasename));
        }
      });
    } else {
      const removeBtn = actions.createEl("button", { text: "✖" });
      removeBtn.setAttribute("aria-label", t().aiSessionListRemoveFromList);
      removeBtn.addEventListener("click", () => {
        this.registry.remove(entry.taskPath);
      });
    }

    const logBtn = actions.createEl("button", { text: t().aiSessionListLog });
    logBtn.addEventListener("click", () => void this.openLog(entry));
  }

  private reopen(entry: SessionEntry): void {
    const f = this.app.vault.getAbstractFileByPath(entry.taskPath);
    if (!(f instanceof TFile)) {
      new Notice(t().aiSessionListTaskFileNotFound(entry.taskPath));
      return;
    }
    new AIDelegationModal({
      app: this.app,
      taskFile: f,
      vaultRoot: this.vaultRoot,
      settings: this.opts.settings,
      openSettings: this.opts.openSettings,
      registry: this.registry,
    }).open();
    this.close();
  }

  private async openLog(entry: SessionEntry): Promise<void> {
    const f = this.app.vault.getAbstractFileByPath(entry.writer.path);
    if (!(f instanceof TFile)) {
      new Notice(t().aiSessionListLogFileNotFound(entry.writer.path));
      return;
    }
    const leaf = this.app.workspace.getLeaf("split");
    await leaf.openFile(f);
  }

  private statusIcon(entry: SessionEntry): string {
    if (entry.status === "running") return "⚡";
    if (entry.status === "completed") return "✅";
    if (entry.status === "cancelled") return "🛑";
    return "❌";
  }

  private metaLine(entry: SessionEntry): string {
    const sec = Math.round((Date.now() - entry.startedAt) / 1000);
    const dur = entry.final ? Math.round(entry.final.durationMs / 1000) : sec;
    return `${entry.status} · ${dur}s · tools=${entry.toolCount}`;
  }
}
