import { describe, it, expect } from "vitest";
import { composeQuery } from "../src/adapters/gmail";

describe("composeQuery", () => {
  it("ベースクエリと検索語を結合", () => {
    expect(composeQuery("in:inbox", "見積もり")).toBe("in:inbox 見積もり");
  });
  it("ラベル指定を label: で付与", () => {
    expect(composeQuery("in:inbox", "", "重要")).toBe("in:inbox label:重要");
  });
  it("検索語が空ならベースのみ", () => {
    expect(composeQuery("in:inbox", "  ")).toBe("in:inbox");
  });
  it("全部空なら in:inbox にフォールバック", () => {
    expect(composeQuery("", "")).toBe("in:inbox");
  });
});
