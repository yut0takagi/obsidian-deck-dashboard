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

// NOTE: email bodies are untrusted (attacker-controlled) and are concatenated into the
// prompt below. This is acceptable ONLY because the output is a DRAFT that a human
// reviews and manually sends via the Gmail web UI — there is no autonomous send. Do not
// reuse this prompt path for any future auto-send feature without sanitizing input and
// hardening against delimiter/instruction injection.
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
