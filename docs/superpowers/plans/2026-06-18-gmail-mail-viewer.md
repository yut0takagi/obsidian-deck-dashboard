# Gmail メールビューワー Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Obsidian の Deck プラグインに、Gmail を「確認・作成・送信(ブラウザ確認)」できるメールクライアントを追加する。

**Architecture:** 既存の `GoogleOAuth`（PKCE loopback）に `gmail.modify` スコープを足し、ステートレスな `adapters/gmail.ts`（`requestUrl` + Bearer）で Gmail REST v1 を叩く。UI はハイブリッド（ダッシュボード `MailWidget` ＋ 専用 `ItemView` の `MailView`）。送信はプラグインから直接行わず、Gmail 下書き(`drafts.create`)を作って **ブラウザの Gmail を開いて人が確認・送信**。返信は「スレッド要約 + vault(議事録/ナレッジ) RAG → Claude で返信ドラフト生成」。

**Tech Stack:** TypeScript, Obsidian Plugin API (`ItemView` / `Modal` / `Setting` / `requestUrl`), Gmail REST API v1, vitest, esbuild。Claude 連携は既存 `adapters/anthropic.ts`（API）/ `adapters/claudeCode.ts`（`claude -p`）を再利用。

**Conventions（このコードベースの作法）:**
- adapter は `requestUrl` + `Authorization: Bearer ${await oauth.getAccessToken()}`、`res.status >= 400` で `throw new Error("... HTTP <status>: <text>")`。
- 純ロジックは named export し、vitest から直接 import してテスト（例: `tests/sheetsSync.test.ts`）。
- UI（ItemView/Modal/Widget）は DOM を obsidian モックで描画できないため、ユニットテストではなく `npm run build` のグリーンで検証する（既存ウィジェットもこの方針）。
- 日本語 UI 文言。クラス命名・ファイル配置は既存に合わせる。
- テスト実行: `npx vitest run <path>`。ビルド: `npm run build`。

---

## File Structure

新規作成:
- `src/adapters/gmail.ts` — Gmail REST ラッパ + 純ロジック（encode/decode・URL・MIME・parse・query）
- `src/core/mailConfig.ts` — メール設定の型・既定値・load/save
- `src/core/MailView.ts` — 専用ペイン（2ペイン: 一覧 + スレッド本文）
- `src/widgets/MailWidget.ts` — ダッシュボード受信箱ウィジェット
- `src/ui/MailComposeModal.ts` — 作成/返信/転送モーダル
- `src/core/vaultRetrieval.ts` — vault 候補抽出（AISearch から共通化）
- `src/ai/mailAssist.ts` — スレッド要約 + RAG + AI返信ドラフト生成
- テスト: `tests/gmailEncoding.test.ts`, `tests/gmailParse.test.ts`, `tests/gmailMime.test.ts`, `tests/gmailReply.test.ts`, `tests/gmailQuery.test.ts`, `tests/mailConfig.test.ts`, `tests/vaultRetrieval.test.ts`, `tests/mailAssist.test.ts`, `tests/googleOAuth.test.ts`

変更:
- `src/auth/googleOAuth.ts` — `SCOPES` に `gmail.modify` 追加
- `src/core/constants.ts` — `VIEW_TYPE_MAIL` 追加
- `src/main.ts` — `registerView(VIEW_TYPE_MAIL)` + リボン
- `src/commands.ts` — 「メールを開く」コマンド
- `src/widgets/index.ts` — `mailWidget` 登録
- `src/widgets/AISearchWidget.ts` — `vaultRetrieval` を使うよう差し替え
- `src/ui/SyncSettingsTab.ts` — Gmail 設定セクション

---

# Phase 1 — コア読取（受信一覧・スレッド閲覧・既読化）

このフェーズ完了で「メールを確認」できる状態になる。

## Task 1: gmail.modify スコープを追加

**Files:**
- Modify: `src/auth/googleOAuth.ts:22-27`
- Test: `tests/googleOAuth.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`tests/googleOAuth.test.ts` を新規作成:

```ts
import { describe, it, expect } from "vitest";
import { REQUIRED_SCOPES, hasScope } from "../src/auth/googleOAuth";

describe("Gmail scope", () => {
  it("REQUIRED_SCOPES に gmail.modify を含む", () => {
    expect(REQUIRED_SCOPES).toContain(
      "https://www.googleapis.com/auth/gmail.modify"
    );
  });

  it("hasScope は付与済みスコープを検知する", () => {
    const tokens = {
      access_token: "a",
      refresh_token: "r",
      expires_at: 0,
      scope:
        "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/gmail.modify",
    };
    expect(hasScope(tokens, "https://www.googleapis.com/auth/gmail.modify")).toBe(true);
    expect(hasScope(tokens, "https://www.googleapis.com/auth/spreadsheets")).toBe(false);
    expect(hasScope(null, "https://www.googleapis.com/auth/gmail.modify")).toBe(false);
  });
});
```

- [ ] **Step 2: テストが落ちることを確認**

Run: `npx vitest run tests/googleOAuth.test.ts`
Expected: FAIL — `expected [ ... ] to contain 'https://www.googleapis.com/auth/gmail.modify'`

- [ ] **Step 3: スコープを追加**

`src/auth/googleOAuth.ts` の `SCOPES` 配列（22-26行目）に1行追加:

```ts
const SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/gmail.modify",
] as const;
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run tests/googleOAuth.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/auth/googleOAuth.ts tests/googleOAuth.test.ts
git commit -m "feat(mail): add gmail.modify OAuth scope"
```

> 注: 既存トークンには gmail スコープが無いため、利用時は設定→「再認証」で再同意が必要（`prompt=consent` が既に付いている）。

---

## Task 2: mailConfig（設定の型・既定値・load/save）

**Files:**
- Create: `src/core/mailConfig.ts`
- Test: `tests/mailConfig.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`tests/mailConfig.test.ts`:

```ts
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
```

- [ ] **Step 2: テストが落ちることを確認**

Run: `npx vitest run tests/mailConfig.test.ts`
Expected: FAIL — `Cannot find module '../src/core/mailConfig'`

- [ ] **Step 3: 実装**

`src/core/mailConfig.ts`:

```ts
import type { Plugin } from "obsidian";

export type MailBackend = "claude-code" | "api";

export interface MailConfig {
  /** Gmail 検索クエリ（受信一覧の絞り込み） */
  query: string;
  /** 一覧の最大件数 */
  maxItems: number;
  /** AI バックエンド（AISearch と同じ切替） */
  backend: MailBackend;
  /** claude コマンド（claude-code バックエンド用） */
  claudeCmd: string;
  /** Anthropic モデル（api バックエンド用） */
  model: string;
  /** AI返信の過去背景 RAG 対象フォルダ（空=vault全体） */
  ragFolders: string[];
}

export const DEFAULT_MAIL_CONFIG: MailConfig = {
  query: "in:inbox",
  maxItems: 25,
  backend: "claude-code",
  claudeCmd: "claude",
  model: "claude-haiku-4-5-20251001",
  ragFolders: ["議事録", "ナレッジ"],
};

export function mergeMailConfig(stored: Partial<MailConfig> | undefined): MailConfig {
  return { ...DEFAULT_MAIL_CONFIG, ...(stored ?? {}) };
}

interface PluginData {
  mail_config?: Partial<MailConfig>;
}

export async function loadMailConfig(plugin: Plugin): Promise<MailConfig> {
  const data = (await plugin.loadData()) as PluginData | null;
  return mergeMailConfig(data?.mail_config);
}

export async function saveMailConfig(plugin: Plugin, next: MailConfig): Promise<void> {
  const data = ((await plugin.loadData()) ?? {}) as PluginData;
  data.mail_config = next;
  await plugin.saveData(data);
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run tests/mailConfig.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/core/mailConfig.ts tests/mailConfig.test.ts
git commit -m "feat(mail): add mail config model"
```

---

## Task 3: gmail.ts — encode/decode と Web URL ヘルパー（純ロジック）

**Files:**
- Create: `src/adapters/gmail.ts`
- Test: `tests/gmailEncoding.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`tests/gmailEncoding.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  base64UrlEncode,
  base64UrlDecode,
  encodeRfc2047,
  gmailThreadUrl,
  gmailDraftUrl,
  gmailDraftsListUrl,
} from "../src/adapters/gmail";

describe("base64url", () => {
  it("ASCII を round-trip できる", () => {
    const enc = base64UrlEncode("Hello, world");
    expect(enc).not.toMatch(/[+/=]/); // url-safe・パディングなし
    expect(base64UrlDecode(enc)).toBe("Hello, world");
  });

  it("日本語(UTF-8)を round-trip できる", () => {
    const s = "メール本文：見積もりの件です。";
    expect(base64UrlDecode(base64UrlEncode(s))).toBe(s);
  });
});

describe("encodeRfc2047", () => {
  it("ASCII のみはそのまま", () => {
    expect(encodeRfc2047("Re: hello")).toBe("Re: hello");
  });
  it("非ASCIIは =?UTF-8?B?...?= でエンコード", () => {
    const out = encodeRfc2047("見積もり");
    expect(out.startsWith("=?UTF-8?B?")).toBe(true);
    expect(out.endsWith("?=")).toBe(true);
  });
});

