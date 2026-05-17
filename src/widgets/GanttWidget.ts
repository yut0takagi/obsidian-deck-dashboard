import { Setting, TFile } from "obsidian";
import type { WidgetDefinition, WidgetContext } from "./types";

interface Settings {
  folder: string;
  deadlineField: string;
  startField: string;
  durationField: string;
  statusField: string;
  groupByField: string;
  windowDaysBack: number;
  windowDaysForward: number;
  rowHeight: number;
  dayWidth: number;
  hideCompleted: boolean;
}

interface Bar {
  file: TFile;
  title: string;
  start: Date;
  end: Date;
  pjt: string;
  status: string;
  priority: string;
}

const DAY_MS = 86400000;

export const ganttWidget: WidgetDefinition<Settings> = {
  type: "gantt",
  label: "Gantt",
  description:
    "frontmatter の期限 + 工数 から自動生成されるガントチャート。PJT別グループ化、今日線、クリックでファイル開く。",
  defaultSettings: () => ({
    folder: "タスク/詳細",
    deadlineField: "期限",
    startField: "開始",
    durationField: "工数",
    statusField: "status",
    groupByField: "PJT",
    windowDaysBack: 7,
    windowDaysForward: 30,
    rowHeight: 26,
    dayWidth: 24,
    hideCompleted: true,
  }),
  async render(el, settings, ctx) {
    await renderGantt(el, settings, ctx);
  },
  renderSettingsForm(container, settings, onChange) {
    new Setting(container)
      .setName("ソースフォルダ")
      .addText((t) =>
        t.setValue(settings.folder).onChange((v) =>
          onChange({ ...settings, folder: v.trim() || "タスク/詳細" })
        )
      );
    new Setting(container)
      .setName("期限フィールド")
      .addText((t) =>
        t.setValue(settings.deadlineField).onChange((v) =>
          onChange({ ...settings, deadlineField: v.trim() || "期限" })
        )
      );
    new Setting(container)
      .setName("開始フィールド (任意)")
      .setDesc("空ならファイル作成日 / 期限-工数 を使用")
      .addText((t) =>
        t.setValue(settings.startField).onChange((v) =>
          onChange({ ...settings, startField: v.trim() })
        )
      );
    new Setting(container)
      .setName("工数フィールド (任意)")
      .setDesc("例: 30m/1h/2h/0.5d/1d/1w → バーの長さ算出に使用")
      .addText((t) =>
        t.setValue(settings.durationField).onChange((v) =>
          onChange({ ...settings, durationField: v.trim() })
        )
      );
    new Setting(container)
      .setName("グループ化フィールド")
      .setDesc("空ならグループ化しない")
      .addText((t) =>
        t.setValue(settings.groupByField).onChange((v) =>
          onChange({ ...settings, groupByField: v.trim() })
        )
      );
    new Setting(container)
      .setName("表示期間: 今日より前 (日)")
      .addText((t) =>
        t.setValue(String(settings.windowDaysBack)).onChange((v) => {
          const n = parseInt(v, 10);
          if (!isNaN(n) && n >= 0) onChange({ ...settings, windowDaysBack: n });
        })
      );
    new Setting(container)
      .setName("表示期間: 今日より先 (日)")
      .addText((t) =>
        t.setValue(String(settings.windowDaysForward)).onChange((v) => {
          const n = parseInt(v, 10);
          if (!isNaN(n) && n > 0) onChange({ ...settings, windowDaysForward: n });
        })
      );
    new Setting(container)
      .setName("1日あたりの幅 (px)")
      .addText((t) =>
        t.setValue(String(settings.dayWidth)).onChange((v) => {
          const n = parseInt(v, 10);
          if (!isNaN(n) && n >= 12 && n <= 80) onChange({ ...settings, dayWidth: n });
        })
      );
    new Setting(container)
      .setName("完了タスクを隠す")
      .addToggle((t) =>
        t
          .setValue(settings.hideCompleted)
          .onChange((v) => onChange({ ...settings, hideCompleted: v }))
      );
  },
};

