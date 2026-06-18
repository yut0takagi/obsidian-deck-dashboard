import { Platform } from "obsidian";

// `Buffer` is a desktop-only Node global; this alias keeps stdout/stderr chunk
// types accurate without referencing the global at each call site.
// eslint-disable-next-line no-undef -- desktop-only Node `Buffer` global (typed via @types/node)
type NodeBytes = Buffer;

export type StreamEventKind =
  | "system"
  | "text"
  | "tool_use"
  | "tool_result"
  | "result"
  | "stderr"
  | "error";

export interface StreamEvent {
  kind: StreamEventKind;
  text?: string;
  toolName?: string;
  toolInput?: unknown;
  isError?: boolean;
  raw?: unknown;
}

export interface ClaudeStreamSession {
  /** kill the underlying child process */
  cancel: () => void;
  /** resolves when the process exits */
  done: Promise<{ ok: boolean; finalText: string; code: number | null }>;
}

/** Tool-input fields read by {@link formatToolUse} (claude CLI tool args). */
interface ToolInput {
  file_path?: string;
  command?: string;
  pattern?: string;
  todos?: unknown[];
}

/** A single content block inside an assistant/user message. */
interface ContentBlock {
  type?: string;
  text?: string;
  name?: string;
  input?: ToolInput;
  is_error?: boolean;
  content?: unknown;
}

/** One NDJSON event emitted by `claude --output-format stream-json`. */
interface StreamJsonEvent {
  type?: string;
  subtype?: string;
  session_id?: string;
  message?: { content?: ContentBlock[] };
  result?: unknown;
  is_error?: boolean;
}

/**
 * Spawn `claude -p` with streaming JSON output. The user retains tool access
 * (Read/Edit/Bash etc.). Permission mode is configurable; default
 * `acceptEdits` skips per-edit confirmation prompts but still asks for
 * destructive actions. Use `bypassPermissions` only when fully trusted.
 */
