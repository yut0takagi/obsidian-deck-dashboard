import { describe, it, expect } from "vitest";
import { parseMessage, summarizeThread, getHeader } from "../src/adapters/gmail";
import { base64UrlEncode } from "../src/adapters/gmail";

function msgResource(over: any = {}): any {
  return {
    id: over.id ?? "m1",
    threadId: over.threadId ?? "t1",
    snippet: over.snippet ?? "本文プレビュー",
    labelIds: over.labelIds ?? ["INBOX", "UNREAD"],
    payload: over.payload ?? {
      mimeType: "text/plain",
      headers: [
        { name: "From", value: "Tanaka <tanaka@example.com>" },
        { name: "To", value: "me@example.com" },
        { name: "Subject", value: "見積もりの件" },
        { name: "Date", value: "Wed, 17 Jun 2026 10:30:00 +0900" },
        { name: "Message-ID", value: "<abc@mail>" },
      ],
      body: { data: base64UrlEncode("本文テキスト\nよろしくお願いします") },
    },
  };
}

describe("getHeader", () => {
  it("ヘッダを名前で取得（大小無視）", () => {
    const headers = [{ name: "Subject", value: "件名" }];
    expect(getHeader(headers, "subject")).toBe("件名");
    expect(getHeader(headers, "Missing")).toBe("");
  });
});

describe("parseMessage", () => {
  it("text/plain 本文・ヘッダ・UNREAD を抽出", () => {
    const m = parseMessage(msgResource());
    expect(m.id).toBe("m1");
    expect(m.threadId).toBe("t1");
    expect(m.from).toBe("Tanaka <tanaka@example.com>");
    expect(m.subject).toBe("見積もりの件");
    expect(m.bodyText).toContain("本文テキスト");
    expect(m.labelIds).toContain("UNREAD");
    expect(m.messageIdHeader).toBe("<abc@mail>");
    expect(m.attachments).toHaveLength(0);
  });

  it("multipart/mixed から添付メタを抽出", () => {
    const m = parseMessage(
      msgResource({
        payload: {
          mimeType: "multipart/mixed",
          headers: [{ name: "Subject", value: "添付あり" }],
          parts: [
            { mimeType: "text/plain", body: { data: base64UrlEncode("本文") } },
            {
              mimeType: "application/pdf",
              filename: "見積.pdf",
              body: { attachmentId: "att1", size: 1234 },
            },
          ],
        },
      })
    );
    expect(m.bodyText).toContain("本文");
    expect(m.attachments).toHaveLength(1);
    expect(m.attachments[0]).toMatchObject({
      attachmentId: "att1",
      filename: "見積.pdf",
      mimeType: "application/pdf",
      size: 1234,
    });
  });
});

describe("summarizeThread", () => {
  it("件名・差出人・未読・件数を集約", () => {
    const thread = {
      id: "t1",
      snippet: "最新スニペット",
      messages: [
        msgResource({ id: "m1", labelIds: ["INBOX"] }),
        msgResource({
          id: "m2",
          labelIds: ["INBOX", "UNREAD"],
          payload: {
            headers: [
              { name: "From", value: "Sato <sato@example.com>" },
              { name: "Subject", value: "Re: 見積もりの件" },
              { name: "Date", value: "Wed, 17 Jun 2026 12:00:00 +0900" },
            ],
          },
        }),
      ],
    };
    const s = summarizeThread(thread);
    expect(s.id).toBe("t1");
    expect(s.messageCount).toBe(2);
    expect(s.unread).toBe(true);
    expect(s.from).toBe("Sato <sato@example.com>"); // 最新メッセージの差出人
    expect(s.subject).toBe("見積もりの件"); // 先頭メッセージの件名から Re: を除去
  });
});
