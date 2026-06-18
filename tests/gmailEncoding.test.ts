import { describe, it, expect } from "vitest";
import {
  base64UrlEncode,
  base64UrlDecode,
  encodeRfc2047,
  gmailThreadUrl,
  gmailDraftUrl,
  gmailDraftsListUrl,
} from "../src/adapters/gmail";

describe("base64url", () => {
  it("ASCII を round-trip できる", () => {
    const enc = base64UrlEncode("Hello, world");
    expect(enc).not.toMatch(/[+/=]/); // url-safe・パディングなし
    expect(base64UrlDecode(enc)).toBe("Hello, world");
  });

  it("日本語(UTF-8)を round-trip できる", () => {
    const s = "メール本文：見積もりの件です。";
    expect(base64UrlDecode(base64UrlEncode(s))).toBe(s);
  });
});

describe("encodeRfc2047", () => {
  it("ASCII のみはそのまま", () => {
    expect(encodeRfc2047("Re: hello")).toBe("Re: hello");
  });
  it("非ASCIIは =?UTF-8?B?...?= でエンコード", () => {
    const out = encodeRfc2047("見積もり");
    expect(out.startsWith("=?UTF-8?B?")).toBe(true);
    expect(out.endsWith("?=")).toBe(true);
  });
});

describe("gmail web urls", () => {
  const email = "me@example.com";
  it("thread url", () => {
    expect(gmailThreadUrl(email, "t123")).toBe(
      "https://mail.google.com/mail/?authuser=me%40example.com#all/t123"
    );
  });
  it("draft url", () => {
    expect(gmailDraftUrl(email, "m456")).toBe(
      "https://mail.google.com/mail/?authuser=me%40example.com#drafts/m456"
    );
  });
  it("drafts list url (フォールバック)", () => {
    expect(gmailDraftsListUrl(email)).toBe(
      "https://mail.google.com/mail/?authuser=me%40example.com#drafts"
    );
  });
});
