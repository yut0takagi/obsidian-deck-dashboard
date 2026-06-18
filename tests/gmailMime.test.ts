import { describe, it, expect } from "vitest";
import { buildMimeMessage, base64UrlDecode, type DraftInput } from "../src/adapters/gmail";

describe("buildMimeMessage", () => {
  it("シンプルな text/plain（日本語件名は RFC2047）", () => {
    const input: DraftInput = {
      to: "to@example.com",
      subject: "見積もり",
      bodyText: "本文です",
    };
    const mime = buildMimeMessage(input, "BOUND");
    expect(mime).toContain("To: to@example.com\r\n");
    expect(mime).toContain("Subject: =?UTF-8?B?");
    expect(mime).toContain('Content-Type: text/plain; charset="UTF-8"');
    expect(mime).toContain("Content-Transfer-Encoding: base64");
    // 本文は base64 で含まれる（wrapBase64 後でも正しくデコードできる）
    const body = mime.split("\r\n\r\n").slice(1).join("\r\n\r\n").replace(/\r\n/g, "");
    expect(base64UrlDecode(body)).toBe("本文です");
  });

  it("Cc / In-Reply-To / References ヘッダを付与", () => {
    const mime = buildMimeMessage(
      {
        to: "to@example.com",
        cc: "cc@example.com",
        subject: "Re: hi",
        bodyText: "x",
        inReplyTo: "<abc@mail>",
        references: "<abc@mail>",
      },
      "BOUND"
    );
    expect(mime).toContain("Cc: cc@example.com\r\n");
    expect(mime).toContain("In-Reply-To: <abc@mail>\r\n");
    expect(mime).toContain("References: <abc@mail>\r\n");
  });

  it("添付ありは multipart/mixed", () => {
    const mime = buildMimeMessage(
      {
        to: "to@example.com",
        subject: "添付",
        bodyText: "本文",
        attachments: [
          { filename: "a.txt", mimeType: "text/plain", data: new Uint8Array([104, 105]) },
        ],
      },
      "BOUND"
    );
    expect(mime).toContain('Content-Type: multipart/mixed; boundary="BOUND"');
    expect(mime).toContain("--BOUND\r\n");
    expect(mime).toContain('Content-Disposition: attachment; filename="a.txt"');
    expect(mime).toContain("--BOUND--");
  });

  it("To/Subject の CR/LF ヘッダインジェクションを防ぐ", () => {
    const mime = buildMimeMessage(
      {
        to: "victim@example.com\r\nBcc: attacker@evil.com",
        subject: "hi\r\nX-Injected: yes",
        bodyText: "x",
      },
      "BOUND"
    );
    const lines = mime.split("\r\n");
    expect(lines.some((l) => l.startsWith("Bcc:"))).toBe(false);
    expect(lines.some((l) => l.startsWith("X-Injected:"))).toBe(false);
  });

  it("添付ファイル名のヘッダインジェクションを防ぐ", () => {
    const mime = buildMimeMessage(
      {
        to: "to@example.com",
        subject: "s",
        bodyText: "b",
        attachments: [
          { filename: 'a.txt"\r\nX-Evil: 1', mimeType: "text/plain", data: new Uint8Array([1, 2, 3]) },
        ],
      },
      "BOUND"
    );
    const lines = mime.split("\r\n");
    expect(lines.some((l) => l.startsWith("X-Evil:"))).toBe(false);
  });

  it("不正な mimeType は application/octet-stream にフォールバック", () => {
    const mime = buildMimeMessage(
      {
        to: "to@example.com",
        subject: "s",
        bodyText: "b",
        attachments: [
          { filename: "x.bin", mimeType: "evil\r\ninjected", data: new Uint8Array([1]) },
        ],
      },
      "BOUND"
    );
    expect(mime).toContain('Content-Type: application/octet-stream; name="x.bin"');
  });
});