async function renderGantt(
  el: HTMLElement,
  settings: Settings,
  ctx: WidgetContext
): Promise<void> {
  el.empty();
  el.addClass("nd-widget-gantt");

  const today = startOfDay(new Date());
  const windowStart = new Date(today.getTime() - settings.windowDaysBack * DAY_MS);
  const windowEnd = new Date(today.getTime() + settings.windowDaysForward * DAY_MS);
  const totalDays = Math.round((windowEnd.getTime() - windowStart.getTime()) / DAY_MS);

  const bars = collectBars(ctx, settings, windowStart, windowEnd);

  if (bars.length === 0) {
    el.createDiv({
      cls: "nd-empty",
      text: `フォルダ "${settings.folder}" に表示期間内の期限を持つタスクがありません`,
    });
    return;
  }

  const groups = settings.groupByField
    ? groupBy(bars, (b) => b.pjt || "(未分類)")
    : new Map([["", bars]]);

  const chart = el.createDiv({ cls: "nd-gantt-chart" });
  const labelCol = chart.createDiv({ cls: "nd-gantt-labels" });
  const grid = chart.createDiv({ cls: "nd-gantt-grid" });
  const gridInner = grid.createDiv({ cls: "nd-gantt-grid-inner" });
  gridInner.style.width = `${totalDays * settings.dayWidth}px`;

  const labelHeader = labelCol.createDiv({ cls: "nd-gantt-label-header" });
  labelHeader.setText("タスク");

  const gridHeader = gridInner.createDiv({ cls: "nd-gantt-grid-header" });
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(windowStart.getTime() + i * DAY_MS);
    const cell = gridHeader.createDiv({ cls: "nd-gantt-day-cell" });
    cell.style.width = `${settings.dayWidth}px`;
    cell.style.left = `${i * settings.dayWidth}px`;
    if (isWeekend(d)) cell.addClass("nd-gantt-weekend");
    if (sameDay(d, today)) cell.addClass("nd-gantt-today-col");
    if (d.getDate() === 1 || i === 0) {
      cell.createDiv({ cls: "nd-gantt-month", text: `${d.getMonth() + 1}月` });
    }
    cell.createDiv({ cls: "nd-gantt-day-num", text: String(d.getDate()) });
    cell.createDiv({
      cls: "nd-gantt-weekday",
      text: ["日", "月", "火", "水", "木", "金", "土"][d.getDay()],
    });
  }

  let rowIdx = 0;
  for (const [groupName, groupBars] of groups) {
    if (settings.groupByField) {
      const groupLabel = labelCol.createDiv({ cls: "nd-gantt-group-label", text: groupName });
      groupLabel.style.height = `${settings.rowHeight}px`;
      const groupRow = gridInner.createDiv({ cls: "nd-gantt-group-row" });
      groupRow.style.top = `${rowIdx * settings.rowHeight + 48}px`;
      groupRow.style.width = `${totalDays * settings.dayWidth}px`;
      groupRow.style.height = `${settings.rowHeight}px`;
      rowIdx++;
    }
    for (const bar of groupBars) {
      const label = labelCol.createDiv({ cls: "nd-gantt-task-label" });
      label.style.height = `${settings.rowHeight}px`;
      const link = label.createEl("a", { cls: "nd-gantt-task-link", text: bar.title });
      link.addEventListener("click", (e) => {
        e.preventDefault();
        ctx.app.workspace.getLeaf(false).openFile(bar.file);
      });

      const row = gridInner.createDiv({ cls: "nd-gantt-task-row" });
      row.style.top = `${rowIdx * settings.rowHeight + 48}px`;
      row.style.width = `${totalDays * settings.dayWidth}px`;
      row.style.height = `${settings.rowHeight}px`;
      if (rowIdx % 2 === 1) row.addClass("nd-gantt-row-alt");

      const startPx = Math.max(0, daysBetween(windowStart, bar.start) * settings.dayWidth);
      const startDays = Math.max(0, daysBetween(windowStart, bar.start));
      const endDaysExcl = Math.min(totalDays, daysBetween(windowStart, bar.end) + 1);
      const widthPx = Math.max(settings.dayWidth, (endDaysExcl - startDays) * settings.dayWidth);

      const barEl = row.createDiv({ cls: "nd-gantt-bar" });
      barEl.style.left = `${startPx}px`;
      barEl.style.width = `${widthPx}px`;
      barEl.style.height = `${settings.rowHeight - 8}px`;
      barEl.dataset.path = bar.file.path;
      barEl.title = `${bar.title}\n${formatDate(bar.start)} → ${formatDate(bar.end)}\n${bar.pjt}${bar.status ? " • " + bar.status : ""}${bar.priority ? " • " + bar.priority : ""}`;
      if (bar.status === "完了") barEl.addClass("nd-gantt-bar-done");
      barEl.addClass(`nd-gantt-bar-prio-${normalizePriority(bar.priority)}`);
      if (bar.end < today && bar.status !== "完了") barEl.addClass("nd-gantt-bar-overdue");
      barEl.createSpan({ cls: "nd-gantt-bar-label", text: bar.title });
      barEl.addEventListener("click", () => {
        ctx.app.workspace.getLeaf(false).openFile(bar.file);
      });

      rowIdx++;
    }
  }

  const todayLine = gridInner.createDiv({ cls: "nd-gantt-today-line" });
  const todayPx = daysBetween(windowStart, today) * settings.dayWidth + settings.dayWidth / 2;
  todayLine.style.left = `${todayPx}px`;
  todayLine.style.height = `${rowIdx * settings.rowHeight + 48}px`;

  // Match label column total height so vertical scroll feels right
  labelCol.style.minHeight = `${rowIdx * settings.rowHeight + 48}px`;

  setTimeout(() => {
    grid.scrollLeft = Math.max(0, todayPx - 120);
  }, 0);
}

