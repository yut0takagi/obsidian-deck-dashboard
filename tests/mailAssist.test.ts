import { describe, it, expect } from "vitest";
import { __test, type GmailThread } from "../src/ai/mailAssist";
import type { Candidate } from "../src/core/vaultRetrieval";

const { buildThreadText, buildRagQuery, buildPrompt, parseAssistOutput } = __test;

const thread: GmailThread = {
  id: "t1",
  messages: [
    {
      id: "m1",
      threadId: "t1",
      from: "Tanaka <tanaka@example.com>",
      to: "me@example.com",
      cc: "",
      subject: "ロリエ案件の見積もり",
      date: new Date("2026-06-17T10:30:00+09:00"),
      snippet: "",
      bodyText: "見積もりをお願いします。",
      bodyHtml: "",
      labelIds: [],
      attachments: [],
      messageIdHeader: "<abc@mail>",
      references: "",
    },
  ],
};

describe("buildThreadText", () => {
  it("差出人と本文を連結", () => {
    const t = buildThreadText(thread);
    expect(t).toContain("Tanaka <tanaka@example.com>");
    expect(t).toContain("見積もりをお願いします。");
  });
});

describe("buildRagQuery", () => {
  it("件名＋差出人名からクエリを作る", () => {
    const q = buildRagQuery(thread);
    expect(q).toContain("ロリエ案件");
    expect(q).toContain("Tanaka");
  });
});

describe("buildPrompt", () => {
  it("スレッド・vault背景・指示を含む", () => {
    const cands: Candidate[] = [{ path: "議事録/ロリエ.md", excerpt: "前回は単価で揉めた", score: 9 }];
    const p = buildPrompt(thread, cands);
    expect(p).toContain("見積もりをお願いします。");
    expect(p).toContain("議事録/ロリエ.md");
    expect(p).toContain("前回は単価で揉めた");
    expect(p).toMatch(/要約/);
    expect(p).toMatch(/返信ドラフト/);
  });
});

describe("parseAssistOutput", () => {
  it("=== 区切りで要約と返信を分離", () => {
    const raw =
      "## 要約\n- 見積もり依頼\n\n=== 返信ドラフト ===\nお世話になります。\n承知しました。";
    const out = parseAssistOutput(raw);
    expect(out.summary).toContain("見積もり依頼");
    expect(out.replyDraft).toContain("承知しました。");
    expect(out.replyDraft).not.toContain("=== 返信ドラフト ===");
  });

  it("区切りが無い場合は全体を返信ドラフト扱い", () => {
    const out = parseAssistOutput("お世話になります。");
    expect(out.replyDraft).toBe("お世話になります。");
    expect(out.summary).toBe("");
  });
});