export function runClaudeStream(opts: {
  prompt: string;
  cwd: string;
  claudeCmd?: string;
  permissionMode?: "acceptEdits" | "bypassPermissions" | "default";
  onEvent: (e: StreamEvent) => void;
  timeoutMs?: number;
}): ClaudeStreamSession {
  if (!Platform.isDesktop) {
    throw new Error("claude streaming はデスクトップ版のみ対応です。");
  }
  const {
    prompt,
    cwd,
    claudeCmd = "claude",
    permissionMode = "acceptEdits",
    onEvent,
    timeoutMs = 30 * 60_000,
  } = opts;

  // eslint-disable-next-line @typescript-eslint/no-require-imports, no-undef -- child_process is desktop-only; lazy require keeps it out of the mobile bundle
  const { spawn } = require("child_process") as typeof import("child_process");

  const args = [
    claudeCmd,
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--permission-mode",
    permissionMode,
  ]
    .map(shellQuote)
    .join(" ");

  const child = spawn("/bin/bash", ["-lc", args], {
    // eslint-disable-next-line no-undef -- `process` is a desktop-only Node global, reached only after the Platform.isDesktop guard
    env: process.env,
    cwd,
  });

  let cancelled = false;
  let finalText = "";
  let stderrBuf = "";
  let stdoutBuf = "";

  const timer: number = window.setTimeout(() => {
    onEvent({ kind: "error", text: `タイムアウト (${Math.round(timeoutMs / 60000)}分)` });
    try {
      child.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  }, timeoutMs);

  const done = new Promise<{ ok: boolean; finalText: string; code: number | null }>(
    (resolve) => {
      child.stdout.on("data", (d: NodeBytes) => {
        stdoutBuf += d.toString("utf-8");
        let nl: number;
        while ((nl = stdoutBuf.indexOf("\n")) >= 0) {
          const line = stdoutBuf.slice(0, nl).trim();
          stdoutBuf = stdoutBuf.slice(nl + 1);
          if (line) handleLine(line);
        }
      });
      child.stderr.on("data", (d: NodeBytes) => {
        const s = d.toString("utf-8");
        stderrBuf += s;
        onEvent({ kind: "stderr", text: s });
      });
      child.on("error", (e: Error) => {
        window.clearTimeout(timer);
        onEvent({ kind: "error", text: `spawn失敗: ${e.message}` });
        resolve({ ok: false, finalText, code: null });
      });
      child.on("close", (code: number | null) => {
        window.clearTimeout(timer);
        // flush remaining stdout
        if (stdoutBuf.trim()) handleLine(stdoutBuf.trim());
        const ok = !cancelled && code === 0;
        if (!ok && !cancelled && code !== 0) {
          onEvent({
            kind: "error",
            text: `claude exit code=${code}${stderrBuf ? "\nstderr: " + stderrBuf.slice(-500) : ""}`,
          });
        }
        resolve({ ok, finalText, code });
      });

      try {
        child.stdin.write(prompt);
        child.stdin.end();
      } catch (e) {
        window.clearTimeout(timer);
        onEvent({ kind: "error", text: `stdin書込失敗: ${e instanceof Error ? e.message : String(e)}` });
        resolve({ ok: false, finalText, code: null });
      }
    }
  );

  function handleLine(line: string): void {
    let obj: StreamJsonEvent;
    try {
      obj = JSON.parse(line) as StreamJsonEvent;
    } catch {
      onEvent({ kind: "stderr", text: line });
      return;
    }
    const t = obj.type;
    if (t === "system") {
      onEvent({
        kind: "system",
        text: obj.subtype ? `[${obj.subtype}] session=${obj.session_id ?? "?"}` : "[system]",
        raw: obj,
      });
      return;
    }
    if (t === "assistant" && obj.message?.content) {
      for (const c of obj.message.content) {
        if (c.type === "text") {
          onEvent({ kind: "text", text: c.text });
        } else if (c.type === "tool_use") {
          onEvent({
            kind: "tool_use",
            toolName: c.name,
            toolInput: c.input,
            text: formatToolUse(c.name ?? "", c.input),
          });
        }
      }
      return;
    }
    if (t === "user" && obj.message?.content) {
      for (const c of obj.message.content) {
        if (c.type === "tool_result") {
          const ok = !c.is_error;
          onEvent({
            kind: "tool_result",
            isError: !ok,
            text: ok ? "✓" : `✗ ${typeof c.content === "string" ? c.content.slice(0, 200) : "error"}`,
            raw: c,
          });
        }
      }
      return;
    }
    if (t === "result") {
      if (typeof obj.result === "string") finalText = obj.result;
      onEvent({
        kind: "result",
        isError: !!obj.is_error,
        text: typeof obj.result === "string" ? obj.result : `(${obj.subtype ?? "done"})`,
        raw: obj,
      });
      return;
    }
    onEvent({ kind: "stderr", text: `unknown: ${line.slice(0, 200)}` });
  }

  return {
    cancel: () => {
      cancelled = true;
      try {
        child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
    },
    done,
  };
}

function formatToolUse(name: string, input: ToolInput | undefined): string {
  if (!input) return name;
  if (name === "Read" && input.file_path) return `Read ${input.file_path}`;
  if (name === "Edit" && input.file_path) return `Edit ${input.file_path}`;
  if (name === "Write" && input.file_path) return `Write ${input.file_path}`;
  if (name === "Bash" && input.command) {
    const cmd = input.command.slice(0, 120);
    return `Bash: ${cmd}`;
  }
  if (name === "Grep" && input.pattern) return `Grep ${input.pattern}`;
  if (name === "Glob" && input.pattern) return `Glob ${input.pattern}`;
  if (name === "TodoWrite") return `TodoWrite (${(input.todos ?? []).length} items)`;
  const keys = Object.keys(input).slice(0, 3).join(", ");
  return `${name} (${keys})`;
}

function shellQuote(s: string): string {
  if (/^[A-Za-z0-9_\-./]+$/.test(s)) return s;
  return "'" + s.replace(/'/g, "'\\''") + "'";
}
