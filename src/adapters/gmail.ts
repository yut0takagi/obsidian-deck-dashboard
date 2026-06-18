import { requestUrl } from "obsidian";
import type { GoogleOAuth } from "../auth/googleOAuth";

const API = "https://www.googleapis.com/gmail/v1/users/me";

// ---------- encode / decode (pure) ----------

function utf8ToBase64(s: string): string {
  if (typeof Buffer !== "undefined") return Buffer.from(s, "utf-8").toString("base64");
  return btoa(unescape(encodeURIComponent(s)));
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
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
  if (typeof Buffer !== "undefined") return Buffer.from(b64, "base64").toString("utf-8");
  return decodeURIComponent(escape(atob(b64)));
}

/** RFC 2047 encoded-word for non-ASCII header values (Subject, display names). */
export function encodeRfc2047(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${utf8ToBase64(value)}?=`;
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

async function authed(
  oauth: GoogleOAuth,
  path: string,
  init: { method?: "GET" | "POST" | "PUT"; body?: unknown } = {}
): Promise<any> {
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
  return res.json;
}

export { authed as __authed };

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

// ---------- parsers (pure) ----------

export function getHeader(headers: any[], name: string): string {
  const lower = name.toLowerCase();
  const h = (headers ?? []).find((x) => (x.name ?? "").toLowerCase() === lower);
  return h?.value ?? "";
}

function collectParts(
  payload: any,
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

export function parseMessage(resource: any): GmailMessage {
  const headers = resource.payload?.headers ?? [];
  const acc = { text: [] as string[], html: [] as string[], attachments: [] as GmailAttachmentMeta[] };
  collectParts(resource.payload, acc);
  const dateStr = getHeader(headers, "Date");
  return {
    id: resource.id ?? "",
    threadId: resource.threadId ?? "",
    from: getHeader(headers, "From"),
    to: getHeader(headers, "To"),
    cc: getHeader(headers, "Cc"),
    subject: getHeader(headers, "Subject"),
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

export function summarizeThread(thread: any): GmailThreadSummary {
  const messages = thread.messages ?? [];
  const first = messages[0];
  const last = messages[messages.length - 1] ?? first;
  const firstHeaders = first?.payload?.headers ?? [];
  const lastHeaders = last?.payload?.headers ?? [];
  const unread = messages.some((m: any) => (m.labelIds ?? []).includes("UNREAD"));
  const dateStr = getHeader(lastHeaders, "Date");
  return {
    id: thread.id ?? "",
    subject: stripRe(getHeader(firstHeaders, "Subject")) || "(件名なし)",
    from: getHeader(lastHeaders, "From"),
    date: dateStr ? new Date(dateStr) : new Date(0),
    snippet: thread.snippet ?? last?.snippet ?? "",
    unread,
    messageCount: messages.length,
  };
}

// ---------- read API ----------

export async function getProfile(oauth: GoogleOAuth): Promise<{ emailAddress: string }> {
  const json = await authed(oauth, "/profile");
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
  const list = await authed(oauth, `/threads?${params}`);
  const ids: string[] = (list.threads ?? []).map((t: any) => t.id);
  const summaries: GmailThreadSummary[] = [];
  for (const id of ids) {
    const meta = await authed(
      oauth,
      `/threads/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`
    );
    summaries.push(summarizeThread(meta));
  }
  return summaries;
}

export async function getThread(oauth: GoogleOAuth, threadId: string): Promise<GmailThread> {
  const json = await authed(oauth, `/threads/${threadId}?format=full`);
  return {
    id: json.id ?? threadId,
    messages: (json.messages ?? []).map((m: any) => parseMessage(m)),
  };
}

export async function listLabels(oauth: GoogleOAuth): Promise<GmailLabel[]> {
  const json = await authed(oauth, "/labels");
  return (json.labels ?? []).map((l: any) => ({
    id: l.id,
    name: l.name,
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
  const json = await authed(
    oauth,
    `/messages/${messageId}/attachments/${attachmentId}`
  );
  const b64 = (json.data ?? "").replace(/-/g, "+").replace(/_/g, "/");
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(b64, "base64"));
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
