import { describe, it, expect } from "vitest";
import { decodeRfc2047, senderDisplayName, base64UrlEncode } from "../src/adapters/gmail";

describe("decodeRfc2047", () => {
  it("プレーン文字列はそのまま", () => {
    expect(decodeRfc2047("Re: hello")).toBe("Re: hello");
    expect(decodeRfc2047("見積もりの件")).toBe("見積もりの件");
  });

  it("=?UTF-8?B?..?= (Base64) をデコード", () => {
    // base64UrlEncode は url-safe だが、日本語の "高木" には + / が出ないので encoded-word として有効
    const word = `=?UTF-8?B?${Buffer.from("高木", "utf-8").toString("base64")}?=`;
    expect(decodeRfc2047(word)).toBe("高木");
  });

  it("From ヘッダ内の encoded-word + アドレスを処理", () => {
    const enc = Buffer.from("田中太郎", "utf-8").toString("base64");
    const from = `=?UTF-8?B?${enc}?= <tanaka@example.com>`;
    expect(decodeRfc2047(from)).toBe("田中太郎 <tanaka@example.com>");
  });

  it("=?UTF-8?Q?..?= (Quoted-Printable) をデコード", () => {
    // "Café" → C, a, f, =C3=A9
    expect(decodeRfc2047("=?UTF-8?Q?Caf=C3=A9?=")).toBe("Café");
  });

  it("不正な encoded-word は元のまま返す（例外を投げない）", () => {
    const broken = "=?UTF-8?B?!!!notbase64!!!?=";
    expect(() => decodeRfc2047(broken)).not.toThrow();
  });

  // base64UrlEncode は import 健全性のため参照
  void base64UrlEncode;
});

describe("senderDisplayName", () => {
  it("Name <addr> から表示名を抽出", () => {
    expect(senderDisplayName("Tanaka <tanaka@example.com>")).toBe("Tanaka");
  });
  it("encoded-word の表示名をデコードして抽出", () => {
    const enc = Buffer.from("田中太郎", "utf-8").toString("base64");
    expect(senderDisplayName(`=?UTF-8?B?${enc}?= <tanaka@example.com>`)).toBe("田中太郎");
  });
  it("アドレスのみなら全体を返す", () => {
    expect(senderDisplayName("bare@example.com")).toBe("bare@example.com");
  });
});
