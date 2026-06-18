import { requestUrl } from "obsidian";
import type { GoogleOAuth } from "../auth/googleOAuth";

const API = "https://www.googleapis.com/gmail/v1/users/me";

/**
 * Node's Buffer is available in the desktop (Electron) runtime but not in
 * browser-only contexts. Resolve it once so the byte/base64 helpers can pick
 * the faster Buffer path when present and fall back to web APIs otherwise.
 * `window`/`self` would be undefined under the Node test runtime, so the
 * lookup deliberately uses the Node global; the disable is scoped to that.
 */
// eslint-disable-next-line no-undef -- Buffer is a desktop-only (Electron/Node) global; guarded by typeof
const nodeBuffer: typeof Buffer | undefined = typeof Buffer !== "undefined" ? Buffer : undefined;

// ---------- gmail REST shapes (minimal) ----------

interface GmailHeader {
  name: string;
  value: string;
}

interface GmailBody {
  data?: string;
  size?: number;
  attachmentId?: string;
}

interface GmailMessagePart {
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: GmailBody;
  parts?: GmailMessagePart[];
}

interface GmailMessageResource {
  id?: string;
  threadId?: string;
  snippet?: string;
  labelIds?: string[];
  payload?: GmailMessagePart;
}

interface GmailThreadResource {
  id?: string;
  snippet?: string;
  messages?: GmailMessageResource[];
}

interface GmailThreadListResource {
  threads?: { id: string }[];
}

interface GmailLabelResource {
  id?: string;
  name?: string;
  type?: string;
}

interface GmailLabelListResource {
  labels?: GmailLabelResource[];
}

interface GmailProfileResource {
  emailAddress?: string;
}

interface GmailAttachmentResource {
  data?: string;
  size?: number;
}

interface GmailDraftResource {
  id?: string;
  message?: { id?: string; threadId?: string };
}

// ---------- encode / decode (pure) ----------

function utf8ToBase64(s: string): string {
  if (nodeBuffer) return nodeBuffer.from(s, "utf-8").toString("base64");
  return bytesToBase64(new TextEncoder().encode(s));
}

