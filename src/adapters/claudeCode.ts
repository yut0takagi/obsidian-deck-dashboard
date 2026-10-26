import { Platform } from "obsidian";
import { t } from "../core/i18n";

export interface ClaudeCodeResponse {
  text: string;
}

// `Buffer` is a desktop-only Node global; this alias keeps stdout/stderr chunk
// types accurate without referencing the global at each call site.
// eslint-disable-next-line no-undef -- desktop-only Node `Buffer` global (typed via @types/node)
type NodeBytes = Buffer;

/**
 * Run `claude -p` via a login bash shell so user's PATH (incl. ~/.claude/local) is loaded.
 * Sends the prompt via stdin to avoid arg length limits.
 *
 * @param prompt full prompt text
 * @param claudeCmd validated command from Settings → Deck (see ai/claudeCommandGuard)
 * @param extraArgs e.g. ["--output-format", "text"]
 */
export async function runClaudeP(
  prompt: string,
  claudeCmd: string,
  extraArgs: string[] = []
): Promise<ClaudeCodeResponse> {
  if (!Platform.isDesktop) {
    throw new Error(t().claudeCodeClaudePIsOnlySupported);
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports, no-undef -- child_process is desktop-only; lazy require keeps it out of the mobile bundle
  const { spawn } = require("child_process") as typeof import("child_process");

  const cmd = [claudeCmd, "-p", ...extraArgs].map(shellQuote).join(" ");
  // -lc ensures interactive shell init files run (so claude alias / PATH resolves)
  const child = spawn("/bin/bash", ["-lc", cmd], {
    // eslint-disable-next-line no-undef -- `process` is a desktop-only Node global, reached only after the Platform.isDesktop guard
    env: process.env,
  });

  return await new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const timer: number = window.setTimeout(() => {
      child.kill();
      reject(new Error(t().claudeCodeClaudePTimedOut120));
    }, 120_000);
    child.stdout.on("data", (d: NodeBytes) => (stdout += d.toString("utf-8")));
    child.stderr.on("data", (d: NodeBytes) => (stderr += d.toString("utf-8")));
    child.on("error", (e: Error) => {
      window.clearTimeout(timer);
      reject(new Error(t().claudeCodeFailedToStartProcess(e.message)));
    });
    child.on("close", (code: number | null) => {
      window.clearTimeout(timer);
      if (code !== 0) {
        reject(
          new Error(
            t().claudeCodeClaudeExitedCodeStderrStdout(code, stderr.trim() || t().noneLabel, stdout.slice(0, 200))
          )
        );
        return;
      }
      resolve({ text: stdout });
    });
    try {
      child.stdin.write(prompt);
      child.stdin.end();
    } catch (e) {
      window.clearTimeout(timer);
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

function shellQuote(s: string): string {
  if (/^[A-Za-z0-9_\-./]+$/.test(s)) return s;
  return "'" + s.replace(/'/g, "'\\''") + "'";
}
