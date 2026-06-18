import { App, Modal, Notice, TFile } from "obsidian";
import {
  AISessionRegistry,
  SessionEntry,
  getAISessionRegistry,
} from "../core/AISessionRegistry";
import { AIDelegationModal } from "./AIDelegationModal";

export interface AISessionListOptions {
  app: App;
  vaultRoot: string;
  registry?: AISessionRegistry;
}

/** Lightweight list of all current / recently-finished AI delegation sessions. */
export class AISessionListModal extends Modal {
  private registry: AISessionRegistry;
  private vaultRoot: string;
  private unsubscribe: (() => void) | null = null;

  constructor(opts: AISessionListOptions) {
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
    contentEl.createEl("h2", { text: "🤖 AI移譲セッション" });

    const entries = this.registry.list();
    if (entries.length === 0) {
      contentEl.createEl("p", {
        cls: "nd-empty",
        text: "アクティブなAI移譲セッションはありません",
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
      const reopenBtn = actions.createEl("button", { text: "📺 開く" });
      reopenBtn.addEventListener("click", () => this.reopen(entry));

      const abortBtn = actions.createEl("button", { text: "🛑 中止" });
      abortBtn.addEventListener("click", () => {
        if (this.registry.abort(entry.taskPath)) {
          new Notice(`中止: ${entry.taskBasename}`);
        }
      });
    } else {
      const removeBtn = actions.createEl("button", { text: "✖" });
      removeBtn.setAttribute("aria-label", "リストから削除");
      removeBtn.addEventListener("click", () => {
        this.registry.remove(entry.taskPath);
      });
    }

    const logBtn = actions.createEl("button", { text: "📄 ログ" });
    logBtn.addEventListener("click", () => void this.openLog(entry));
  }

  private reopen(entry: SessionEntry): void {
    const f = this.app.vault.getAbstractFileByPath(entry.taskPath);
    if (!(f instanceof TFile)) {
      new Notice(`タスクファイル不在: ${entry.taskPath}`);
      return;
    }
    new AIDelegationModal({
      app: this.app,
      taskFile: f,
      vaultRoot: this.vaultRoot,
      registry: this.registry,
    }).open();
    this.close();
  }

  private async openLog(entry: SessionEntry): Promise<void> {
    const f = this.app.vault.getAbstractFileByPath(entry.writer.path);
    if (!(f instanceof TFile)) {
      new Notice(`ログファイルが見つかりません: ${entry.writer.path}`);
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
