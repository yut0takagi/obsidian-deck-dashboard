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
