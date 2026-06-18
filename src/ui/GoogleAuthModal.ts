import { App, Modal, Notice, Setting } from "obsidian";
import { GoogleOAuth } from "../auth/googleOAuth";

export class GoogleAuthModal extends Modal {
  private oauth: GoogleOAuth;

  constructor(app: App, oauth: GoogleOAuth) {
    super(app);
    this.oauth = oauth;
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Google Calendar 認証" });

    const intro = contentEl.createDiv({ cls: "nd-muted" });
    intro.createEl("p", {
      text: "1. Google Cloud Console で OAuth 2.0 Client (Desktop) を作成 → credential.json をダウンロード",
    });
    intro.createEl("p", {
      text: "2. 同意画面に Calendar API のスコープ (.../auth/calendar.readonly) を追加 + テストユーザーに自分を入れる",
    });
    intro.createEl("p", {
      text: "3. 下の入力欄に貼り付け → 認証ボタン",
    });

    const creds = (await this.oauth.getCredentials()) ?? { client_id: "", client_secret: "" };
    const tokens = await this.oauth.getTokens();

    new Setting(contentEl)
      .setName("credential.json (貼り付け)")
      .setDesc("ダウンロードしたJSONの中身全部、または客户端ID/secretだけ")
      .addTextArea((t) => {
        t.setValue("");
        t.inputEl.rows = 6;
        t.inputEl.addClass("deck-input-full");
        t.inputEl.placeholder = '{"installed":{"client_id":"...","client_secret":"..."}}';
        t.onChange(async (v) => {
          const parsed = parseCredentialJson(v);
          if (parsed) {
            creds.client_id = parsed.client_id;
            creds.client_secret = parsed.client_secret;
            clientIdInput.setValue(parsed.client_id);
            clientSecretInput.setValue(parsed.client_secret);
          }
        });
      });

    let clientIdInput!: { setValue: (v: string) => void };
    let clientSecretInput!: { setValue: (v: string) => void };

    new Setting(contentEl).setName("client_id").addText((t) => {
      clientIdInput = t;
      t.setValue(creds.client_id);
      t.inputEl.addClass("deck-input-full");
      t.onChange((v) => (creds.client_id = v.trim()));
    });
    new Setting(contentEl).setName("client_secret").addText((t) => {
      clientSecretInput = t;
      t.setValue(creds.client_secret);
      t.inputEl.addClass("deck-input-full");
      t.onChange((v) => (creds.client_secret = v.trim()));
    });

    const status = contentEl.createDiv({ cls: "nd-muted" });
    const renderStatus = async () => {
      const has = (await this.oauth.getTokens()) !== null;
      status.empty();
      status.createEl("p", {
        text: has ? "状態: ✅ 認証済み" : "状態: ❌ 未認証",
      });
    };
    if (tokens) await renderStatus();
    else status.createEl("p", { text: "状態: ❌ 未認証" });

    const btnRow = contentEl.createDiv({ cls: "nd-btn-row" });

    const signoutBtn = btnRow.createEl("button", { text: "サインアウト" });
    signoutBtn.addEventListener("click", async () => {
      await this.oauth.clearTokens();
      new Notice("サインアウトしました");
      await renderStatus();
    });

    const saveBtn = btnRow.createEl("button", { text: "credential 保存" });
    saveBtn.addEventListener("click", async () => {
      if (!creds.client_id || !creds.client_secret) {
        new Notice("client_id と client_secret 両方必要です");
        return;
      }
      await this.oauth.setCredentials(creds);
      new Notice("credential を保存しました");
    });

    const spacer = btnRow.createDiv();
    spacer.addClass("deck-spacer");

    const authBtn = btnRow.createEl("button", { text: "認証を開始", cls: "mod-cta" });
    authBtn.addEventListener("click", async () => {
      if (!creds.client_id || !creds.client_secret) {
        new Notice("先に credential を保存");
        return;
      }
      await this.oauth.setCredentials(creds);
      try {
        await this.oauth.authenticate();
        await renderStatus();
      } catch (e) {
        new Notice(`認証失敗: ${(e as Error).message}`);
      }
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

function parseCredentialJson(
  raw: string
): { client_id: string; client_secret: string } | null {
  try {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const obj = JSON.parse(trimmed);
    // Google credential.json shape: { installed: { client_id, client_secret, ... } }
    //                            or { web: { client_id, client_secret, ... } }
    const inner = obj.installed ?? obj.web ?? obj;
    if (typeof inner.client_id === "string" && typeof inner.client_secret === "string") {
      return { client_id: inner.client_id, client_secret: inner.client_secret };
    }
  } catch {
    // not JSON, ignore
  }
  return null;
}
