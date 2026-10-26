import { App, Modal, Notice, Plugin } from "obsidian";
import { GoogleOAuth } from "../auth/googleOAuth";
import { t } from "../core/i18n";
import {
  createDraft,
  getProfile,
  gmailDraftUrl,
  gmailDraftsListUrl,
  type DraftInput,
  type DraftAttachment,
} from "../adapters/gmail";

export interface ComposeOptions {
  mode: "new" | "reply" | "forward";
  to?: string;
  cc?: string;
  subject?: string;
  bodyText?: string;
  threadId?: string;
  inReplyTo?: string;
  references?: string;
  /** Non-editable info shown above the form (e.g. AI summary + sources). NOT included in the sent mail. */
  infoBanner?: string;
}

export class MailComposeModal extends Modal {
  private oauth: GoogleOAuth;

  constructor(app: App, private plugin: Plugin, private opts: ComposeOptions) {
    super(app);
    this.oauth = new GoogleOAuth(plugin);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("nd-mail-compose");
    contentEl.createEl("h3", {
      text: this.opts.mode === "reply" ? t().mailComposeReply : this.opts.mode === "forward" ? t().mailComposeForward : t().mailComposeCompose,
    });

    if (this.opts.infoBanner) {
      const info = contentEl.createDiv({ cls: "nd-mail-compose-info" });
      info.createEl("div", {
        cls: "nd-mail-compose-info-label nd-muted",
        text: t().mailComposeAiSummaryAndSourcesNot,
      });
      info.createEl("pre", { cls: "nd-mail-compose-info-body", text: this.opts.infoBanner });
    }

    const toInput = labeledInput(contentEl, "To", this.opts.to ?? "");
    const ccInput = labeledInput(contentEl, "Cc", this.opts.cc ?? "");
    const subjectInput = labeledInput(contentEl, t().mailComposeSubject, this.opts.subject ?? "");
    const bodyInput = contentEl.createEl("textarea", {
      cls: "nd-mail-compose-body",
      attr: { rows: "14", placeholder: t().mailComposeMessage },
    });
    bodyInput.value = this.opts.bodyText ?? "";

    const attachments: DraftAttachment[] = [];
    const attRow = contentEl.createDiv({ cls: "nd-mail-compose-attrow" });
    const fileInput = attRow.createEl("input", { type: "file", attr: { multiple: "true" } });
    const attList = attRow.createDiv({ cls: "nd-muted" });
    fileInput.addEventListener("change", () => {
      void (async () => {
        attachments.length = 0;
        const files = Array.from(fileInput.files ?? []);
        for (const file of files) {
          const buf = new Uint8Array(await file.arrayBuffer());
          attachments.push({ filename: file.name, mimeType: file.type || "application/octet-stream", data: buf });
        }
        attList.setText(attachments.length ? `📎 ${attachments.map((a) => a.filename).join(", ")}` : "");
      })();
    });

    const buttons = contentEl.createDiv({ cls: "modal-button-container" });
    const cancel = buttons.createEl("button", { text: t().mailComposeCancel });
    cancel.addEventListener("click", () => this.close());
    const send = buttons.createEl("button", { text: t().mailComposeReviewAndSendInGmail, cls: "mod-cta" });
    send.addEventListener("click", () => {
      void (async () => {
        if (!toInput.value.trim()) {
          new Notice(t().mailComposeEnterARecipientTo);
          return;
        }
        if (!bodyInput.value.trim()) {
          new Notice(t().mailComposeMessageBodyIsEmpty);
          return;
        }
        send.disabled = true;
        send.setText(t().mailComposeCreatingDraft);
        try {
          const input: DraftInput = {
            to: toInput.value.trim(),
            cc: ccInput.value.trim() || undefined,
            subject: subjectInput.value.trim(),
            bodyText: bodyInput.value,
            threadId: this.opts.threadId,
            inReplyTo: this.opts.inReplyTo,
            references: this.opts.references,
            attachments: attachments.length ? attachments : undefined,
          };
          const result = await createDraft(this.oauth, input);
          const email = (await getProfile(this.oauth)).emailAddress;
          const url = result.messageId
            ? gmailDraftUrl(email, result.messageId)
            : gmailDraftsListUrl(email);
          const win = window.open(url, "_blank");
          if (win) {
            new Notice(t().mailComposeOpenedTheGmailDraftReview);
          } else {
            new Notice(t().mailComposeDraftCreatedOpenItIn(url));
          }
          this.close();
        } catch (e) {
          new Notice(t().mailComposeFailedToCreateDraft((e as Error).message));
          send.disabled = false;
          send.setText(t().mailComposeReviewAndSendInGmail);
        }
      })();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

function labeledInput(parent: HTMLElement, label: string, value: string): HTMLInputElement {
  const row = parent.createDiv({ cls: "nd-mail-compose-row" });
  row.createEl("label", { text: label, cls: "nd-mail-compose-label" });
  const input = row.createEl("input", { type: "text", cls: "nd-mail-compose-input" });
  input.value = value;
  return input;
}
