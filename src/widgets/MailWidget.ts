import { Setting } from "obsidian";
import type { WidgetDefinition } from "./types";
import { GoogleOAuth, hasScope } from "../auth/googleOAuth";
import { listThreads, type GmailThreadSummary } from "../adapters/gmail";
import { MailView } from "../core/MailView";
import { VIEW_TYPE_MAIL } from "../core/constants";

const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.modify";

interface Settings {
  query: string;
  maxItems: number;
}

async function openMailViewAt(app: any, threadId: string): Promise<void> {
  let leaf = app.workspace.getLeavesOfType(VIEW_TYPE_MAIL)[0];
  if (!leaf) {
    leaf = app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: VIEW_TYPE_MAIL, active: true });
  }
  app.workspace.revealLeaf(leaf);
  const view = leaf.view;
  if (view instanceof MailView) view.openThread(threadId);
}

export const mailWidget: WidgetDefinition<Settings> = {
  type: "mail",
  label: "メール (Gmail)",
  description: "Gmail の受信一覧をコンパクト表示。クリックでメールペインを開く。OAuth(gmail)認証が必要。",
  defaultSettings: () => ({ query: "in:inbox", maxItems: 8 }),
  async render(el, settings, ctx) {
    el.empty();
    el.addClass("nd-widget-mail");
    const oauth = new GoogleOAuth(ctx.plugin);
    const tokens = await oauth.getTokens();
    if (!hasScope(tokens, GMAIL_SCOPE)) {
      const empty = el.createDiv({ cls: "nd-empty" });
      empty.createEl("p", { text: "Gmail 認証が必要です（設定 → Notion Dashboard → 再認証）。" });
      return;
    }

    const toolbar = el.createDiv({ cls: "nd-mail-widget-toolbar" });
    const openBtn = toolbar.createEl("button", { text: "✏ 作成" });
    openBtn.addEventListener("click", () => void openMailViewAt(ctx.app, ""));
    const refreshBtn = toolbar.createEl("button", { text: "⟳ 更新" });
    refreshBtn.addEventListener("click", () => void mailWidget.render(el, settings, ctx));

    const status = el.createDiv({ cls: "nd-muted", text: "読み込み中…" });
    try {
      const threads = await listThreads(oauth, settings.query || "in:inbox", settings.maxItems);
      status.remove();
      if (threads.length === 0) {
        el.createEl("p", { cls: "nd-empty", text: "メールなし 🎉" });
        return;
      }
      const ul = el.createEl("ul", { cls: "nd-mail-widget-list" });
      for (const t of threads) {
        const li = ul.createEl("li", { cls: "nd-mail-widget-item" });
        if (t.unread) li.addClass("nd-mail-unread");
        li.createEl("span", { cls: "nd-mail-subject", text: t.subject });
        li.createEl("span", { cls: "nd-mail-from nd-muted", text: ` — ${shortFrom(t)}` });
        li.addEventListener("click", () => void openMailViewAt(ctx.app, t.id));
      }
    } catch (e) {
      status.remove();
      el.createEl("pre", { cls: "nd-error", text: `Gmail error: ${(e as Error).message}` });
    }
  },
  renderSettingsForm(container, settings, onChange) {
    new Setting(container)
      .setName("検索クエリ")
      .setDesc("Gmail 検索構文。例: in:inbox / is:unread / from:boss@x.com")
      .addText((t) => {
        t.setValue(settings.query);
        t.inputEl.style.width = "100%";
        t.onChange((v) => onChange({ ...settings, query: v.trim() || "in:inbox" }));
      });
    new Setting(container)
      .setName("表示件数")
      .addText((t) =>
        t.setValue(String(settings.maxItems)).onChange((v) => {
          const n = parseInt(v, 10);
          if (!isNaN(n) && n > 0) onChange({ ...settings, maxItems: n });
        })
      );
  },
};

function shortFrom(t: GmailThreadSummary): string {
  const m = t.from.match(/^\s*"?([^"<]+?)"?\s*</);
  return (m ? m[1] : t.from).trim();
}
