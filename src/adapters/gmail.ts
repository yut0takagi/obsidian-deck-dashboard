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
