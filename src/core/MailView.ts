import { ItemView, Notice, Plugin, WorkspaceLeaf } from "obsidian";
import { VIEW_TYPE_MAIL } from "./constants";
import { GoogleOAuth, hasScope } from "../auth/googleOAuth";
import {
  listThreads,
  getThread,
  modifyMessageLabels,
  listLabels,
  trashMessage,
  senderDisplayName,
  buildReplyFields,
  quoteForReply,
  composeQuery,
  type GmailThreadSummary,
  type GmailThread,
  type GmailMessage,
} from "../adapters/gmail";
import { MailComposeModal } from "../ui/MailComposeModal";
import { loadMailConfig, type MailConfig } from "./mailConfig";
import { generateReplyDraft } from "../ai/mailAssist";

const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.modify";

export class MailView extends ItemView {
  private plugin: Plugin;
  private oauth: GoogleOAuth;
  private config!: MailConfig;
  private listEl!: HTMLElement;
  private detailEl!: HTMLElement;
  private pendingThreadId: string | null = null;
  private currentThread: GmailThread | null = null;
  private searchTerm = "";
  private labelFilter = "";

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

    const searchInput = toolbar.createEl("input", {
      type: "text",
      cls: "nd-mail-search",
      attr: { placeholder: "🔍 検索（Enterで実行）" },
    });
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        this.searchTerm = searchInput.value;
        void this.refresh();
      }
    });

    const labelSelect = toolbar.createEl("select", { cls: "nd-mail-label-filter" });
    labelSelect.createEl("option", { text: "全ラベル", value: "" });
    try {
      const labels = await listLabels(this.oauth);
      for (const l of labels.filter((x) => x.type === "user")) {
        labelSelect.createEl("option", { text: l.name, value: l.name });
      }
    } catch {
      /* ラベル取得失敗は無視（フィルタ無しで継続） */
    }
    labelSelect.addEventListener("change", () => {
      this.labelFilter = labelSelect.value;
      void this.refresh();
    });

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
    new MailComposeModal(this.app, this.plugin, { mode: "new" }).open();
  }

  private openReply(m: GmailMessage): void {
    const f = buildReplyFields(m);
    new MailComposeModal(this.app, this.plugin, {
      mode: "reply",
      to: f.to,
      subject: f.subject,
      threadId: f.threadId,
      inReplyTo: f.inReplyTo,
      references: f.references,
      bodyText: quoteForReply(m),
    }).open();
  }

  private openForward(m: GmailMessage): void {
    new MailComposeModal(this.app, this.plugin, {
      mode: "forward",
      subject: /^fwd?:/i.test(m.subject) ? m.subject : `Fwd: ${m.subject}`,
      bodyText: `\n\n---------- Forwarded message ----------\nFrom: ${m.from}\nDate: ${m.date.toLocaleString()}\nSubject: ${m.subject}\n\n${m.bodyText}`,
    }).open();
  }

  private async openAIReply(m: GmailMessage): Promise<void> {
    if (!this.currentThread) return;
    const notice = new Notice("AI返信ドラフト生成中…（スレッド要約＋vault背景）", 0);
    try {
      const result = await generateReplyDraft(this.app, this.plugin, this.currentThread, this.config);
      notice.hide();
      const f = buildReplyFields(m);
      const sourcesLine = result.sources.length ? `参照: ${result.sources.join(", ")}` : "参照: なし";
      const banner = (result.summary ? `${result.summary}\n\n` : "") + sourcesLine;
      new MailComposeModal(this.app, this.plugin, {
        mode: "reply",
        to: f.to,
        subject: f.subject,
        threadId: f.threadId,
        inReplyTo: f.inReplyTo,
        references: f.references,
        bodyText: result.replyDraft,
        infoBanner: banner,
      }).open();
    } catch (e) {
      notice.hide();
      new Notice(`AI返信失敗: ${(e as Error).message}`);
    }
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
      const q = composeQuery(this.config.query, this.searchTerm, this.labelFilter);
      const threads = await listThreads(this.oauth, q, this.config.maxItems);
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
      this.currentThread = thread;
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
      const actions = card.createDiv({ cls: "nd-mail-msg-actions" });
      const replyBtn = actions.createEl("button", { text: "↩ 返信" });
      replyBtn.addEventListener("click", () => this.openReply(m));
      const fwdBtn = actions.createEl("button", { text: "↪ 転送" });
      fwdBtn.addEventListener("click", () => this.openForward(m));
      const aiBtn = actions.createEl("button", { text: "🤖 AI返信" });
      aiBtn.addEventListener("click", () => void this.openAIReply(m));
      const archiveBtn = actions.createEl("button", { text: "🗄 アーカイブ" });
      archiveBtn.addEventListener("click", async () => {
        try {
          await modifyMessageLabels(this.oauth, m.id, [], ["INBOX"]);
          new Notice("アーカイブしました");
          void this.refresh();
        } catch (e) {
          new Notice(`失敗: ${(e as Error).message}`);
        }
      });
      const trashBtn = actions.createEl("button", { text: "🗑 ゴミ箱" });
      trashBtn.addEventListener("click", async () => {
        try {
          await trashMessage(this.oauth, m.id);
          new Notice("ゴミ箱へ移動しました");
          void this.refresh();
        } catch (e) {
          new Notice(`失敗: ${(e as Error).message}`);
        }
      });
      if (m.attachments.length > 0) {
        const att = card.createDiv({ cls: "nd-mail-attachments nd-muted" });
        att.setText(`📎 添付 ${m.attachments.length}件: ${m.attachments.map((a) => a.filename).join(", ")}`);
      }
    }
  }
}
