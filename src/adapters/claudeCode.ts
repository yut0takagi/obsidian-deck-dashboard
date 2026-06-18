import { Platform } from "obsidian";

export interface ClaudeCodeResponse {
  text: string;
}

/**
 * Run `claude -p` via a login bash shell so user's PATH (incl. ~/.claude/local) is loaded.
 * Sends the prompt via stdin to avoid arg length limits.
 *
 * @param prompt full prompt text
 * @param claudeCmd command name or absolute path (default: "claude")
 * @param extraArgs e.g. ["--output-format", "text"]
 */
export async function runClaudeP(
  prompt: string,
  claudeCmd = "claude",
  extraArgs: string[] = []
): Promise<ClaudeCodeResponse> {
  if (!Platform.isDesktop) {
    throw new Error("claude -p はデスクトップ版のみ対応です。");
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires -- child_process is desktop-only; lazy require keeps it out of the mobile bundle
  const { spawn } = require("child_process") as typeof import("child_process");

  const cmd = [claudeCmd, "-p", ...extraArgs].map(shellQuote).join(" ");
  // -lc ensures interactive shell init files run (so claude alias / PATH resolves)
  const child = spawn("/bin/bash", ["-lc", cmd], {
    env: process.env,
  });

  return await new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("claude -p タイムアウト (120秒)"));
    }, 120_000);
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString("utf-8")));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString("utf-8")));
    child.on("error", (e: Error) => {
      clearTimeout(timer);
      reject(new Error(`spawn失敗: ${e.message}`));
    });
    child.on("close", (code: number | null) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(
          new Error(
            `claude exited code=${code}\nstderr: ${stderr.trim() || "(なし)"}\nstdout: ${stdout.slice(0, 200)}`
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
      clearTimeout(timer);
      reject(e);
    }
  });
}

function shellQuote(s: string): string {
  if (/^[A-Za-z0-9_\-./]+$/.test(s)) return s;
  return "'" + s.replace(/'/g, "'\\''") + "'";
}
