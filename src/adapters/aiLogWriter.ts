import { App, TFile, normalizePath } from "obsidian";
import type { StreamEvent } from "./claudeCodeStream";

/**
 * Writes an AI delegation run to its own markdown file in real-time,
 * so the session is observable even after the modal is closed.
 */
export class AILogWriter {
  private constructor(public app: App, public path: string) {}

  static async create(app: App, taskBasename: string): Promise<AILogWriter> {
    const ts = formatStamp(new Date());
    const folder = normalizePath("ログ/AI移譲");
    await ensureFolder(app, folder);
    const path = `${folder}/${ts}_${safeName(taskBasename)}.md`;
    return new AILogWriter(app, path);
  }

  async init(opts: {
    taskPath: string;
    permissionMode: string;
    prompt: string;
  }): Promise<void> {
    const lines = [
      "---",
      `task: "[[${opts.taskPath}]]"`,
      `started: ${formatDateTime(new Date())}`,
      `permission_mode: ${opts.permissionMode}`,
      `status: running`,
      "---",
      "",
      "# AI移譲ログ",
      "",
      `- **タスク**: [[${opts.taskPath}]]`,
      `- **モード**: \`${opts.permissionMode}\``,
      "",
      "## 指示",
      "",
      "```",
      opts.prompt,
      "```",
      "",
      "## 実行トレース",
      "",
    ];
    await this.app.vault.adapter.write(this.path, lines.join("\n"));
  }

  private async append(s: string): Promise<void> {
    try {
      await this.app.vault.adapter.append(this.path, s);
    } catch {
      // best-effort logging — never throw into the stream pipeline
    }
  }

  async logEvent(e: StreamEvent): Promise<void> {
    const ts = new Date().toLocaleTimeString();
    let line = "";
    if (e.kind === "system") {
      line = `- \`${ts}\` 🟢 ${oneline(e.text)}\n`;
    } else if (e.kind === "text") {
      const quoted = (e.text ?? "").replace(/\n/g, "\n> ");
      line = `\n> **${ts}** assistant\n>\n> ${quoted}\n\n`;
    } else if (e.kind === "tool_use") {
      line = `- \`${ts}\` 🔧 ${oneline(e.text)}\n`;
    } else if (e.kind === "tool_result") {
      line = `  - ${e.isError ? "❌" : "✓"} ${oneline(e.text)}\n`;
    } else if (e.kind === "result") {
      line = `\n### ✅ 結果\n\n${e.text ?? ""}\n\n`;
    } else if (e.kind === "stderr") {
      line = `- \`${ts}\` ⚠️ stderr: ${oneline(e.text)}\n`;
    } else if (e.kind === "error") {
      line = `\n### ❌ エラー\n\n${e.text ?? ""}\n\n`;
    }
    if (line) await this.append(line);
  }

  async finalize(opts: {
    ok: boolean;
    cancelled?: boolean;
    durationMs: number;
    toolCount: number;
  }): Promise<void> {
    const sec = (opts.durationMs / 1000).toFixed(1);
    const tag = opts.cancelled ? "🛑 中止" : opts.ok ? "✅ 成功" : "❌ 失敗";
    const footer = [
      "",
      "---",
      "",
      `**結果**: ${tag} / **所要時間**: ${sec}s / **ツール呼出**: ${opts.toolCount} / **終了**: ${formatDateTime(new Date())}`,
      "",
    ].join("\n");
    await this.append(footer);

    const file = this.app.vault.getAbstractFileByPath(this.path);
    if (file instanceof TFile) {
      try {
        await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
          fm.status = opts.cancelled ? "cancelled" : opts.ok ? "completed" : "error";
          fm.ended = formatDateTime(new Date());
          fm.duration_sec = Math.round(opts.durationMs / 1000);
          fm.tool_count = opts.toolCount;
        });
      } catch {
        /* ignore */
      }
    }
  }
}

async function ensureFolder(app: App, path: string): Promise<void> {
  const parts = path.split("/").filter(Boolean);
  let acc = "";
  for (const p of parts) {
    acc = acc ? `${acc}/${p}` : p;
    if (!app.vault.getAbstractFileByPath(acc)) {
      await app.vault.createFolder(acc);
    }
  }
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function formatStamp(d: Date): string {
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
  );
}

function formatDateTime(d: Date): string {
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

function safeName(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, "_").slice(0, 60);
}

function oneline(s: string | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}
