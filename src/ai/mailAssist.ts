import type { App, Plugin } from "obsidian";
import { chat } from "../adapters/anthropic";
import { runClaudeP } from "../adapters/claudeCode";
import { selectCandidates, type Candidate } from "../core/vaultRetrieval";
import { searchExcludes, settingsOf } from "../core/settings";
import { SecretStore } from "../core/secrets";
import { requireClaudeCommand } from "./claudeCommandGuard";
import type { GmailThread } from "../adapters/gmail";
import type { MailConfig } from "../core/mailConfig";
import { t } from "../core/i18n";

export type { GmailThread };

export interface AssistResult {
  summary: string;
  replyDraft: string;
  sources: string[];
}

const DELIM = t().mailAssistReplyDraft;
// The model is asked for the marker of the current language; accept either, so a reply
// generated before a language switch still splits.
const DELIMS = ["=== REPLY DRAFT ===", "=== 返信ドラフト ==="];

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
    : t().mailAssistNoRelevantBackgroundNotesFound;
  return (
    t().mailAssistYouAreABusinessEmail +
    t().mailAssistWrite1ASummaryOf +
    t().mailAssistBaseTheReplyOnThe +
    t().mailAssistOutputFormatSummaryBulletsReply(DELIM) +
    t().mailAssistEmailThread +
    buildThreadText(thread) +
    t().mailAssistRelatedVaultNotes +
    ragBlock
  );
}

function parseAssistOutput(raw: string): { summary: string; replyDraft: string } {
  const delim = DELIMS.find((d) => raw.includes(d)) ?? DELIM;
  const idx = raw.indexOf(delim);
  if (idx < 0) return { summary: "", replyDraft: raw.trim() };
  const summary = raw.slice(0, idx).replace(/^##\s*(要約|Summary)\s*/m, "").trim();
  const replyDraft = raw.slice(idx + delim.length).trim();
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
    excludeFolders: searchExcludes(settingsOf(plugin)),
  });
  const prompt = buildPrompt(thread, candidates);

  let raw: string;
  if (config.backend === "claude-code") {
    raw = (await runClaudeP(prompt, requireClaudeCommand(settingsOf(plugin)))).text;
  } else {
    const apiKey = await new SecretStore(plugin).get<string>("anthropic_api_key");
    if (!apiKey) throw new Error(t().mailAssistAnthropicApiKeyIsNot);
    raw = (await chat(apiKey, config.model, "", [{ role: "user", content: prompt }], 1500)).text;
  }
  const { summary, replyDraft } = parseAssistOutput(raw);
  return { summary, replyDraft, sources: candidates.map((c) => c.path) };
}

export const __test = { buildThreadText, buildRagQuery, buildPrompt, parseAssistOutput };
