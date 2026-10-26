import { App, Modal, Notice, Setting } from "obsidian";
import { GoogleOAuth } from "../auth/googleOAuth";
import { t } from "../core/i18n";

export class GoogleAuthModal extends Modal {
  private oauth: GoogleOAuth;

  constructor(app: App, oauth: GoogleOAuth) {
    super(app);
    this.oauth = oauth;
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: t().googleAuthGoogleCalendarAuthentication });

    const intro = contentEl.createDiv({ cls: "nd-muted" });
    intro.createEl("p", {
      text: t().googleAuth1CreateAnOauth2,
    });
    intro.createEl("p", {
      text: t().googleAuth2AddTheCalendarApi,
    });
    intro.createEl("p", {
      text: t().googleAuth3PasteItIntoThe,
    });

    const creds = (await this.oauth.getCredentials()) ?? { client_id: "", client_secret: "" };
    const tokens = await this.oauth.getTokens();

    new Setting(contentEl)
      .setName(t().googleAuthCredentialsJsonPaste)
      .setDesc(t().googleAuthPasteTheCompleteDownloadedJson)
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
        text: has ? t().googleAuthStatusAuthenticated : t().googleAuthStatusNotAuthenticated,
      });
    };
    if (tokens) await renderStatus();
    else status.createEl("p", { text: t().googleAuthStatusNotAuthenticated });

    const btnRow = contentEl.createDiv({ cls: "nd-btn-row" });

    const signoutBtn = btnRow.createEl("button", { text: t().googleAuthSignOut });
    signoutBtn.addEventListener("click", () => {
      void (async () => {
        await this.oauth.clearTokens();
        new Notice(t().googleAuthSignedOut);
        await renderStatus();
      })();
    });

    const saveBtn = btnRow.createEl("button", { text: t().googleAuthSaveCredentials });
    saveBtn.addEventListener("click", () => {
      void (async () => {
        if (!creds.client_id || !creds.client_secret) {
          new Notice(t().googleAuthBothClientIdAndClient);
          return;
        }
        await this.oauth.setCredentials(creds);
        new Notice(t().googleAuthCredentialsSaved);
      })();
    });

    const spacer = btnRow.createDiv();
    spacer.addClass("deck-spacer");

    const authBtn = btnRow.createEl("button", { text: t().googleAuthStartAuthentication, cls: "mod-cta" });
    authBtn.addEventListener("click", () => {
      void (async () => {
        if (!creds.client_id || !creds.client_secret) {
          new Notice(t().googleAuthSaveCredentialsFirst);
          return;
        }
        await this.oauth.setCredentials(creds);
        try {
          await this.oauth.authenticate();
          await renderStatus();
        } catch (e) {
          new Notice(t().googleAuthAuthenticationFailed((e as Error).message));
        }
      })();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

/** Minimal shape of a Google OAuth client credential section. */
interface CredentialSection {
  client_id?: unknown;
  client_secret?: unknown;
}
/** Google credential.json may wrap the section under `installed` or `web`. */
interface CredentialJson extends CredentialSection {
  installed?: CredentialSection;
  web?: CredentialSection;
}

function parseCredentialJson(
  raw: string
): { client_id: string; client_secret: string } | null {
  try {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const obj = JSON.parse(trimmed) as CredentialJson;
    // Google credential.json shape: { installed: { client_id, client_secret, ... } }
    //                            or { web: { client_id, client_secret, ... } }
    const inner: CredentialSection = obj.installed ?? obj.web ?? obj;
    if (typeof inner.client_id === "string" && typeof inner.client_secret === "string") {
      return { client_id: inner.client_id, client_secret: inner.client_secret };
    }
  } catch {
    // not JSON, ignore
  }
  return null;
}
