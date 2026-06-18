import { describe, it, expect } from "vitest";
import { buildReplyFields, quoteForReply, type GmailMessage } from "../src/adapters/gmail";

function msg(over: Partial<GmailMessage> = {}): GmailMessage {
  return {
    id: "m1",
    threadId: "t1",
    from: "Tanaka <tanaka@example.com>",
    to: "me@example.com",
    cc: "",
    subject: "見積もりの件",
    date: new Date("2026-06-17T10:30:00+09:00"),
    snippet: "",
    bodyText: "お世話になります。\n見積もりをお願いします。",
    bodyHtml: "",
    labelIds: [],
    attachments: [],
    messageIdHeader: "<abc@mail>",
    references: "<prev@mail>",
    ...over,
  };
}

describe("buildReplyFields", () => {
  it("宛先・件名(Re:)・In-Reply-To・References を生成", () => {
    const f = buildReplyFields(msg());
    expect(f.to).toBe("Tanaka <tanaka@example.com>");
    expect(f.subject).toBe("Re: 見積もりの件");
    expect(f.inReplyTo).toBe("<abc@mail>");
    expect(f.references).toBe("<prev@mail> <abc@mail>");
    expect(f.threadId).toBe("t1");
  });

  it("既に Re: が付いていれば二重化しない", () => {
    expect(buildReplyFields(msg({ subject: "Re: 見積もりの件" })).subject).toBe(
      "Re: 見積もりの件"
    );
  });

  it("References が空なら Message-ID のみ", () => {
    expect(buildReplyFields(msg({ references: "" })).references).toBe("<abc@mail>");
  });
});

describe("quoteForReply", () => {
  it("> 引用にして日付ヘッダを付ける", () => {
    const q = quoteForReply(msg());
    expect(q).toContain("Tanaka <tanaka@example.com> wrote:");
    expect(q).toContain("> お世話になります。");
    expect(q).toContain("> 見積もりをお願いします。");
  });
});
