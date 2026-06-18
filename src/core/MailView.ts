import { ItemView, Notice, Plugin, WorkspaceLeaf } from "obsidian";
import { VIEW_TYPE_MAIL } from "./constants";
import { GoogleOAuth, hasScope } from "../auth/googleOAuth";
import {
  listThreads,
  getThread,
  modifyMessageLabels,
  senderDisplayName,
  type GmailThreadSummary,
  type GmailThread,
} from "../adapters/gmail";
import { loadMailConfig, type MailConfig } from "./mailConfig";

const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.modify";

export class MailView extends ItemView {
  private plugin: Plugin;
  private oauth: GoogleOAuth;
  private config!: MailConfig;
  private listEl!: HTMLElement;
  private detailEl!: HTMLElement;
  private pendingThreadId: string | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: Plugin) {
    super(leaf);
    this.plugin = plugin;
    this.oauth = new GoogleOAuth(plugin);
  }

  getViewType(): string {
    return VIEW_TYPE_MAIL;
  }
  getDisplayText(): string {
    return "メール";
  }
  getIcon(): string {
    return "mail";
  }

  async onOpen(): Promise<void> {
    this.config = await loadMailConfig(this.plugin);
    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    root.addClass("nd-mail-view");

    const toolbar = root.createDiv({ cls: "nd-mail-toolbar" });
    const refreshBtn = toolbar.createEl("button", { text: "⟳ 更新" });
    refreshBtn.addEventListener("click", () => void this.refresh());
    const composeBtn = toolbar.createEl("button", { text: "✏ 新規作成", cls: "mod-cta" });
    composeBtn.addEventListener("click", () => this.openCompose());

    const body = root.createDiv({ cls: "nd-mail-body" });
    this.listEl = body.createDiv({ cls: "nd-mail-list" });
    this.detailEl = body.createDiv({ cls: "nd-mail-detail" });

    await this.refresh();
  }

  async onClose(): Promise<void> {
    this.containerEl.children[1].empty();
  }

  /** Open a specific thread (called from the dashboard widget). */
  openThread(threadId: string): void {
    this.pendingThreadId = threadId;
    if (this.detailEl) void this.showThread(threadId);
  }

  private openCompose(): void {
    new Notice("作成機能は次フェーズで実装されます");
  }

  private async ensureAuth(): Promise<boolean> {
    const tokens = await this.oauth.getTokens();
    if (!hasScope(tokens, GMAIL_SCOPE)) {
      this.listEl.empty();
      const empty = this.listEl.createDiv({ cls: "nd-empty" });
      empty.createEl("p", {
        text: "Gmail の認証が必要です。設定 → Notion Dashboard → 「再認証」を実行してください。",
      });
      return false;
    }
    return true;
  }

  private async refresh(): Promise<void> {
    if (!this.listEl) return;
    if (!(await this.ensureAuth())) return;
    this.listEl.empty();
    const status = this.listEl.createDiv({ cls: "nd-muted", text: "読み込み中…" });
    try {
      const threads = await listThreads(this.oauth, this.config.query, this.config.maxItems);
      status.remove();
      if (threads.length === 0) {
        this.listEl.createEl("p", { cls: "nd-empty", text: "メールはありません 🎉" });
        return;
      }
      for (const t of threads) this.renderRow(t);
      if (this.pendingThreadId) {
        void this.showThread(this.pendingThreadId);
        this.pendingThreadId = null;
      }
    } catch (e) {
      status.remove();
      this.listEl.createEl("pre", { cls: "nd-error", text: `Gmail error: ${(e as Error).message}` });
    }
  }

  private renderRow(t: GmailThreadSummary): void {
    const row = this.listEl.createDiv({ cls: "nd-mail-row" });
    if (t.unread) row.addClass("nd-mail-unread");
    row.createEl("div", { cls: "nd-mail-from", text: senderDisplayName(t.from) });
    row.createEl("div", { cls: "nd-mail-subject", text: t.subject });
    row.createEl("div", { cls: "nd-mail-snippet nd-muted", text: t.snippet });
    row.addEventListener("click", () => void this.showThread(t.id));
  }

  private async showThread(threadId: string): Promise<void> {
    this.detailEl.empty();
    const status = this.detailEl.createDiv({ cls: "nd-muted", text: "読み込み中…" });
    try {
      const thread = await getThread(this.oauth, threadId);
      status.remove();
      this.renderThread(thread);
      // 既読化: 未読メッセージから UNREAD を外す
      for (const m of thread.messages) {
        if (m.labelIds.includes("UNREAD")) {
          void modifyMessageLabels(this.oauth, m.id, [], ["UNREAD"]).catch(() => {
            /* 既読化失敗は致命的でないため握りつぶす（次回更新で再試行される） */
          });
        }
      }
    } catch (e) {
      status.remove();
      this.detailEl.createEl("pre", { cls: "nd-error", text: `Gmail error: ${(e as Error).message}` });
    }
  }

  private renderThread(thread: GmailThread): void {
    for (const m of thread.messages) {
      const card = this.detailEl.createDiv({ cls: "nd-mail-msg" });
      const head = card.createDiv({ cls: "nd-mail-msg-head" });
      head.createEl("div", { cls: "nd-mail-msg-from", text: m.from });
      head.createEl("div", { cls: "nd-mail-msg-date nd-muted", text: m.date.toLocaleString() });
      card.createEl("div", { cls: "nd-mail-msg-subject", text: m.subject });
      card.createEl("pre", { cls: "nd-mail-msg-body", text: m.bodyText || m.snippet });
      if (m.attachments.length > 0) {
        const att = card.createDiv({ cls: "nd-mail-attachments nd-muted" });
        att.setText(`📎 添付 ${m.attachments.length}件: ${m.attachments.map((a) => a.filename).join(", ")}`);
      }
    }
  }
}