describe("gmail web urls", () => {
  const email = "me@example.com";
  it("thread url", () => {
    expect(gmailThreadUrl(email, "t123")).toBe(
      "https://mail.google.com/mail/?authuser=me%40example.com#all/t123"
    );
  });
  it("draft url", () => {
    expect(gmailDraftUrl(email, "m456")).toBe(
      "https://mail.google.com/mail/?authuser=me%40example.com#drafts/m456"
    );
  });
  it("drafts list url (フォールバック)", () => {
    expect(gmailDraftsListUrl(email)).toBe(
      "https://mail.google.com/mail/?authuser=me%40example.com#drafts"
    );
  });
});
```

- [ ] **Step 2: テストが落ちることを確認**

Run: `npx vitest run tests/gmailEncoding.test.ts`
Expected: FAIL — `Cannot find module '../src/adapters/gmail'`

- [ ] **Step 3: 実装（gmail.ts を新規作成、まずは純ロジックのみ）**

`src/adapters/gmail.ts`:

```ts
import { requestUrl } from "obsidian";
import type { GoogleOAuth } from "../auth/googleOAuth";

const API = "https://www.googleapis.com/gmail/v1/users/me";

// ---------- encode / decode (pure) ----------

function utf8ToBase64(s: string): string {
  if (typeof Buffer !== "undefined") return Buffer.from(s, "utf-8").toString("base64");
  return btoa(unescape(encodeURIComponent(s)));
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

export function base64UrlEncode(input: string | Uint8Array): string {
  const b64 = typeof input === "string" ? utf8ToBase64(input) : bytesToBase64(input);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecode(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  if (typeof Buffer !== "undefined") return Buffer.from(b64, "base64").toString("utf-8");
  return decodeURIComponent(escape(atob(b64)));
}

/** RFC 2047 encoded-word for non-ASCII header values (Subject, display names). */
export function encodeRfc2047(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${utf8ToBase64(value)}?=`;
}

// ---------- gmail web urls (pure) ----------

function mailBase(email: string): string {
  return `https://mail.google.com/mail/?authuser=${encodeURIComponent(email)}`;
}
export function gmailThreadUrl(email: string, threadId: string): string {
  return `${mailBase(email)}#all/${threadId}`;
}
export function gmailDraftUrl(email: string, draftMessageId: string): string {
  return `${mailBase(email)}#drafts/${draftMessageId}`;
}
export function gmailDraftsListUrl(email: string): string {
  return `${mailBase(email)}#drafts`;
}

// ---------- shared authed request ----------

async function authed(
  oauth: GoogleOAuth,
  path: string,
  init: { method?: "GET" | "POST" | "PUT"; body?: unknown } = {}
): Promise<any> {
  const token = await oauth.getAccessToken();
  const res = await requestUrl({
    url: path.startsWith("http") ? path : `${API}${path}`,
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    throw: false,
  });
  if (res.status >= 400) {
    throw new Error(`Gmail API HTTP ${res.status}: ${res.text}`);
  }
  return res.json;
}

export { authed as __authed };
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run tests/gmailEncoding.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/adapters/gmail.ts tests/gmailEncoding.test.ts
git commit -m "feat(mail): gmail encode/decode and web url helpers"
```

---

## Task 4: gmail.ts — メッセージ/スレッドのパース（純ロジック）

**Files:**
- Modify: `src/adapters/gmail.ts`
- Test: `tests/gmailParse.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`tests/gmailParse.test.ts`:

```ts
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
```

- [ ] **Step 2: テストが落ちることを確認**

Run: `npx vitest run tests/gmailParse.test.ts`
Expected: FAIL — `parseMessage is not a function` 等

- [ ] **Step 3: 実装（gmail.ts に型とパーサを追記）**

`src/adapters/gmail.ts` の末尾（`export { authed as __authed };` の前）に追記:

```ts
// ---------- types ----------

export interface GmailAttachmentMeta {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface GmailMessage {
  id: string;
  threadId: string;
  from: string;
  to: string;
  cc: string;
  subject: string;
  date: Date;
  snippet: string;
  bodyText: string;
  bodyHtml: string;
  labelIds: string[];
  attachments: GmailAttachmentMeta[];
  messageIdHeader: string;
  references: string;
}

export interface GmailThread {
  id: string;
  messages: GmailMessage[];
}

export interface GmailThreadSummary {
  id: string;
  subject: string;
  from: string;
  date: Date;
  snippet: string;
  unread: boolean;
  messageCount: number;
}

export interface GmailLabel {
  id: string;
  name: string;
  type: string;
}

// ---------- parsers (pure) ----------

export function getHeader(headers: any[], name: string): string {
  const lower = name.toLowerCase();
  const h = (headers ?? []).find((x) => (x.name ?? "").toLowerCase() === lower);
  return h?.value ?? "";
}

function collectParts(
  payload: any,
  acc: { text: string[]; html: string[]; attachments: GmailAttachmentMeta[] }
): void {
  if (!payload) return;
  const mime = payload.mimeType ?? "";
  if (payload.filename && payload.body?.attachmentId) {
    acc.attachments.push({
      attachmentId: payload.body.attachmentId,
      filename: payload.filename,
      mimeType: mime,
      size: payload.body.size ?? 0,
    });
  } else if (mime === "text/plain" && payload.body?.data) {
    acc.text.push(base64UrlDecode(payload.body.data));
  } else if (mime === "text/html" && payload.body?.data) {
    acc.html.push(base64UrlDecode(payload.body.data));
  }
  for (const part of payload.parts ?? []) collectParts(part, acc);
}

export function parseMessage(resource: any): GmailMessage {
  const headers = resource.payload?.headers ?? [];
  const acc = { text: [] as string[], html: [] as string[], attachments: [] as GmailAttachmentMeta[] };
  collectParts(resource.payload, acc);
  const dateStr = getHeader(headers, "Date");
  return {
    id: resource.id ?? "",
    threadId: resource.threadId ?? "",
    from: getHeader(headers, "From"),
    to: getHeader(headers, "To"),
    cc: getHeader(headers, "Cc"),
    subject: getHeader(headers, "Subject"),
    date: dateStr ? new Date(dateStr) : new Date(0),
    snippet: resource.snippet ?? "",
    bodyText: acc.text.join("\n").trim(),
    bodyHtml: acc.html.join("\n").trim(),
    labelIds: resource.labelIds ?? [],
    attachments: acc.attachments,
    messageIdHeader: getHeader(headers, "Message-ID"),
    references: getHeader(headers, "References"),
  };
}

function stripRe(subject: string): string {
  return subject.replace(/^((re|fwd?|転送)\s*:\s*)+/i, "").trim();
}

export function summarizeThread(thread: any): GmailThreadSummary {
  const messages = thread.messages ?? [];
  const first = messages[0];
  const last = messages[messages.length - 1] ?? first;
  const firstHeaders = first?.payload?.headers ?? [];
  const lastHeaders = last?.payload?.headers ?? [];
  const unread = messages.some((m: any) => (m.labelIds ?? []).includes("UNREAD"));
  const dateStr = getHeader(lastHeaders, "Date");
  return {
    id: thread.id ?? "",
    subject: stripRe(getHeader(firstHeaders, "Subject")) || "(件名なし)",
    from: getHeader(lastHeaders, "From"),
    date: dateStr ? new Date(dateStr) : new Date(0),
    snippet: thread.snippet ?? last?.snippet ?? "",
    unread,
    messageCount: messages.length,
  };
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run tests/gmailParse.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/adapters/gmail.ts tests/gmailParse.test.ts
git commit -m "feat(mail): parse gmail messages and thread summaries"
```

---

## Task 5: gmail.ts — 読取系 API 関数

**Files:**
- Modify: `src/adapters/gmail.ts`
- Test: `tests/gmailApi.test.ts`

- [ ] **Step 1: 失敗するテストを書く（requestUrl をモック）**

`tests/gmailApi.test.ts`:

```ts
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
```

- [ ] **Step 2: テストが落ちることを確認**

Run: `npx vitest run tests/gmailApi.test.ts`
Expected: FAIL — `listThreads is not a function`

- [ ] **Step 3: 実装（gmail.ts に API 関数を追記）**

`src/adapters/gmail.ts` の末尾に追記:

```ts
// ---------- read API ----------

export async function getProfile(oauth: GoogleOAuth): Promise<{ emailAddress: string }> {
  const json = await authed(oauth, "/profile");
  return { emailAddress: json.emailAddress ?? "" };
}

export async function listThreads(
  oauth: GoogleOAuth,
  query: string,
  maxResults = 25
): Promise<GmailThreadSummary[]> {
  const params = new URLSearchParams({
    q: query || "in:inbox",
    maxResults: String(maxResults),
  }).toString();
  const list = await authed(oauth, `/threads?${params}`);
  const ids: string[] = (list.threads ?? []).map((t: any) => t.id);
  const summaries: GmailThreadSummary[] = [];
  for (const id of ids) {
    const meta = await authed(
      oauth,
      `/threads/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`
    );
    summaries.push(summarizeThread(meta));
  }
  return summaries;
}

export async function getThread(oauth: GoogleOAuth, threadId: string): Promise<GmailThread> {
  const json = await authed(oauth, `/threads/${threadId}?format=full`);
  return {
    id: json.id ?? threadId,
    messages: (json.messages ?? []).map((m: any) => parseMessage(m)),
  };
}

export async function listLabels(oauth: GoogleOAuth): Promise<GmailLabel[]> {
  const json = await authed(oauth, "/labels");
  return (json.labels ?? []).map((l: any) => ({
    id: l.id,
    name: l.name,
    type: l.type ?? "user",
  }));
}

export async function modifyMessageLabels(
  oauth: GoogleOAuth,
  messageId: string,
  add: string[],
  remove: string[]
): Promise<void> {
  await authed(oauth, `/messages/${messageId}/modify`, {
    method: "POST",
    body: { addLabelIds: add, removeLabelIds: remove },
  });
}

export async function trashMessage(oauth: GoogleOAuth, messageId: string): Promise<void> {
  await authed(oauth, `/messages/${messageId}/trash`, { method: "POST" });
}

export async function getAttachment(
  oauth: GoogleOAuth,
  messageId: string,
  attachmentId: string
): Promise<Uint8Array> {
  const json = await authed(
    oauth,
    `/messages/${messageId}/attachments/${attachmentId}`
  );
  const b64 = (json.data ?? "").replace(/-/g, "+").replace(/_/g, "/");
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(b64, "base64"));
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run tests/gmailApi.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/adapters/gmail.ts tests/gmailApi.test.ts
git commit -m "feat(mail): gmail read api (threads, labels, modify, attachments)"
```

---

## Task 6: VIEW_TYPE_MAIL + MailView スケルトン（一覧＋本文・既読化）

**Files:**
- Modify: `src/core/constants.ts:1-5`
- Create: `src/core/MailView.ts`
- Modify: `src/main.ts`
- Modify: `src/commands.ts`

- [ ] **Step 1: constants に VIEW_TYPE_MAIL を追加**

`src/core/constants.ts` の末尾に追加:

```ts
export const VIEW_TYPE_MAIL = "deck-dashboard-mail-view";
```

- [ ] **Step 2: MailView を作成**

`src/core/MailView.ts`:

```ts
import { ItemView, Notice, Plugin, WorkspaceLeaf } from "obsidian";
import { VIEW_TYPE_MAIL } from "./constants";
import { GoogleOAuth, hasScope } from "../auth/googleOAuth";
import {
  listThreads,
  getThread,
  modifyMessageLabels,
  type GmailThreadSummary,
  type GmailThread,
} from "../adapters/gmail";
import { loadMailConfig, type MailConfig } from "./mailConfig";

const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.modify";

export class MailView extends ItemView {
  private plugin: Plugin;
  private oauth: GoogleOAuth;
  private config!: MailConfig;
  private listEl!: HTMLElement;
  private detailEl!: HTMLElement;
  private pendingThreadId: string | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: Plugin) {
    super(leaf);
    this.plugin = plugin;
    this.oauth = new GoogleOAuth(plugin);
  }

  getViewType(): string {
    return VIEW_TYPE_MAIL;
  }
  getDisplayText(): string {
    return "メール";
  }
  getIcon(): string {
    return "mail";
  }

  async onOpen(): Promise<void> {
    this.config = await loadMailConfig(this.plugin);
    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    root.addClass("nd-mail-view");

    const toolbar = root.createDiv({ cls: "nd-mail-toolbar" });
    const refreshBtn = toolbar.createEl("button", { text: "⟳ 更新" });
    refreshBtn.addEventListener("click", () => void this.refresh());
    const composeBtn = toolbar.createEl("button", { text: "✏ 新規作成", cls: "mod-cta" });
    composeBtn.addEventListener("click", () => this.openCompose());

    const body = root.createDiv({ cls: "nd-mail-body" });
    this.listEl = body.createDiv({ cls: "nd-mail-list" });
    this.detailEl = body.createDiv({ cls: "nd-mail-detail" });

    await this.refresh();
  }

  async onClose(): Promise<void> {
    this.containerEl.children[1].empty();
  }

  /** Open a specific thread (called from the dashboard widget). */
  openThread(threadId: string): void {
    this.pendingThreadId = threadId;
    if (this.detailEl) void this.showThread(threadId);
  }

  private openCompose(): void {
    new Notice("作成機能は次フェーズで実装されます");
  }

  private async ensureAuth(): Promise<boolean> {
    const tokens = await this.oauth.getTokens();
    if (!hasScope(tokens, GMAIL_SCOPE)) {
      this.listEl.empty();
      const empty = this.listEl.createDiv({ cls: "nd-empty" });
      empty.createEl("p", {
        text: "Gmail の認証が必要です。設定 → Deck → 「再認証」を実行してください。",
      });
      return false;
    }
    return true;
  }

  private async refresh(): Promise<void> {
    if (!this.listEl) return;
    if (!(await this.ensureAuth())) return;
    this.listEl.empty();
    const status = this.listEl.createDiv({ cls: "nd-muted", text: "読み込み中…" });
    try {
      const threads = await listThreads(this.oauth, this.config.query, this.config.maxItems);
      status.remove();
      if (threads.length === 0) {
        this.listEl.createEl("p", { cls: "nd-empty", text: "メールはありません 🎉" });
        return;
      }
      for (const t of threads) this.renderRow(t);
      if (this.pendingThreadId) {
        void this.showThread(this.pendingThreadId);
        this.pendingThreadId = null;
      }
    } catch (e) {
      status.remove();
      this.listEl.createEl("pre", { cls: "nd-error", text: `Gmail error: ${(e as Error).message}` });
    }
  }

  private renderRow(t: GmailThreadSummary): void {
    const row = this.listEl.createDiv({ cls: "nd-mail-row" });
    if (t.unread) row.addClass("nd-mail-unread");
    row.createEl("div", { cls: "nd-mail-from", text: senderName(t.from) });
    row.createEl("div", { cls: "nd-mail-subject", text: t.subject });
    row.createEl("div", { cls: "nd-mail-snippet nd-muted", text: t.snippet });
    row.addEventListener("click", () => void this.showThread(t.id));
  }

  private async showThread(threadId: string): Promise<void> {
    this.detailEl.empty();
    const status = this.detailEl.createDiv({ cls: "nd-muted", text: "読み込み中…" });
    try {
      const thread = await getThread(this.oauth, threadId);
      status.remove();
      this.renderThread(thread);
      // 既読化: 未読メッセージから UNREAD を外す
      for (const m of thread.messages) {
        if (m.labelIds.includes("UNREAD")) {
          void modifyMessageLabels(this.oauth, m.id, [], ["UNREAD"]);
        }
      }
    } catch (e) {
      status.remove();
      this.detailEl.createEl("pre", { cls: "nd-error", text: `Gmail error: ${(e as Error).message}` });
    }
  }

  private renderThread(thread: GmailThread): void {
    for (const m of thread.messages) {
      const card = this.detailEl.createDiv({ cls: "nd-mail-msg" });
      const head = card.createDiv({ cls: "nd-mail-msg-head" });
      head.createEl("div", { cls: "nd-mail-msg-from", text: m.from });
      head.createEl("div", { cls: "nd-mail-msg-date nd-muted", text: m.date.toLocaleString() });
      card.createEl("div", { cls: "nd-mail-msg-subject", text: m.subject });
      card.createEl("pre", { cls: "nd-mail-msg-body", text: m.bodyText || m.snippet });
      if (m.attachments.length > 0) {
        const att = card.createDiv({ cls: "nd-mail-attachments nd-muted" });
        att.setText(`📎 添付 ${m.attachments.length}件: ${m.attachments.map((a) => a.filename).join(", ")}`);
      }
    }
  }
}

function senderName(from: string): string {
  const m = from.match(/^\s*"?([^"<]+?)"?\s*</);
  return (m ? m[1] : from).trim();
}
```

- [ ] **Step 3: main.ts に登録 + リボン**

`src/main.ts` の import に追加:

```ts
import { MailView } from "./core/MailView";
import { VIEW_TYPE_MAIL } from "./core/constants";
```

`onload()` 内、`this.registerView(VIEW_TYPE_DASHBOARD, ...)` の直後に追加:

```ts
    this.registerView(VIEW_TYPE_MAIL, (leaf) => new MailView(leaf, this));
```

`addRibbonIcon("layout-dashboard", ...)` の直後に追加:

```ts
    this.addRibbonIcon("mail", "メールを開く", () => {
      (this.app as any).commands.executeCommandById("deck-dashboard:open-mail");
    });
```

- [ ] **Step 4: commands.ts に「メールを開く」コマンド**

`src/commands.ts` の import に追加:

```ts
import { VIEW_TYPE_MAIL } from "./core/constants";
```

`registerCommands` 内（`open-home` コマンドの後あたり）に追加:

```ts
  plugin.addCommand({
    id: "open-mail",
    name: "メールを開く (Gmail)",
    callback: async () => {
      const { workspace } = plugin.app;
      let leaf = workspace.getLeavesOfType(VIEW_TYPE_MAIL)[0];
      if (!leaf) {
        leaf = workspace.getLeaf("tab");
        await leaf.setViewState({ type: VIEW_TYPE_MAIL, active: true });
      }
      workspace.revealLeaf(leaf);
    },
  });
```

- [ ] **Step 5: ビルドが通ることを確認**

Run: `npm run build`
Expected: ビルド成功（型エラーなし）。`npx vitest run` で既存テストもグリーン。

- [ ] **Step 6: コミット**

```bash
git add src/core/constants.ts src/core/MailView.ts src/main.ts src/commands.ts
git commit -m "feat(mail): MailView pane with thread list, reading pane, mark-as-read"
```

---

## Task 7: MailWidget（ダッシュボード受信箱ウィジェット）

**Files:**
- Create: `src/widgets/MailWidget.ts`
- Modify: `src/widgets/index.ts`

- [ ] **Step 1: MailWidget を作成**

`src/widgets/MailWidget.ts`:

```ts
import { Setting } from "obsidian";
import type { WidgetDefinition } from "./types";
import { GoogleOAuth, hasScope } from "../auth/googleOAuth";
import { listThreads, type GmailThreadSummary } from "../adapters/gmail";
import { MailView } from "../core/MailView";
import { VIEW_TYPE_MAIL } from "../core/constants";

const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.modify";

interface Settings {
  query: string;
  maxItems: number;
}

async function openMailViewAt(app: any, threadId: string): Promise<void> {
  let leaf = app.workspace.getLeavesOfType(VIEW_TYPE_MAIL)[0];
  if (!leaf) {
    leaf = app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: VIEW_TYPE_MAIL, active: true });
  }
  app.workspace.revealLeaf(leaf);
  const view = leaf.view;
  if (view instanceof MailView) view.openThread(threadId);
}

export const mailWidget: WidgetDefinition<Settings> = {
  type: "mail",
  label: "メール (Gmail)",
  description: "Gmail の受信一覧をコンパクト表示。クリックでメールペインを開く。OAuth(gmail)認証が必要。",
  defaultSettings: () => ({ query: "in:inbox", maxItems: 8 }),
  async render(el, settings, ctx) {
    el.empty();
    el.addClass("nd-widget-mail");
    const oauth = new GoogleOAuth(ctx.plugin);
    const tokens = await oauth.getTokens();
    if (!hasScope(tokens, GMAIL_SCOPE)) {
      const empty = el.createDiv({ cls: "nd-empty" });
      empty.createEl("p", { text: "Gmail 認証が必要です（設定 → Deck → 再認証）。" });
      return;
    }

    const toolbar = el.createDiv({ cls: "nd-mail-widget-toolbar" });
    const openBtn = toolbar.createEl("button", { text: "✏ 作成" });
    openBtn.addEventListener("click", () => void openMailViewAt(ctx.app, ""));
    const refreshBtn = toolbar.createEl("button", { text: "⟳ 更新" });
    refreshBtn.addEventListener("click", () => void mailWidget.render(el, settings, ctx));

    const status = el.createDiv({ cls: "nd-muted", text: "読み込み中…" });
    try {
      const threads = await listThreads(oauth, settings.query || "in:inbox", settings.maxItems);
      status.remove();
      if (threads.length === 0) {
        el.createEl("p", { cls: "nd-empty", text: "メールなし 🎉" });
        return;
      }
      const ul = el.createEl("ul", { cls: "nd-mail-widget-list" });
      for (const t of threads) {
        const li = ul.createEl("li", { cls: "nd-mail-widget-item" });
        if (t.unread) li.addClass("nd-mail-unread");
        li.createEl("span", { cls: "nd-mail-subject", text: t.subject });
        li.createEl("span", { cls: "nd-mail-from nd-muted", text: ` — ${shortFrom(t)}` });
        li.addEventListener("click", () => void openMailViewAt(ctx.app, t.id));
      }
    } catch (e) {
      status.remove();
      el.createEl("pre", { cls: "nd-error", text: `Gmail error: ${(e as Error).message}` });
    }
  },
  renderSettingsForm(container, settings, onChange) {
    new Setting(container)
      .setName("検索クエリ")
      .setDesc("Gmail 検索構文。例: in:inbox / is:unread / from:boss@x.com")
      .addText((t) => {
        t.setValue(settings.query);
        t.inputEl.style.width = "100%";
        t.onChange((v) => onChange({ ...settings, query: v.trim() || "in:inbox" }));
      });
    new Setting(container)
      .setName("表示件数")
      .addText((t) =>
        t.setValue(String(settings.maxItems)).onChange((v) => {
          const n = parseInt(v, 10);
          if (!isNaN(n) && n > 0) onChange({ ...settings, maxItems: n });
        })
      );
  },
};

function shortFrom(t: GmailThreadSummary): string {
  const m = t.from.match(/^\s*"?([^"<]+?)"?\s*</);
  return (m ? m[1] : t.from).trim();
}
```

- [ ] **Step 2: index.ts に登録**

`src/widgets/index.ts` の import に追加:

```ts
import { mailWidget } from "./MailWidget";
```

`registerBuiltinWidgets()` 内に追加（`aiSearchWidget` の後あたり）:

```ts
  widgetRegistry.register(mailWidget);
```

- [ ] **Step 3: ビルド確認**

Run: `npm run build`
Expected: 成功。`npx vitest run` グリーン。

- [ ] **Step 4: コミット**

```bash
git add src/widgets/MailWidget.ts src/widgets/index.ts
git commit -m "feat(mail): dashboard inbox widget linking to MailView"
```

---

# Phase 2 — 作成・送信（ブラウザ確認）

このフェーズ完了で **MVP 達成**（確認・書く・送信）。

## Task 8: gmail.ts — MIME ビルダー（純ロジック）

**Files:**
- Modify: `src/adapters/gmail.ts`
- Test: `tests/gmailMime.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`tests/gmailMime.test.ts`:

```ts
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
    // 本文は base64 で含まれる
    const bodyB64 = mime.trim().split("\r\n").pop() as string;
    expect(base64UrlDecode(bodyB64)).toBe("本文です");
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
});
```

- [ ] **Step 2: テストが落ちることを確認**

Run: `npx vitest run tests/gmailMime.test.ts`
Expected: FAIL — `buildMimeMessage is not a function`

- [ ] **Step 3: 実装（gmail.ts に追記）**

`src/adapters/gmail.ts` の型セクション付近に追加:

```ts
export interface DraftAttachment {
  filename: string;
  mimeType: string;
  data: Uint8Array;
}

