import { describe, it, expect } from "vitest";
import { __test } from "../src/core/vaultRetrieval";

const { tokenize, scoreFilename, scoreContent, stripFrontmatter } = __test;

describe("tokenize", () => {
  it("2文字以上のトークンに分割し記号を除去", () => {
    expect(tokenize("見積もり, ロリエ案件")).toContain("ロリエ案件");
    expect(tokenize("a b cd")).toEqual(["cd"]); // 1文字は除外
  });
});

describe("scoreFilename", () => {
  it("パスにトークンが含まれると加点", () => {
    expect(scoreFilename("議事録/ロリエ.md", ["ロリエ"])).toBe(1);
    expect(scoreFilename("other.md", ["ロリエ"])).toBe(0);
  });
});

describe("scoreContent", () => {
  it("出現回数を上限5でスコア", () => {
    expect(scoreContent("ロリエ ロリエ ロリエ", ["ロリエ"])).toBe(3);
    expect(scoreContent("x".repeat(0), ["ロリエ"])).toBe(0);
  });
});

describe("stripFrontmatter", () => {
  it("先頭の --- ブロックを除去", () => {
    expect(stripFrontmatter("---\na: 1\n---\n本文")).toBe("本文");
    expect(stripFrontmatter("本文のみ")).toBe("本文のみ");
  });
});
