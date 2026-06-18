import { describe, it, expect } from "vitest";
import { DEFAULT_MAIL_CONFIG, mergeMailConfig } from "../src/core/mailConfig";

describe("mailConfig", () => {
  it("既定値: inbox クエリ・claude-code バックエンド", () => {
    expect(DEFAULT_MAIL_CONFIG.query).toBe("in:inbox");
    expect(DEFAULT_MAIL_CONFIG.backend).toBe("claude-code");
    expect(DEFAULT_MAIL_CONFIG.maxItems).toBeGreaterThan(0);
  });

  it("mergeMailConfig は保存値で既定を上書きしつつ欠損を補完", () => {
    const merged = mergeMailConfig({ maxItems: 10, query: "is:unread" });
    expect(merged.maxItems).toBe(10);
    expect(merged.query).toBe("is:unread");
    expect(merged.backend).toBe(DEFAULT_MAIL_CONFIG.backend); // 欠損は既定
  });

  it("mergeMailConfig(undefined) は既定のコピーを返す", () => {
    const merged = mergeMailConfig(undefined);
    expect(merged).toEqual(DEFAULT_MAIL_CONFIG);
    expect(merged).not.toBe(DEFAULT_MAIL_CONFIG); // コピー
  });
});
