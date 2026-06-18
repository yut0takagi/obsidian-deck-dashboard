import { describe, it, expect, vi, beforeEach } from "vitest";

const requestUrlMock = vi.fn();
vi.mock("obsidian", async () => {
  const actual = await vi.importActual<any>("../tests/__mocks__/obsidian");
  return { ...actual, requestUrl: (...a: any[]) => requestUrlMock(...a) };
});

import { createDraft, base64UrlDecode } from "../src/adapters/gmail";

const oauth: any = { getAccessToken: async () => "tok" };
beforeEach(() => requestUrlMock.mockReset());

describe("createDraft", () => {
  it("raw(base64url) と threadId を POST し、id を返す", async () => {
    requestUrlMock.mockResolvedValueOnce({
      status: 200,
      json: { id: "draft1", message: { id: "msg1", threadId: "t1" } },
    });
    const out = await createDraft(oauth, {
      to: "to@example.com",
      subject: "件名",
      bodyText: "本文",
      threadId: "t1",
    });
    expect(out).toEqual({ draftId: "draft1", messageId: "msg1", threadId: "t1" });
    const body = JSON.parse(requestUrlMock.mock.calls[0][0].body);
    expect(body.message.threadId).toBe("t1");
    // raw は base64url（+ / = を含まない）でデコードできる
    expect(body.message.raw).not.toMatch(/[+/=]/);
    expect(base64UrlDecode(body.message.raw)).toContain("To: to@example.com");
  });
});
