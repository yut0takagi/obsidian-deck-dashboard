import { describe, it, expect, vi, beforeEach } from "vitest";

const requestUrlMock = vi.fn();
vi.mock("obsidian", async () => {
  const actual = await vi.importActual<any>("../tests/__mocks__/obsidian");
  return { ...actual, requestUrl: (...a: any[]) => requestUrlMock(...a) };
});

import { listThreads, getProfile, modifyMessageLabels } from "../src/adapters/gmail";

const oauth: any = { getAccessToken: async () => "tok" };

beforeEach(() => requestUrlMock.mockReset());

describe("getProfile", () => {
  it("emailAddress を返す", async () => {
    requestUrlMock.mockResolvedValueOnce({
      status: 200,
      json: { emailAddress: "me@example.com" },
    });
    const p = await getProfile(oauth);
    expect(p.emailAddress).toBe("me@example.com");
  });
});

describe("listThreads", () => {
  it("threads.list → 各 threads.get(metadata) を集約", async () => {
    requestUrlMock
      .mockResolvedValueOnce({ status: 200, json: { threads: [{ id: "t1" }] } })
      .mockResolvedValueOnce({
        status: 200,
        json: {
          id: "t1",
          snippet: "snip",
          messages: [
            {
              id: "m1",
              labelIds: ["INBOX", "UNREAD"],
              payload: {
                headers: [
                  { name: "Subject", value: "件名" },
                  { name: "From", value: "A <a@x.com>" },
                  { name: "Date", value: "Wed, 17 Jun 2026 10:30:00 +0900" },
                ],
              },
            },
          ],
        },
      });
    const out = await listThreads(oauth, "in:inbox", 25);
    expect(out).toHaveLength(1);
    expect(out[0].subject).toBe("件名");
    expect(out[0].unread).toBe(true);
  });
});

describe("modifyMessageLabels", () => {
  it("add/remove を POST する", async () => {
    requestUrlMock.mockResolvedValueOnce({ status: 200, json: {} });
    await modifyMessageLabels(oauth, "m1", [], ["UNREAD"]);
    const call = requestUrlMock.mock.calls[0][0];
    expect(call.url).toContain("/messages/m1/modify");
    expect(JSON.parse(call.body)).toEqual({
      addLabelIds: [],
      removeLabelIds: ["UNREAD"],
    });
  });
});
