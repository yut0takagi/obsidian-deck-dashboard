import { Notice, Setting, TFile } from "obsidian";
import type { WidgetDefinition, WidgetContext } from "./types";
import { AIDelegationModal } from "../ui/AIDelegationModal";

const AI_DELEGATE_COLUMN = "AI移譲";

interface Settings {
  folder: string;
  statusField: string;
  columns: string[];
  showFields: string[];
  hideCompleted: boolean;
}

interface TaskItem {
  file: TFile;
  title: string;
  fields: Record<string, string>;
  status: string;
}

export const kanbanWidget: WidgetDefinition<Settings> = {
  type: "kanban",
  label: "Kanban (タスク)",
  description:
    "フォルダ内のノートを frontmatter のステータス列でカンバン表示。カードをドラッグして状態変更。",
  defaultSettings: () => ({
    folder: "タスク/詳細",
    statusField: "status",
    columns: ["未着手", "作業中", "レビュー待ち", "完了"],
    showFields: ["PJT", "期限", "優先度"],
    hideCompleted: false,
  }),
  async render(el, settings, ctx) {
    await renderKanban(el, settings, ctx);
  },
  renderSettingsForm(container, settings, onChange) {
    new Setting(container)
      .setName("ソースフォルダ")
      .setDesc("frontmatterにstatusを持つノートが置かれているフォルダ")
      .addText((t) =>
        t.setValue(settings.folder).onChange((v) =>
          onChange({ ...settings, folder: v.trim() || "タスク/詳細" })
        )
      );
    new Setting(container)
      .setName("ステータスのfrontmatterキー名")
      .addText((t) =>
        t
          .setValue(settings.statusField)
          .onChange((v) => onChange({ ...settings, statusField: v.trim() || "status" }))
      );
    new Setting(container)
      .setName("列 (カンマ区切り)")
      .setDesc("statusに入りうる値。並び順=この順番")
      .addText((t) => {
        t.setValue(settings.columns.join(", "));
        t.inputEl.style.width = "100%";
        t.onChange((v) =>
          onChange({
            ...settings,
            columns: v
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          })
        );
      });
    new Setting(container)
      .setName("カードに表示するフィールド (カンマ区切り)")
      .setDesc("frontmatterのキー名")
      .addText((t) => {
        t.setValue(settings.showFields.join(", "));
        t.inputEl.style.width = "100%";
        t.onChange((v) =>
          onChange({
            ...settings,
            showFields: v
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          })
        );
      });
    new Setting(container)
      .setName("完了列を隠す")
      .addToggle((t) =>
        t
          .setValue(settings.hideCompleted)
          .onChange((v) => onChange({ ...settings, hideCompleted: v }))
      );
  },
};

async function renderKanban(
  el: HTMLElement,
  settings: Settings,
  ctx: WidgetContext
): Promise<void> {
  el.empty();
  el.addClass("nd-widget-kanban");

  const tasks = collectTasks(ctx.app, settings);
  const board = el.createDiv({ cls: "nd-kanban-board" });

  const cols = settings.hideCompleted
    ? settings.columns.filter((c) => c !== "完了" && c !== "done" && c !== "Done")
    : settings.columns;

  for (const col of cols) {
    const colEl = board.createDiv({ cls: "nd-kanban-col" });
    colEl.dataset.col = col;
    const colTasks = tasks.filter((t) => t.status === col);

    const head = colEl.createDiv({ cls: "nd-kanban-col-head" });
    head.createSpan({ cls: "nd-kanban-col-title", text: col });
    head.createSpan({ cls: "nd-kanban-col-count", text: String(colTasks.length) });

    const list = colEl.createDiv({ cls: "nd-kanban-cards" });

    // Column drop target
    colEl.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      colEl.addClass("nd-drag-over");
    });
    colEl.addEventListener("dragleave", (e) => {
      if (e.target === colEl) {
        colEl.removeClass("nd-drag-over");
      }
    });
    colEl.addEventListener("drop", async (e) => {
      e.preventDefault();
      colEl.removeClass("nd-drag-over");
      const path = e.dataTransfer?.getData("text/plain");
      if (!path) return;
      const f = ctx.app.vault.getAbstractFileByPath(path);
      if (!(f instanceof TFile)) {
        new Notice(`ファイルが見つかりません: ${path}`);
        return;
      }
      try {
        await ctx.app.fileManager.processFrontMatter(f, (fm: any) => {
          fm[settings.statusField] = col;
        });
        new Notice(`${f.basename} → ${col}`);
      } catch (err) {
        new Notice(`更新失敗: ${(err as Error).message}`);
        return;
      }
      // Re-render after metadataCache catches up
      setTimeout(() => {
        renderKanban(el, settings, ctx);
      }, 80);

      // AI delegate: spawn claude session for this task
      if (col === AI_DELEGATE_COLUMN) {
        const vaultRoot = (ctx.app.vault.adapter as any).getBasePath?.() as string | undefined;
        if (!vaultRoot) {
          new Notice("vaultパス取得失敗のためAI移譲をスキップ");
          return;
        }
        new AIDelegationModal({
          app: ctx.app,
          taskFile: f,
          vaultRoot,
          statusField: settings.statusField,
          successStatus: pickSuccessStatus(settings.columns),
        }).open();
      }
    });

    for (const task of colTasks) {
      renderCard(list, task, settings, ctx);
    }

    if (colTasks.length === 0) {
      list.createEl("p", { cls: "nd-empty nd-kanban-empty", text: "—" });
    }
  }

  if (tasks.length === 0) {
    el.createDiv({
      cls: "nd-empty",
      text: `フォルダ "${settings.folder}" に frontmatter "${settings.statusField}" を持つノートがありません`,
    });
  }
}