export interface DraftInput {
  to: string;
  cc?: string;
  subject: string;
  bodyText: string;
  threadId?: string;
  inReplyTo?: string;
  references?: string;
  from?: string;
  attachments?: DraftAttachment[];
}
```

そして MIME ビルダーを追記:

```ts
// ---------- MIME builder (pure) ----------

function stdBase64(input: string | Uint8Array): string {
  return typeof input === "string" ? utf8ToBase64(input) : bytesToBase64(input);
}

export function buildMimeMessage(input: DraftInput, boundary = `b_${Date.now().toString(36)}`): string {
  const headerLines: string[] = [];
  if (input.from) headerLines.push(`From: ${input.from}`);
  headerLines.push(`To: ${input.to}`);
  if (input.cc) headerLines.push(`Cc: ${input.cc}`);
  headerLines.push(`Subject: ${encodeRfc2047(input.subject)}`);
  if (input.inReplyTo) headerLines.push(`In-Reply-To: ${input.inReplyTo}`);
  if (input.references) headerLines.push(`References: ${input.references}`);
  headerLines.push("MIME-Version: 1.0");

  const atts = input.attachments ?? [];
  if (atts.length === 0) {
    headerLines.push('Content-Type: text/plain; charset="UTF-8"');
    headerLines.push("Content-Transfer-Encoding: base64");
    return headerLines.join("\r\n") + "\r\n\r\n" + stdBase64(input.bodyText);
  }

  headerLines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
  const parts: string[] = [];
  parts.push(
    `--${boundary}\r\n` +
      'Content-Type: text/plain; charset="UTF-8"\r\n' +
      "Content-Transfer-Encoding: base64\r\n\r\n" +
      stdBase64(input.bodyText)
  );
  for (const a of atts) {
    parts.push(
      `--${boundary}\r\n` +
        `Content-Type: ${a.mimeType}; name="${a.filename}"\r\n` +
        `Content-Disposition: attachment; filename="${a.filename}"\r\n` +
        "Content-Transfer-Encoding: base64\r\n\r\n" +
        stdBase64(a.data)
    );
  }
  return headerLines.join("\r\n") + "\r\n\r\n" + parts.join("\r\n") + `\r\n--${boundary}--`;
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run tests/gmailMime.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/adapters/gmail.ts tests/gmailMime.test.ts
git commit -m "feat(mail): RFC822 MIME builder for drafts"
```

---

## Task 9: gmail.ts — createDraft API

**Files:**
- Modify: `src/adapters/gmail.ts`
- Test: `tests/gmailDraft.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`tests/gmailDraft.test.ts`:

```ts
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
```

- [ ] **Step 2: テストが落ちることを確認**

Run: `npx vitest run tests/gmailDraft.test.ts`
Expected: FAIL — `createDraft is not a function`

- [ ] **Step 3: 実装（gmail.ts に追記）**

```ts
// ---------- draft API ----------

export interface CreateDraftResult {
  draftId: string;
  messageId: string;
  threadId: string;
}

export async function createDraft(
  oauth: GoogleOAuth,
  input: DraftInput
): Promise<CreateDraftResult> {
  const raw = base64UrlEncode(buildMimeMessage(input));
  const message: any = { raw };
  if (input.threadId) message.threadId = input.threadId;
  const json = await authed(oauth, "/drafts", { method: "POST", body: { message } });
  return {
    draftId: json.id ?? "",
    messageId: json.message?.id ?? "",
    threadId: json.message?.threadId ?? input.threadId ?? "",
  };
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run tests/gmailDraft.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/adapters/gmail.ts tests/gmailDraft.test.ts
git commit -m "feat(mail): createDraft via gmail api"
```

---

## Task 10: 返信ヘッダ・引用ロジック（純ロジック）

**Files:**
- Modify: `src/adapters/gmail.ts`
- Test: `tests/gmailReply.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`tests/gmailReply.test.ts`:

```ts
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
```

- [ ] **Step 2: テストが落ちることを確認**

Run: `npx vitest run tests/gmailReply.test.ts`
Expected: FAIL — `buildReplyFields is not a function`

- [ ] **Step 3: 実装（gmail.ts に追記）**

```ts
// ---------- reply helpers (pure) ----------

export interface ReplyFields {
  to: string;
  subject: string;
  inReplyTo: string;
  references: string;
  threadId: string;
}

export function buildReplyFields(m: GmailMessage): ReplyFields {
  const subject = /^re:/i.test(m.subject.trim()) ? m.subject : `Re: ${m.subject}`;
  const references = m.references ? `${m.references} ${m.messageIdHeader}`.trim() : m.messageIdHeader;
  return {
    to: m.from,
    subject,
    inReplyTo: m.messageIdHeader,
    references,
    threadId: m.threadId,
  };
}

export function quoteForReply(m: GmailMessage): string {
  const quoted = m.bodyText
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
  return `\n\nOn ${m.date.toLocaleString()}, ${m.from} wrote:\n${quoted}`;
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run tests/gmailReply.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/adapters/gmail.ts tests/gmailReply.test.ts
git commit -m "feat(mail): reply field and quote helpers"
```

---

## Task 11: MailComposeModal（作成/返信/転送 → Gmailで確認）

**Files:**
- Create: `src/ui/MailComposeModal.ts`
- Modify: `src/core/MailView.ts`

- [ ] **Step 1: MailComposeModal を作成**

`src/ui/MailComposeModal.ts`:

```ts
import { App, Modal, Notice, Plugin } from "obsidian";
import { GoogleOAuth } from "../auth/googleOAuth";
import {
  createDraft,
  getProfile,
  gmailDraftUrl,
  gmailDraftsListUrl,
  type DraftInput,
} from "../adapters/gmail";

export interface ComposeOptions {
  mode: "new" | "reply" | "forward";
  to?: string;
  cc?: string;
  subject?: string;
  bodyText?: string;
  threadId?: string;
  inReplyTo?: string;
  references?: string;
}

export class MailComposeModal extends Modal {
  private oauth: GoogleOAuth;

  constructor(app: App, private plugin: Plugin, private opts: ComposeOptions) {
    super(app);
    this.oauth = new GoogleOAuth(plugin);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("nd-mail-compose");
    contentEl.createEl("h3", {
      text: this.opts.mode === "reply" ? "返信" : this.opts.mode === "forward" ? "転送" : "新規作成",
    });

    const toInput = labeledInput(contentEl, "To", this.opts.to ?? "");
    const ccInput = labeledInput(contentEl, "Cc", this.opts.cc ?? "");
    const subjectInput = labeledInput(contentEl, "件名", this.opts.subject ?? "");
    const bodyInput = contentEl.createEl("textarea", {
      cls: "nd-mail-compose-body",
      attr: { rows: "14", placeholder: "本文…" },
    });
    bodyInput.value = this.opts.bodyText ?? "";

    const buttons = contentEl.createDiv({ cls: "modal-button-container" });
    const cancel = buttons.createEl("button", { text: "キャンセル" });
    cancel.addEventListener("click", () => this.close());
    const send = buttons.createEl("button", { text: "📤 Gmailで確認して送信", cls: "mod-cta" });
    send.addEventListener("click", async () => {
      if (!toInput.value.trim()) {
        new Notice("宛先(To)が未入力です");
        return;
      }
      if (!bodyInput.value.trim()) {
        new Notice("本文が空です");
        return;
      }
      send.disabled = true;
      send.setText("下書き作成中…");
      try {
        const input: DraftInput = {
          to: toInput.value.trim(),
          cc: ccInput.value.trim() || undefined,
          subject: subjectInput.value.trim(),
          bodyText: bodyInput.value,
          threadId: this.opts.threadId,
          inReplyTo: this.opts.inReplyTo,
          references: this.opts.references,
        };
        const result = await createDraft(this.oauth, input);
        const email = (await getProfile(this.oauth)).emailAddress;
        const url = result.messageId
          ? gmailDraftUrl(email, result.messageId)
          : gmailDraftsListUrl(email);
        window.open(url, "_blank");
        new Notice("Gmail の下書きを開きました。内容を確認して送信してください。");
        this.close();
      } catch (e) {
        new Notice(`下書き作成失敗: ${(e as Error).message}`);
        send.disabled = false;
        send.setText("📤 Gmailで確認して送信");
      }
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

function labeledInput(parent: HTMLElement, label: string, value: string): HTMLInputElement {
  const row = parent.createDiv({ cls: "nd-mail-compose-row" });
  row.createEl("label", { text: label, cls: "nd-mail-compose-label" });
  const input = row.createEl("input", { type: "text", cls: "nd-mail-compose-input" });
  input.value = value;
  return input;
}
```

- [ ] **Step 2: MailView の作成ボタンと返信/転送を接続**

`src/core/MailView.ts` の import に追加:

```ts
import { MailComposeModal } from "../ui/MailComposeModal";
import { buildReplyFields, quoteForReply, type GmailMessage } from "../adapters/gmail";
```

`openCompose()`（Task6 で `new Notice(...)` のスタブ）を置き換え:

```ts
  private openCompose(): void {
    new MailComposeModal(this.app, this.plugin, { mode: "new" }).open();
  }

  private openReply(m: GmailMessage): void {
    const f = buildReplyFields(m);
    new MailComposeModal(this.app, this.plugin, {
      mode: "reply",
      to: f.to,
      subject: f.subject,
      threadId: f.threadId,
      inReplyTo: f.inReplyTo,
      references: f.references,
      bodyText: quoteForReply(m),
    }).open();
  }

  private openForward(m: GmailMessage): void {
    new MailComposeModal(this.app, this.plugin, {
      mode: "forward",
      subject: /^fwd?:/i.test(m.subject) ? m.subject : `Fwd: ${m.subject}`,
      bodyText: `\n\n---------- Forwarded message ----------\nFrom: ${m.from}\nDate: ${m.date.toLocaleString()}\nSubject: ${m.subject}\n\n${m.bodyText}`,
    }).open();
  }
```

`renderThread()` 内の各 `card` にアクション行を追加（`card.createEl("pre", ...)` の後）:

```ts
      const actions = card.createDiv({ cls: "nd-mail-msg-actions" });
      const replyBtn = actions.createEl("button", { text: "↩ 返信" });
      replyBtn.addEventListener("click", () => this.openReply(m));
      const fwdBtn = actions.createEl("button", { text: "↪ 転送" });
      fwdBtn.addEventListener("click", () => this.openForward(m));
```

- [ ] **Step 3: ビルド確認**

Run: `npm run build`
Expected: 成功。`npx vitest run` グリーン。

- [ ] **Step 4: 手動確認（任意・実機）**

Obsidian でプラグイン再読込 → 設定で再認証（gmailスコープ同意）→ メールを開く → 新規作成 → 「Gmailで確認して送信」でブラウザに下書きが開くこと。

- [ ] **Step 5: コミット**

```bash
git add src/ui/MailComposeModal.ts src/core/MailView.ts
git commit -m "feat(mail): compose/reply/forward modal -> create draft -> open in Gmail"
```

---

# Phase 3 — AI 返信（スレッド要約 + vault背景RAG → ドラフト生成）

## Task 12: vaultRetrieval を AISearch から共通化

**Files:**
- Create: `src/core/vaultRetrieval.ts`
- Modify: `src/widgets/AISearchWidget.ts`
- Test: `tests/vaultRetrieval.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`tests/vaultRetrieval.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { __test } from "../src/core/vaultRetrieval";

const { tokenize, scoreFilename, scoreContent, stripFrontmatter } = __test;

describe("tokenize", () => {
  it("2文字以上のトークンに分割し記号を除去", () => {
    expect(tokenize("見積もり, サンプル案件")).toContain("サンプル案件");
    expect(tokenize("a b cd")).toEqual(["cd"]); // 1文字は除外
  });
});

describe("scoreFilename", () => {
  it("パスにトークンが含まれると加点", () => {
    expect(scoreFilename("議事録/サンプル.md", ["サンプル"])).toBe(1);
    expect(scoreFilename("other.md", ["サンプル"])).toBe(0);
  });
});

describe("scoreContent", () => {
  it("出現回数を上限5でスコア", () => {
    expect(scoreContent("サンプル サンプル サンプル", ["サンプル"])).toBe(3);
    expect(scoreContent("x".repeat(0), ["サンプル"])).toBe(0);
  });
});

describe("stripFrontmatter", () => {
  it("先頭の --- ブロックを除去", () => {
    expect(stripFrontmatter("---\na: 1\n---\n本文")).toBe("本文");
    expect(stripFrontmatter("本文のみ")).toBe("本文のみ");
  });
});
```

- [ ] **Step 2: テストが落ちることを確認**

Run: `npx vitest run tests/vaultRetrieval.test.ts`
Expected: FAIL — `Cannot find module '../src/core/vaultRetrieval'`

- [ ] **Step 3: vaultRetrieval.ts を作成**

`src/core/vaultRetrieval.ts`（ロジックは `AISearchWidget.ts` の `selectCandidates`/`tokenize`/`scoreFilename`/`scoreContent`/`stripFrontmatter` をそのまま移植）:

```ts
import type { App, TFile } from "obsidian";

export interface Candidate {
  path: string;
  excerpt: string;
  score: number;
}

export interface RetrievalOptions {
  topK: number;
  excerptChars: number;
  folders: string[]; // empty = whole vault (minus excludes)
  excludeFolders: string[];
}

export const ALWAYS_EXCLUDED = [".obsidian", ".trash", ".claude", "node_modules"];
export const DEFAULT_EXCLUDES = ["ログ", "アーカイブ", "添付", "inbox/temp"];

export async function selectCandidates(
  app: App,
  query: string,
  opts: RetrievalOptions
): Promise<Candidate[]> {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  const files: TFile[] = (app.vault as any).getMarkdownFiles();
  const excludes = [...ALWAYS_EXCLUDED, ...(opts.excludeFolders ?? DEFAULT_EXCLUDES)];
  const filtered = files.filter((f) => {
    if (excludes.some((ex) => f.path === ex || f.path.startsWith(ex + "/"))) return false;
    if (opts.folders.length === 0) return true;
    return opts.folders.some((fld) => f.path === fld || f.path.startsWith(fld + "/"));
  });

  const scoredByName = filtered
    .map((f) => ({ f, sc: scoreFilename(f.path, tokens) }))
    .sort((a, b) => b.sc - a.sc)
    .slice(0, Math.min(200, filtered.length));

  const candidates: Candidate[] = [];
  for (const { f, sc } of scoredByName) {
    let content = "";
    try {
      content = await app.vault.cachedRead(f);
    } catch {
      continue;
    }
    const total = sc * 3 + scoreContent(content, tokens);
    if (total <= 0) continue;
    candidates.push({
      path: f.path,
      excerpt: stripFrontmatter(content).slice(0, opts.excerptChars),
      score: total,
    });
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, opts.topK);
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[、。！？「」『』（）()【】\[\]]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

function scoreFilename(path: string, tokens: string[]): number {
  const lower = path.toLowerCase();
  let s = 0;
  for (const t of tokens) if (lower.includes(t)) s += 1;
  return s;
}

function scoreContent(content: string, tokens: string[]): number {
  const lower = content.toLowerCase();
  let s = 0;
  for (const t of tokens) {
    const re = new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
    const m = lower.match(re);
    if (m) s += Math.min(5, m.length);
  }
  return s;
}

function stripFrontmatter(s: string): string {
  if (!s.startsWith("---")) return s;
  const end = s.indexOf("\n---", 4);
  if (end < 0) return s;
  return s.slice(end + 4).trimStart();
}

export const __test = { tokenize, scoreFilename, scoreContent, stripFrontmatter };
```

- [ ] **Step 4: AISearchWidget を共通化版に差し替え**

`src/widgets/AISearchWidget.ts`:
- import に追加: `import { selectCandidates as sharedSelect, ALWAYS_EXCLUDED, DEFAULT_EXCLUDES } from "../core/vaultRetrieval";`
- ファイル下部の `selectCandidates`/`tokenize`/`scoreFilename`/`scoreContent`/`stripFrontmatter` 関数定義と、冒頭の `ALWAYS_EXCLUDED`/`DEFAULT_EXCLUDES` 定数定義を削除。
- 呼び出し箇所（`render` 内 94行目付近）の `await selectCandidates(ctx, q, settings)` を次に置換:

```ts
      const candidates = await sharedSelect(ctx.app, q, {
        topK: settings.topK,
        excerptChars: settings.excerptChars,
        folders: settings.folders,
        excludeFolders: settings.excludeFolders ?? DEFAULT_EXCLUDES,
      });
```

- [ ] **Step 5: テスト + ビルド確認**

Run: `npx vitest run tests/vaultRetrieval.test.ts && npm run build`
Expected: 両方成功（AISearch の挙動は不変）。

- [ ] **Step 6: コミット**

```bash
git add src/core/vaultRetrieval.ts src/widgets/AISearchWidget.ts tests/vaultRetrieval.test.ts
git commit -m "refactor(ai): extract shared vault candidate retrieval"
```

---

## Task 13: ai/mailAssist（要約 + RAG + 返信ドラフト生成）

**Files:**
- Create: `src/ai/mailAssist.ts`
- Test: `tests/mailAssist.test.ts`

- [ ] **Step 1: 失敗するテストを書く（プロンプト組立の純ロジック）**

`tests/mailAssist.test.ts`:

```ts
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
      subject: "サンプル案件の見積もり",
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
    expect(q).toContain("サンプル案件");
    expect(q).toContain("Tanaka");
  });
});

describe("buildPrompt", () => {
  it("スレッド・vault背景・指示を含む", () => {
    const cands: Candidate[] = [{ path: "議事録/サンプル.md", excerpt: "前回は単価で揉めた", score: 9 }];
    const p = buildPrompt(thread, cands);
    expect(p).toContain("見積もりをお願いします。");
    expect(p).toContain("議事録/サンプル.md");
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
```

- [ ] **Step 2: テストが落ちることを確認**

Run: `npx vitest run tests/mailAssist.test.ts`
Expected: FAIL — `Cannot find module '../src/ai/mailAssist'`

- [ ] **Step 3: 実装**

`src/ai/mailAssist.ts`:

```ts
import type { App, Plugin } from "obsidian";
import { chat } from "../adapters/anthropic";
import { runClaudeP } from "../adapters/claudeCode";
import { selectCandidates, DEFAULT_EXCLUDES, type Candidate } from "../core/vaultRetrieval";
import type { GmailThread } from "../adapters/gmail";
import type { MailConfig } from "../core/mailConfig";

export type { GmailThread };

export interface AssistResult {
  summary: string;
  replyDraft: string;
  sources: string[];
}

const DELIM = "=== 返信ドラフト ===";

function senderName(from: string): string {
  const m = from.match(/^\s*"?([^"<]+?)"?\s*</);
  return (m ? m[1] : from).trim();
}

function buildThreadText(thread: GmailThread): string {
  return thread.messages
    .map((m) => `[${m.date.toLocaleString()}] ${m.from}\n${m.bodyText}`)
    .join("\n\n----\n\n");
}

function buildRagQuery(thread: GmailThread): string {
  const first = thread.messages[0];
  const last = thread.messages[thread.messages.length - 1] ?? first;
  const subject = first?.subject ?? "";
  return `${subject} ${senderName(last?.from ?? "")}`.trim();
}

function buildPrompt(thread: GmailThread, candidates: Candidate[]): string {
  const ragBlock = candidates.length
    ? candidates.map((c, i) => `[${i + 1}] ${c.path}\n${c.excerpt.replace(/\n+/g, " ").trim()}`).join("\n\n")
    : "(関連する過去資料は見つかりませんでした)";
  return (
    "あなたは日本語ビジネスメールのアシスタントです。以下のメールスレッドと、vault内の関連する過去資料(議事録/ナレッジ)を読み、" +
    "(1) スレッドの要約 と (2) 適切な返信ドラフト を作成してください。\n" +
    "過去資料に書かれた背景・経緯・決定事項を踏まえて返信を書くこと。資料に無い事実を創作しないこと。\n\n" +
    `出力フォーマット:\n## 要約\n(箇条書き)\n\n${DELIM}\n(返信本文。宛名から始め、署名は不要)\n\n` +
    "# メールスレッド\n" +
    buildThreadText(thread) +
    "\n\n# vault内の関連資料\n" +
    ragBlock
  );
}

function parseAssistOutput(raw: string): { summary: string; replyDraft: string } {
  const idx = raw.indexOf(DELIM);
  if (idx < 0) return { summary: "", replyDraft: raw.trim() };
  const summary = raw.slice(0, idx).replace(/^##\s*要約\s*/m, "").trim();
  const replyDraft = raw.slice(idx + DELIM.length).trim();
  return { summary, replyDraft };
}

export async function generateReplyDraft(
  app: App,
  plugin: Plugin,
  thread: GmailThread,
  config: MailConfig
): Promise<AssistResult> {
  const query = buildRagQuery(thread);
  const candidates = await selectCandidates(app, query, {
    topK: 8,
    excerptChars: 400,
    folders: config.ragFolders,
    excludeFolders: DEFAULT_EXCLUDES,
  });
  const prompt = buildPrompt(thread, candidates);

  let raw: string;
  if (config.backend === "claude-code") {
    raw = (await runClaudeP(prompt, config.claudeCmd)).text;
  } else {
    const data = ((await plugin.loadData()) ?? {}) as { anthropic_api_key?: string };
    if (!data.anthropic_api_key) throw new Error("Anthropic API キーが未設定です（設定で backend を claude-code にするか、キーを設定）");
    raw = (await chat(data.anthropic_api_key, config.model, "", [{ role: "user", content: prompt }], 1500)).text;
  }
  const { summary, replyDraft } = parseAssistOutput(raw);
  return { summary, replyDraft, sources: candidates.map((c) => c.path) };
}

export const __test = { buildThreadText, buildRagQuery, buildPrompt, parseAssistOutput };
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run tests/mailAssist.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/ai/mailAssist.ts tests/mailAssist.test.ts
git commit -m "feat(mail): AI reply draft (thread summary + vault RAG)"
```

---

## Task 14: MailView に「AI返信」ボタンを接続

**Files:**
- Modify: `src/core/MailView.ts`

- [ ] **Step 1: AI返信フローを実装**

`src/core/MailView.ts` の import に追加:

```ts
import { generateReplyDraft } from "../ai/mailAssist";
import { Notice } from "obsidian"; // 既に import 済みなら不要
```

`showThread()` で取得した `thread` を保持できるよう、フィールドを追加（クラス先頭の `private pendingThreadId` 付近）:

```ts
  private currentThread: import("../adapters/gmail").GmailThread | null = null;
```

`showThread()` 内、`this.renderThread(thread);` の前に `this.currentThread = thread;` を追加。

`renderThread()` のアクション行（Task11 で追加した `actions` div）に AI返信ボタンを追加:

```ts
      const aiBtn = actions.createEl("button", { text: "🤖 AI返信" });
      aiBtn.addEventListener("click", () => void this.openAIReply(m));
```

メソッドを追加:

```ts
  private async openAIReply(m: GmailMessage): Promise<void> {
    if (!this.currentThread) return;
    const notice = new Notice("AI返信ドラフト生成中…（スレッド要約＋vault背景）", 0);
    try {
      const result = await generateReplyDraft(this.app, this.plugin, this.currentThread, this.config);
      notice.hide();
      const f = buildReplyFields(m);
      const sources = result.sources.length
        ? `\n\n[参照: ${result.sources.join(", ")}]`
        : "";
      const summaryBlock = result.summary ? `(要約)\n${result.summary}\n\n---\n\n` : "";
      new MailComposeModal(this.app, this.plugin, {
        mode: "reply",
        to: f.to,
        subject: f.subject,
        threadId: f.threadId,
        inReplyTo: f.inReplyTo,
        references: f.references,
        bodyText: result.replyDraft + sources,
      }).open();
      void summaryBlock; // 要約は将来 detail ペインにも表示可能
    } catch (e) {
      notice.hide();
      new Notice(`AI返信失敗: ${(e as Error).message}`);
    }
  }
```

> 注: `new Notice(msg, 0)` は自動で消えない通知。処理完了後に `notice.hide()` する。`Notice` の `hide()` は Obsidian API に存在する。

- [ ] **Step 2: ビルド確認**

Run: `npm run build`
Expected: 成功。`npx vitest run` グリーン。

- [ ] **Step 3: コミット**

```bash
git add src/core/MailView.ts
git commit -m "feat(mail): wire AI reply button in MailView"
```

---

# Phase 4 — フル拡張（検索 / ラベル / 添付）

## Task 15: 検索クエリ UI（MailView 上部の検索ボックス）

**Files:**
- Modify: `src/adapters/gmail.ts`
- Modify: `src/core/MailView.ts`
- Test: `tests/gmailQuery.test.ts`

- [ ] **Step 1: 失敗するテストを書く（クエリ合成の純ロジック）**

`tests/gmailQuery.test.ts`:

```ts
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
```

- [ ] **Step 2: テストが落ちることを確認**

Run: `npx vitest run tests/gmailQuery.test.ts`
Expected: FAIL — `composeQuery is not a function`

- [ ] **Step 3: 実装（gmail.ts に追記）**

```ts
// ---------- query compose (pure) ----------

export function composeQuery(base: string, term: string, label?: string): string {
  const parts: string[] = [];
  if (base.trim()) parts.push(base.trim());
  if (label && label.trim()) parts.push(`label:${label.trim()}`);
  if (term.trim()) parts.push(term.trim());
  return parts.join(" ") || "in:inbox";
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run tests/gmailQuery.test.ts`
Expected: PASS

- [ ] **Step 5: MailView に検索ボックスを追加**

`src/core/MailView.ts` の import に `composeQuery, listLabels, type GmailLabel` を追加。

`onOpen()` のツールバー作成部分に検索入力を追加（`composeBtn` の後）:

```ts
    const searchInput = toolbar.createEl("input", {
      type: "text",
      cls: "nd-mail-search",
      attr: { placeholder: "🔍 検索（Enterで実行）" },
    });
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        this.searchTerm = searchInput.value;
        void this.refresh();
      }
    });
```

フィールドを追加:

```ts
  private searchTerm = "";
  private labelFilter = "";
```

`refresh()` 内、`listThreads(this.oauth, this.config.query, ...)` の第2引数を合成クエリに置換:

```ts
      const q = composeQuery(this.config.query, this.searchTerm, this.labelFilter);
      const threads = await listThreads(this.oauth, q, this.config.maxItems);
```

- [ ] **Step 6: ビルド確認**

Run: `npm run build && npx vitest run`
Expected: 成功・グリーン。

- [ ] **Step 7: コミット**

```bash
git add src/adapters/gmail.ts src/core/MailView.ts tests/gmailQuery.test.ts
git commit -m "feat(mail): search box and query composition"
```

---

## Task 16: ラベル絞り込み + アーカイブ/trash アクション

**Files:**
- Modify: `src/core/MailView.ts`

- [ ] **Step 1: ラベルフィルタのドロップダウンを追加**

`src/core/MailView.ts` の `onOpen()` の `await this.refresh();` の前に、ラベル取得とドロップダウン生成を追加:

```ts
    const labelSelect = toolbar.createEl("select", { cls: "nd-mail-label-filter" });
    labelSelect.createEl("option", { text: "全ラベル", value: "" });
    try {
      const labels = await listLabels(this.oauth);
      for (const l of labels.filter((x) => x.type === "user")) {
        labelSelect.createEl("option", { text: l.name, value: l.name });
      }
    } catch {
      /* ラベル取得失敗は無視（フィルタ無しで継続） */
    }
    labelSelect.addEventListener("change", () => {
      this.labelFilter = labelSelect.value;
      void this.refresh();
    });
```

- [ ] **Step 2: スレッド本文にアーカイブ/trash アクションを追加**

`renderThread()` のアクション行（`actions` div、AI返信ボタンの後）に追加:

```ts
      const archiveBtn = actions.createEl("button", { text: "🗄 アーカイブ" });
      archiveBtn.addEventListener("click", async () => {
        try {
          await modifyMessageLabels(this.oauth, m.id, [], ["INBOX"]);
          new Notice("アーカイブしました");
          void this.refresh();
        } catch (e) {
          new Notice(`失敗: ${(e as Error).message}`);
        }
      });
      const trashBtn = actions.createEl("button", { text: "🗑 ゴミ箱" });
      trashBtn.addEventListener("click", async () => {
        try {
          await trashMessage(this.oauth, m.id);
          new Notice("ゴミ箱へ移動しました");
          void this.refresh();
        } catch (e) {
          new Notice(`失敗: ${(e as Error).message}`);
        }
      });
```

import に `trashMessage` を追加（`src/adapters/gmail` の import 文に）。

- [ ] **Step 3: ビルド確認**

Run: `npm run build && npx vitest run`
Expected: 成功・グリーン。

- [ ] **Step 4: コミット**

```bash
git add src/core/MailView.ts
git commit -m "feat(mail): label filter, archive, and trash actions"
```

---

## Task 17: 添付の閲覧（ダウンロード）と作成時の添付

**Files:**
- Modify: `src/core/MailView.ts`
- Modify: `src/ui/MailComposeModal.ts`

- [ ] **Step 1: 受信メールの添付をダウンロード可能にする**

`src/core/MailView.ts` の import に `getAttachment` を追加。

`renderThread()` の添付表示部分（Task6 の `if (m.attachments.length > 0)` ブロック）を、ファイルごとにダウンロードボタンを出す形に置換:

```ts
      if (m.attachments.length > 0) {
        const att = card.createDiv({ cls: "nd-mail-attachments" });
        att.createEl("span", { cls: "nd-muted", text: "📎 添付: " });
        for (const a of m.attachments) {
          const b = att.createEl("button", { text: `${a.filename} (${Math.round(a.size / 1024)}KB)` });
          b.addEventListener("click", async () => {
            try {
              const bytes = await getAttachment(this.oauth, m.id, a.attachmentId);
              const blob = new Blob([bytes], { type: a.mimeType });
              const url = URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.href = url;
              link.download = a.filename;
              link.click();
              URL.revokeObjectURL(url);
            } catch (e) {
              new Notice(`添付取得失敗: ${(e as Error).message}`);
            }
          });
        }
      }
```

- [ ] **Step 2: 作成モーダルに添付追加 UI**

`src/ui/MailComposeModal.ts` の import に `type DraftAttachment` を追加（`DraftInput` と同じ行）。

`onOpen()` 内、`bodyInput` 作成の後にファイル選択を追加:

```ts
    const attachments: DraftAttachment[] = [];
    const attRow = contentEl.createDiv({ cls: "nd-mail-compose-attrow" });
    const fileInput = attRow.createEl("input", { type: "file", attr: { multiple: "true" } });
    const attList = attRow.createDiv({ cls: "nd-muted" });
    fileInput.addEventListener("change", async () => {
      attachments.length = 0;
      const files = Array.from(fileInput.files ?? []);
      for (const file of files) {
        const buf = new Uint8Array(await file.arrayBuffer());
        attachments.push({ filename: file.name, mimeType: file.type || "application/octet-stream", data: buf });
      }
      attList.setText(attachments.length ? `📎 ${attachments.map((a) => a.filename).join(", ")}` : "");
    });
```

`send` クリックハンドラ内、`DraftInput` を作る箇所に `attachments` を追加:

```ts
        const input: DraftInput = {
          to: toInput.value.trim(),
          cc: ccInput.value.trim() || undefined,
          subject: subjectInput.value.trim(),
          bodyText: bodyInput.value,
          threadId: this.opts.threadId,
          inReplyTo: this.opts.inReplyTo,
          references: this.opts.references,
          attachments: attachments.length ? attachments : undefined,
        };
```

- [ ] **Step 3: ビルド確認**

Run: `npm run build && npx vitest run`
Expected: 成功・グリーン。

- [ ] **Step 4: コミット**

```bash
git add src/core/MailView.ts src/ui/MailComposeModal.ts
git commit -m "feat(mail): attachment download and compose attachments"
```

---

## Task 18: 設定タブに Gmail セクション + スタイル

**Files:**
- Modify: `src/ui/SyncSettingsTab.ts`
- Modify: `styles.css`

- [ ] **Step 1: 設定タブに Gmail セクションを追加**

`src/ui/SyncSettingsTab.ts` の import に追加:

```ts
import { loadMailConfig, saveMailConfig } from "../core/mailConfig";
```

`display()` の `await this.renderManualSyncSection(containerEl);` の後に追加:

```ts
    await this.renderMailSection(containerEl);
```

メソッドを追加:

```ts
  private async renderMailSection(parent: HTMLElement): Promise<void> {
    const section = parent.createDiv();
    section.createEl("h3", { text: "メール (Gmail)" });
    const cfg = await loadMailConfig(this.plugin);

    new Setting(section)
      .setName("受信クエリ")
      .setDesc("一覧の既定の絞り込み。例: in:inbox / is:unread")
      .addText((t) => {
        t.setValue(cfg.query);
        t.onChange(async (v) => {
          cfg.query = v.trim() || "in:inbox";
          await saveMailConfig(this.plugin, cfg);
        });
      });

    new Setting(section)
      .setName("表示件数")
      .addText((t) =>
        t.setValue(String(cfg.maxItems)).onChange(async (v) => {
          const n = parseInt(v, 10);
          if (!isNaN(n) && n > 0) {
            cfg.maxItems = n;
            await saveMailConfig(this.plugin, cfg);
          }
        })
      );

    new Setting(section)
      .setName("AIバックエンド")
      .setDesc("claude-code = `claude -p`（サブスク・APIキー不要）/ api = Anthropic API")
      .addDropdown((d) =>
        d
          .addOption("claude-code", "claude -p")
          .addOption("api", "Anthropic API")
          .setValue(cfg.backend)
          .onChange(async (v) => {
            cfg.backend = v as typeof cfg.backend;
            await saveMailConfig(this.plugin, cfg);
          })
      );

    new Setting(section)
      .setName("AI返信の参照フォルダ (カンマ区切り)")
      .setDesc("返信ドラフト生成時に過去背景として参照する vault フォルダ。例: 議事録, ナレッジ")
      .addText((t) => {
        t.setValue(cfg.ragFolders.join(", "));
        t.inputEl.style.width = "100%";
        t.onChange(async (v) => {
          cfg.ragFolders = v.split(",").map((s) => s.trim()).filter(Boolean);
          await saveMailConfig(this.plugin, cfg);
        });
      });
  }
```

- [ ] **Step 2: styles.css に最小限のスタイルを追加**

`styles.css` の末尾に追加:

```css
/* ---- Mail viewer ---- */
.nd-mail-view .nd-mail-toolbar { display: flex; gap: 8px; align-items: center; padding: 8px; border-bottom: 1px solid var(--background-modifier-border); }
.nd-mail-view .nd-mail-search { flex: 1; }
.nd-mail-body { display: flex; height: calc(100% - 44px); }
.nd-mail-list { width: 38%; overflow-y: auto; border-right: 1px solid var(--background-modifier-border); }
.nd-mail-detail { flex: 1; overflow-y: auto; padding: 12px; }
.nd-mail-row { padding: 8px 10px; cursor: pointer; border-bottom: 1px solid var(--background-modifier-border); }
.nd-mail-row:hover { background: var(--background-modifier-hover); }
.nd-mail-row.nd-mail-unread .nd-mail-subject { font-weight: 700; }
.nd-mail-from { font-size: 0.85em; color: var(--text-muted); }
.nd-mail-subject { font-size: 0.95em; }
.nd-mail-snippet { font-size: 0.8em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.nd-mail-msg { border: 1px solid var(--background-modifier-border); border-radius: 8px; padding: 10px; margin-bottom: 10px; }
.nd-mail-msg-body { white-space: pre-wrap; word-break: break-word; font-family: inherit; }
.nd-mail-msg-actions { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
.nd-mail-compose-row { display: flex; gap: 8px; align-items: center; margin-bottom: 6px; }
.nd-mail-compose-label { width: 48px; color: var(--text-muted); }
.nd-mail-compose-input { flex: 1; }
.nd-mail-compose-body { width: 100%; }
.nd-widget-mail .nd-mail-widget-list { list-style: none; margin: 0; padding: 0; }
.nd-widget-mail .nd-mail-widget-item { padding: 4px 6px; cursor: pointer; border-bottom: 1px solid var(--background-modifier-border); }
.nd-widget-mail .nd-mail-widget-item:hover { background: var(--background-modifier-hover); }
.nd-widget-mail .nd-mail-unread .nd-mail-subject { font-weight: 700; }
```

- [ ] **Step 3: ビルド確認**

Run: `npm run build && npx vitest run`
Expected: 成功・グリーン。

- [ ] **Step 4: コミット**

```bash
git add src/ui/SyncSettingsTab.ts styles.css
git commit -m "feat(mail): settings section and styles"
```

---

# Self-Review

**1. Spec coverage（spec の各節 → 対応タスク）:**
- §3.1 モジュール構成 → 全タスクで網羅（gmail.ts: 3-5,8-10,15 / mailConfig: 2 / MailView: 6,11,14,15,16,17 / MailWidget: 7 / MailComposeModal: 11,17 / vaultRetrieval: 12 / mailAssist: 13 / settings: 18）
- §4.1 確認 → Task 6 / §4.2 作成 → Task 11 / §4.3 返信AI → Task 13,14 / §4.4 ハイブリッド遷移 → Task 7,10(openThread)
- §5 認証スコープ → Task 1 / §6 エラー処理・未認証ゲート → Task 6,7（`hasScope`）/ §7 テスト → 各純ロジックタスクにユニットテストあり
- §8 フェーズ → Phase 1〜4 と一致 / §9 スコープ外（直接 send / ノート化）→ 計画に含めず（遵守）

**2. Placeholder scan:** TODO/TBD/「適切に処理」等なし。各コードステップに完全なコードを記載。✔

**3. Type consistency 確認:**
- `DraftInput` は Task 8 で定義 → Task 9,11,17 で一貫使用。`DraftAttachment` Task 8 定義 → Task 17 使用。✔
- `GmailMessage`/`GmailThread`/`GmailThreadSummary`/`GmailLabel` Task 4 定義 → 以降一貫。✔
- `MailConfig` Task 2 定義 → MailView/mailAssist/settings で使用。`backend`/`claudeCmd`/`model`/`ragFolders` 名称一致。✔
- `selectCandidates(app, query, opts)` Task 12 定義 → mailAssist(Task13) と AISearch で同一シグネチャ。✔
- `modifyMessageLabels(oauth, id, add, remove)` Task 5 定義 → MailView(Task6 既読化, Task16 アーカイブ)で一致。✔
- `buildReplyFields`/`quoteForReply` Task 10 定義 → MailView(Task11,14)使用。✔
- `composeQuery`/`listThreads`/`getThread`/`getAttachment`/`trashMessage`/`createDraft`/`getProfile`/`gmailDraftUrl`/`gmailDraftsListUrl` すべて定義タスクと使用タスクで名称一致。✔

**留意点（実装時の既知リスク）:**
- 下書きディープリンク `#drafts/<messageId>` は非公式。開かない場合は Task11 のフォールバック（`gmailDraftsListUrl`）が効く。messageId が空なら自動でフォールバック。
- `listThreads` は N+1 リクエスト。`maxItems` 既定 25 で許容。重ければ将来 batch 化。
- `Notice` の第2引数 `0`（消えない通知）と `hide()` は Obsidian の API。型が見つからない場合は `new Notice(msg)` + 完了時 `new Notice("完了")` に変更可。