function bytesToBase64(bytes: Uint8Array): string {
  if (nodeBuffer) return nodeBuffer.from(bytes).toString("base64");
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

export function base64UrlEncode(input: string | Uint8Array): string {
  const b64 = typeof input === "string" ? utf8ToBase64(input) : bytesToBase64(input);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecode(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  if (nodeBuffer) return nodeBuffer.from(b64, "base64").toString("utf-8");
  return new TextDecoder("utf-8").decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
}

/** RFC 2047 encoded-word for non-ASCII header values (Subject, display names). */
export function encodeRfc2047(value: string): string {
  // eslint-disable-next-line no-control-regex -- intentionally test the ASCII control range to detect header values that need RFC 2047 encoding
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${utf8ToBase64(value)}?=`;
}

function base64ToBytes(b64: string): Uint8Array {
  const std = b64.replace(/-/g, "+").replace(/_/g, "/");
  if (nodeBuffer) return new Uint8Array(nodeBuffer.from(std, "base64"));
  const bin = atob(std);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToUtf8(bytes: Uint8Array): string {
  if (nodeBuffer) return nodeBuffer.from(bytes).toString("utf-8");
  return new TextDecoder("utf-8").decode(bytes);
}

/** Decode RFC 2047 encoded-words (=?UTF-8?B?..?= / =?UTF-8?Q?..?=) found in header values. */
export function decodeRfc2047(value: string): string {
  if (!value || !value.includes("=?")) return value;
  // RFC2047: whitespace between adjacent encoded-words is ignored.
  const joined = value.replace(/(=\?[^?]+\?[BbQq]\?[^?]*\?=)\s+(?==\?)/g, "$1");
  return joined.replace(
    /=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g,
    (_m: string, _charset: string, enc: string, text: string) => {
      try {
        let bytes: Uint8Array;
        if (enc.toUpperCase() === "B") {
          bytes = base64ToBytes(text);
        } else {
          const arr: number[] = [];
          for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            if (ch === "_") arr.push(0x20);
            else if (ch === "=" && i + 2 < text.length) {
              arr.push(parseInt(text.substring(i + 1, i + 3), 16));
              i += 2;
            } else arr.push(ch.charCodeAt(0));
          }
          bytes = new Uint8Array(arr);
        }
        return bytesToUtf8(bytes);
      } catch {
        return _m;
      }
    }
  );
}

/** Extract a human display name from a From header (decoding RFC2047 first). */
export function senderDisplayName(from: string): string {
  const decoded = decodeRfc2047(from);
  const m = decoded.match(/^\s*"?([^"<]+?)"?\s*</);
  return (m ? m[1] : decoded).trim();
}

// ---------- gmail web urls (pure) ----------

function mailBase(email: string): string {
  return `https://mail.google.com/mail/?authuser=${encodeURIComponent(email)}`;
}
export function gmailThreadUrl(email: string, threadId: string): string {
  return `${mailBase(email)}#all/${threadId}`;
}
export function gmailDraftUrl(email: string, draftMessageId: string): string {
  return `${mailBase(email)}#drafts/${draftMessageId}`;
}
export function gmailDraftsListUrl(email: string): string {
  return `${mailBase(email)}#drafts`;
}

// ---------- shared authed request ----------

async function authed<T>(
  oauth: GoogleOAuth,
  path: string,
  init: { method?: "GET" | "POST" | "PUT"; body?: unknown } = {}
): Promise<T> {
  const token = await oauth.getAccessToken();
  const res = await requestUrl({
    url: path.startsWith("http") ? path : `${API}${path}`,
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    throw: false,
  });
  if (res.status >= 400) {
    throw new Error(`Gmail API HTTP ${res.status}: ${res.text}`);
  }
  return res.json as T;
}

// ---------- types ----------

export interface GmailAttachmentMeta {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface GmailMessage {
  id: string;
  threadId: string;
  from: string;
  to: string;
  cc: string;
  subject: string;
  date: Date;
  snippet: string;
  bodyText: string;
  bodyHtml: string;
  labelIds: string[];
  attachments: GmailAttachmentMeta[];
  messageIdHeader: string;
  references: string;
}

export interface GmailThread {
  id: string;
  messages: GmailMessage[];
}

export interface GmailThreadSummary {
  id: string;
  subject: string;
  from: string;
  date: Date;
  snippet: string;
  unread: boolean;
  messageCount: number;
}

export interface GmailLabel {
  id: string;
  name: string;
  type: string;
}

export interface DraftAttachment {
  filename: string;
  mimeType: string;
  data: Uint8Array;
}

export interface DraftInput {
  to: string;
  cc?: string;
  subject: string;
  bodyText: string;
  threadId?: string;
  inReplyTo?: string;
  references?: string;
  from?: string;
  attachments?: DraftAttachment[];
}

// ---------- parsers (pure) ----------

export function getHeader(headers: GmailHeader[], name: string): string {
  const lower = name.toLowerCase();
  const h = (headers ?? []).find((x) => (x.name ?? "").toLowerCase() === lower);
  return h?.value ?? "";
}

function collectParts(
  payload: GmailMessagePart | undefined,
  acc: { text: string[]; html: string[]; attachments: GmailAttachmentMeta[] }
): void {
  if (!payload) return;
  const mime = payload.mimeType ?? "";
  if (payload.filename && payload.body?.attachmentId) {
    acc.attachments.push({
      attachmentId: payload.body.attachmentId,
      filename: payload.filename,
      mimeType: mime,
      size: payload.body.size ?? 0,
    });
  } else if (mime === "text/plain" && payload.body?.data) {
    acc.text.push(base64UrlDecode(payload.body.data));
  } else if (mime === "text/html" && payload.body?.data) {
    acc.html.push(base64UrlDecode(payload.body.data));
  }
  for (const part of payload.parts ?? []) collectParts(part, acc);
}

export function parseMessage(resource: GmailMessageResource): GmailMessage {
  const headers = resource.payload?.headers ?? [];
  const acc = { text: [] as string[], html: [] as string[], attachments: [] as GmailAttachmentMeta[] };
  collectParts(resource.payload, acc);
  const dateStr = getHeader(headers, "Date");
  return {
    id: resource.id ?? "",
    threadId: resource.threadId ?? "",
    from: decodeRfc2047(getHeader(headers, "From")),
    to: decodeRfc2047(getHeader(headers, "To")),
    cc: decodeRfc2047(getHeader(headers, "Cc")),
    subject: decodeRfc2047(getHeader(headers, "Subject")),
    date: dateStr ? new Date(dateStr) : new Date(0),
    snippet: resource.snippet ?? "",
    bodyText: acc.text.join("\n").trim(),
    bodyHtml: acc.html.join("\n").trim(),
    labelIds: resource.labelIds ?? [],
    attachments: acc.attachments,
    messageIdHeader: getHeader(headers, "Message-ID"),
    references: getHeader(headers, "References"),
  };
}

function stripRe(subject: string): string {
  return subject.replace(/^((re|fwd?|転送)\s*:\s*)+/i, "").trim();
}

export function summarizeThread(thread: GmailThreadResource): GmailThreadSummary {
  const messages = thread.messages ?? [];
  const first = messages[0];
  const last = messages[messages.length - 1] ?? first;
  const firstHeaders = first?.payload?.headers ?? [];
  const lastHeaders = last?.payload?.headers ?? [];
  const unread = messages.some((m) => (m.labelIds ?? []).includes("UNREAD"));
  const dateStr = getHeader(lastHeaders, "Date");
  return {
    id: thread.id ?? "",
    subject: stripRe(decodeRfc2047(getHeader(firstHeaders, "Subject"))) || "(件名なし)",
    from: decodeRfc2047(getHeader(lastHeaders, "From")),
    date: dateStr ? new Date(dateStr) : new Date(0),
    snippet: thread.snippet ?? last?.snippet ?? "",
    unread,
    messageCount: messages.length,
  };
}

// ---------- MIME builder (pure) ----------

function stdBase64(input: string | Uint8Array): string {
  return typeof input === "string" ? utf8ToBase64(input) : bytesToBase64(input);
}

/** Strip CR/LF from a header value to prevent header injection. */
function sanitizeHeader(v: string): string {
  return v.replace(/[\r\n]+/g, " ").trim();
}

/** Remove characters that could break out of a quoted MIME parameter or inject headers. */
function sanitizeFilename(name: string): string {
  return name.replace(/[\r\n"\\]+/g, "").trim() || "attachment";
}

/** Allow only a well-formed type/subtype token; otherwise fall back to a safe default. */
function sanitizeMimeType(mime: string): string {
  return /^[\w.+-]+\/[\w.+-]+$/.test(mime) ? mime : "application/octet-stream";
}

/** Wrap base64 output to 76-char lines per RFC 2045. */
function wrapBase64(b64: string): string {
  return b64.replace(/.{1,76}/g, "$&\r\n").trimEnd();
}

export function buildMimeMessage(input: DraftInput, boundary = `b_${Date.now().toString(36)}`): string {
  const headerLines: string[] = [];
  if (input.from) headerLines.push(`From: ${sanitizeHeader(input.from)}`);
  headerLines.push(`To: ${sanitizeHeader(input.to)}`);
  if (input.cc) headerLines.push(`Cc: ${sanitizeHeader(input.cc)}`);
  headerLines.push(`Subject: ${encodeRfc2047(sanitizeHeader(input.subject))}`);
  if (input.inReplyTo) headerLines.push(`In-Reply-To: ${sanitizeHeader(input.inReplyTo)}`);
  if (input.references) headerLines.push(`References: ${sanitizeHeader(input.references)}`);
  headerLines.push("MIME-Version: 1.0");

  const atts = input.attachments ?? [];
  if (atts.length === 0) {
    headerLines.push('Content-Type: text/plain; charset="UTF-8"');
    headerLines.push("Content-Transfer-Encoding: base64");
    return headerLines.join("\r\n") + "\r\n\r\n" + wrapBase64(stdBase64(input.bodyText));
  }

  headerLines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
  const parts: string[] = [];
  parts.push(
    `--${boundary}\r\n` +
      'Content-Type: text/plain; charset="UTF-8"\r\n' +
      "Content-Transfer-Encoding: base64\r\n\r\n" +
      wrapBase64(stdBase64(input.bodyText))
  );
  for (const a of atts) {
    const fname = sanitizeFilename(a.filename);
    const ctype = sanitizeMimeType(a.mimeType);
    parts.push(
      `--${boundary}\r\n` +
        `Content-Type: ${ctype}; name="${fname}"\r\n` +
        `Content-Disposition: attachment; filename="${fname}"\r\n` +
        "Content-Transfer-Encoding: base64\r\n\r\n" +
        wrapBase64(stdBase64(a.data))
    );
  }
  return headerLines.join("\r\n") + "\r\n\r\n" + parts.join("\r\n") + `\r\n--${boundary}--`;
}

// ---------- read API ----------

export async function getProfile(oauth: GoogleOAuth): Promise<{ emailAddress: string }> {
  const json = await authed<GmailProfileResource>(oauth, "/profile");
  return { emailAddress: json.emailAddress ?? "" };
}

export async function listThreads(
  oauth: GoogleOAuth,
  query: string,
  maxResults = 25
): Promise<GmailThreadSummary[]> {
  const params = new URLSearchParams({
    q: query || "in:inbox",
    maxResults: String(maxResults),
  }).toString();
  const list = await authed<GmailThreadListResource>(oauth, `/threads?${params}`);
  const ids: string[] = (list.threads ?? []).map((t) => t.id);
  const metas = await Promise.all(
    ids.map((id) =>
      authed<GmailThreadResource>(
        oauth,
        `/threads/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`
      )
    )
  );
  return metas.map((meta) => summarizeThread(meta));
}

export async function getThread(oauth: GoogleOAuth, threadId: string): Promise<GmailThread> {
  const json = await authed<GmailThreadResource>(oauth, `/threads/${threadId}?format=full`);
  return {
    id: json.id ?? threadId,
    messages: (json.messages ?? []).map((m) => parseMessage(m)),
  };
}

export async function listLabels(oauth: GoogleOAuth): Promise<GmailLabel[]> {
  const json = await authed<GmailLabelListResource>(oauth, "/labels");
  return (json.labels ?? []).map((l) => ({
    id: l.id ?? "",
    name: l.name ?? "",
    type: l.type ?? "user",
  }));
}

export async function modifyMessageLabels(
  oauth: GoogleOAuth,
  messageId: string,
  add: string[],
  remove: string[]
): Promise<void> {
  await authed(oauth, `/messages/${messageId}/modify`, {
    method: "POST",
    body: { addLabelIds: add, removeLabelIds: remove },
  });
}

export async function trashMessage(oauth: GoogleOAuth, messageId: string): Promise<void> {
  await authed(oauth, `/messages/${messageId}/trash`, { method: "POST" });
}

export async function getAttachment(
  oauth: GoogleOAuth,
  messageId: string,
  attachmentId: string
): Promise<Uint8Array> {
  const json = await authed<GmailAttachmentResource>(
    oauth,
    `/messages/${messageId}/attachments/${attachmentId}`
  );
  const b64 = (json.data ?? "").replace(/-/g, "+").replace(/_/g, "/");
  if (nodeBuffer) return new Uint8Array(nodeBuffer.from(b64, "base64"));
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ---------- draft API ----------

export interface CreateDraftResult {
  draftId: string;
  messageId: string;
  threadId: string;
}

export async function createDraft(
  oauth: GoogleOAuth,
  input: DraftInput
): Promise<CreateDraftResult> {
  const raw = base64UrlEncode(buildMimeMessage(input));
  const message: { raw: string; threadId?: string } = { raw };
  if (input.threadId) message.threadId = input.threadId;
  const json = await authed<GmailDraftResource>(oauth, "/drafts", {
    method: "POST",
    body: { message },
  });
  return {
    draftId: json.id ?? "",
    messageId: json.message?.id ?? "",
    threadId: json.message?.threadId ?? input.threadId ?? "",
  };
}

// ---------- query compose (pure) ----------

export function composeQuery(base: string, term: string, label?: string): string {
  const parts: string[] = [];
  if (base.trim()) parts.push(base.trim());
  if (label && label.trim()) parts.push(`label:${label.trim()}`);
  if (term.trim()) parts.push(term.trim());
  return parts.join(" ") || "in:inbox";
}

// ---------- reply helpers (pure) ----------

export interface ReplyFields {
  to: string;
  subject: string;
  inReplyTo: string;
  references: string;
  threadId: string;
}

export function buildReplyFields(m: GmailMessage): ReplyFields {
  const subject = /^re:/i.test(m.subject.trim()) ? m.subject : `Re: ${m.subject}`;
  const references = m.references ? `${m.references} ${m.messageIdHeader}`.trim() : m.messageIdHeader;
  return {
    to: m.from,
    subject,
    inReplyTo: m.messageIdHeader,
    references,
    threadId: m.threadId,
  };
}

export function quoteForReply(m: GmailMessage): string {
  const quoted = m.bodyText
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
  return `\n\nOn ${m.date.toLocaleString()}, ${m.from} wrote:\n${quoted}`;
}