function renderCard(
  list: HTMLElement,
  task: TaskItem,
  settings: Settings,
  ctx: WidgetContext
): void {
  const card = list.createDiv({ cls: "nd-kanban-card" });
  card.setAttr("draggable", "true");
  card.dataset.path = task.file.path;

  card.addEventListener("dragstart", (e) => {
    e.dataTransfer?.setData("text/plain", task.file.path);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
    card.addClass("nd-dragging");
  });
  card.addEventListener("dragend", () => {
    card.removeClass("nd-dragging");
  });
  card.addEventListener("click", () => {
    ctx.app.workspace.getLeaf(false).openFile(task.file);
  });

  card.createDiv({ cls: "nd-kanban-card-title", text: task.title });

  const meta = card.createDiv({ cls: "nd-kanban-card-meta" });
  for (const fname of settings.showFields) {
    const v = task.fields[fname];
    if (!v) continue;
    const tag = meta.createSpan({ cls: "nd-kanban-card-tag" });
    tag.dataset.field = fname;
    tag.setText(v);
    if (fname === "優先度") {
      tag.addClass(`nd-prio-${normalizePriority(v)}`);
    }
    if (fname === "期限") {
      tag.addClass(deadlineClass(v));
    }
  }
}

function normalizePriority(p: string): string {
  const s = p.toLowerCase();
  if (/urgent|緊急/.test(s)) return "urgent";
  if (/high|高/.test(s)) return "high";
  if (/medium|中/.test(s)) return "medium";
  if (/low|低/.test(s)) return "low";
  return "other";
}

function deadlineClass(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!m) return "nd-deadline-other";
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayMs = 86400000;
  const diff = Math.round((d.getTime() - today.getTime()) / dayMs);
  if (diff < 0) return "nd-deadline-overdue";
  if (diff === 0) return "nd-deadline-today";
  if (diff <= 3) return "nd-deadline-soon";
  return "nd-deadline-other";
}

/**
 * Best-effort pick of the column to move a task to after AI delegation
 * succeeds. Prefers an existing "レビュー待ち" column; otherwise falls back
 * to the column immediately after AI移譲 in the user's config.
 */
function pickSuccessStatus(columns: string[]): string {
  const review = columns.find((c) => /レビュー|review/i.test(c));
  if (review) return review;
  const idx = columns.indexOf(AI_DELEGATE_COLUMN);
  if (idx >= 0 && idx + 1 < columns.length) return columns[idx + 1];
  return "レビュー待ち";
}

function collectTasks(app: any, settings: Settings): TaskItem[] {
  const folder = settings.folder.replace(/\/+$/, "");
  const prefix = folder + "/";
  const items: TaskItem[] = [];
  const files: TFile[] = app.vault.getMarkdownFiles();
  for (const f of files) {
    if (!f.path.startsWith(prefix)) continue;
    const cache = app.metadataCache.getFileCache(f);
    const fm = cache?.frontmatter ?? {};
    const rawStatus = fm[settings.statusField];
    if (rawStatus == null) continue;
    const fields: Record<string, string> = {};
    for (const fld of settings.showFields) {
      const v = fm[fld];
      if (v != null && v !== "") fields[fld] = String(v);
    }
    items.push({
      file: f,
      title: f.basename,
      fields,
      status: String(rawStatus),
    });
  }
  return items;
}