function collectBars(
  ctx: WidgetContext,
  settings: Settings,
  windowStart: Date,
  windowEnd: Date
): Bar[] {
  const folder = settings.folder.replace(/\/+$/, "") + "/";
  const out: Bar[] = [];
  const files: TFile[] = (ctx.app.vault as any).getMarkdownFiles();
  for (const f of files) {
    if (!f.path.startsWith(folder)) continue;
    const fm = (ctx.app as any).metadataCache.getFileCache(f)?.frontmatter ?? {};
    const status = fm[settings.statusField] ? String(fm[settings.statusField]) : "";
    if (settings.hideCompleted && status === "完了") continue;
    const deadlineRaw = fm[settings.deadlineField];
    if (!deadlineRaw || deadlineRaw === "なし") continue;
    const end = parseDate(String(deadlineRaw));
    if (!end) continue;
    const startRaw = settings.startField ? fm[settings.startField] : null;
    let start = startRaw ? parseDate(String(startRaw)) : null;
    if (!start) {
      const days = parseDurationDays(String(fm[settings.durationField] ?? ""));
      start = new Date(end.getTime() - Math.max(1, Math.ceil(days)) * DAY_MS + DAY_MS);
    }
    if (end < windowStart || start > windowEnd) continue;
    out.push({
      file: f,
      title: f.basename,
      start,
      end,
      pjt: fm[settings.groupByField] ? String(fm[settings.groupByField]) : "",
      status,
      priority: fm["優先度"] ? String(fm["優先度"]) : "",
    });
  }
  out.sort((a, b) => {
    if (a.pjt !== b.pjt) return a.pjt < b.pjt ? -1 : 1;
    return a.end.getTime() - b.end.getTime();
  });
  return out;
}

function parseDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3]);
}

function parseDurationDays(s: string): number {
  if (!s) return 1;
  const m = /^([\d.]+)\s*([mhdw])/i.exec(s.trim());
  if (!m) return 1;
  const n = parseFloat(m[1]);
  const u = m[2].toLowerCase();
  switch (u) {
    case "m": return n / (60 * 24);
    case "h": return n / 24;
    case "d": return n;
    case "w": return n * 7;
  }
  return 1;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isWeekend(d: Date): boolean {
  return d.getDay() === 0 || d.getDay() === 6;
}

function daysBetween(start: Date, end: Date): number {
  return Math.round((startOfDay(end).getTime() - startOfDay(start).getTime()) / DAY_MS);
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function normalizePriority(p: string): string {
  const s = (p || "").toLowerCase();
  if (/urgent|緊急/.test(s)) return "urgent";
  if (/high|高/.test(s)) return "high";
  if (/medium|中/.test(s)) return "medium";
  if (/low|低/.test(s)) return "low";
  return "other";
}

function groupBy<T>(arr: T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const item of arr) {
    const k = key(item);
    const list = m.get(k) ?? [];
    list.push(item);
    m.set(k, list);
  }
  return m;
}
