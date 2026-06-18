import { requestUrl } from "obsidian";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

const ENDPOINT = "https://api.anthropic.com/v1/messages";

interface AnthropicContentBlock {
  type: string;
  text?: string;
}

interface AnthropicResponse {
  content?: AnthropicContentBlock[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

export async function chat(
  apiKey: string,
  model: string,
  system: string,
  messages: ChatMessage[],
  maxTokens = 1024
): Promise<ChatResponse> {
  const res = await requestUrl({
    url: ENDPOINT,
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages,
    }),
    throw: false,
  });
  if (res.status >= 400) {
    throw new Error(`Anthropic API HTTP ${res.status}: ${truncate(res.text, 300)}`);
  }
  const j = res.json as AnthropicResponse;
  const text = (j.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("\n");
  return {
    text,
    inputTokens: j.usage?.input_tokens ?? 0,
    outputTokens: j.usage?.output_tokens ?? 0,
  };
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}
