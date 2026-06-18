import { Setting, TFile } from "obsidian";
import type { WidgetDefinition, WidgetContext } from "./types";
import { parseMarkwhen } from "../adapters/markwhen";
import { renderMemberTabs } from "./KanbanWidget";

const ALL_MEMBERS = "";

type SourceMode = "frontmatter" | "markwhen";

interface Settings {
  source: SourceMode;
  // markwhen source
  markwhenPath: string;
  // frontmatter source
  folder: string;
  deadlineField: string;
  startField: string;
  durationField: string;
  statusField: string;
  groupByField: string;
  // common
  windowDaysBack: number;
  windowDaysForward: number;
  rowHeight: number;
  dayWidth: number;
  hideCompleted: boolean;
}

interface Bar {
  start: Date;
  end: Date;
  title: string;
  section: string;
  group: string;
  tags: string[];
  done: boolean;
  isGroupHeader: boolean;
  owner: string; // タスク/詳細/{owner}/foo から抽出（flat or 未割当 = ""）
  onClick?: () => void;
  tooltip?: string;
}

const DAY_MS = 86400000;
const ZOOM_LEVELS = [8, 12, 16, 24, 32, 48, 64];

/** Narrow view of a note's frontmatter: arbitrary keys with unknown values. */
type Frontmatter = Record<string, unknown>;

/** Read a file's frontmatter as a typed record (empty when absent). */
function readFrontmatter(ctx: WidgetContext, file: TFile): Frontmatter {
  return ctx.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
}

/** Stringify an unknown frontmatter value (mirrors `String(...)` semantics). */
function fmString(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean" || v == null) return String(v);
  if (Array.isArray(v)) return v.join(",");
  // Plain objects stringify as "[object Object]" — same as String(v).
  return Object.prototype.toString.call(v);
}

// Ephemeral per-render state, keyed by widget DOM element. Survives re-renders
// of the same widget but isn't persisted to .dashboard JSON.
interface GanttViewState {
  zoomIdx: number;
  offsetDays: number;
  selectedMember: string;
}
const viewState = new WeakMap<HTMLElement, GanttViewState>();

function ownerFromPath(path: string, baseFolder: string): string {
  const prefix = baseFolder.replace(/\/+$/, "") + "/";
  if (!path.startsWith(prefix)) return "";
  const rest = path.slice(prefix.length);
  const parts = rest.split("/");
  return parts.length >= 2 ? parts[0] : "";
}

export const ganttWidget: WidgetDefinition<Settings> = {
  type: "gantt",
  label: "Gantt",
  description:
    "ガントチャート。タスク/ガント.mw (Markwhen) かタスクfrontmatter (期限+工数) から自動生成。ズーム&期間シフト対応。",
  defaultSettings: () => ({
    source: "markwhen",
    markwhenPath: "タスク/ガント.mw",
    folder: "タスク/詳細",
    deadlineField: "期限",
    startField: "開始",
    durationField: "工数",
    statusField: "status",
    groupByField: "PJT",
    // Wide default window so native horizontal scroll is enough (no jank
    // from mid-scroll re-rendering). 180 days back + 365 forward ≈ 1.5 years.
    windowDaysBack: 180,
    windowDaysForward: 365,
    rowHeight: 24,
    dayWidth: 24,
    hideCompleted: false,
  }),
  async render(el, settings, ctx) {
    await renderGantt(el, settings, ctx);
  },
  renderSettingsForm(container, settings, onChange) {
    new Setting(container)
      .setName("ソース")
      .addDropdown((d) =>
        d
          .addOption("markwhen", "Markwhen (.mw) ファイル")
          .addOption("frontmatter", "タスクのfrontmatter (期限/工数)")
          .setValue(settings.source)
          .onChange((v) => onChange({ ...settings, source: v as SourceMode }))
      );
    new Setting(container)
      .setName("Markwhen ファイルパス")
      .setDesc('例: "タスク/ガント.mw"')
      .addText((t) =>
        t.setValue(settings.markwhenPath).onChange((v) =>
          onChange({ ...settings, markwhenPath: v.trim() })
        )
      );
    new Setting(container)
      .setName("(frontmatter) ソースフォルダ")
      .addText((t) =>
        t.setValue(settings.folder).onChange((v) =>
          onChange({ ...settings, folder: v.trim() || "タスク/詳細" })
        )
      );
    new Setting(container)
      .setName("(frontmatter) 期限フィールド")
      .addText((t) =>
        t.setValue(settings.deadlineField).onChange((v) =>
          onChange({ ...settings, deadlineField: v.trim() || "期限" })
        )
      );
    new Setting(container)
      .setName("(frontmatter) 開始フィールド (任意)")
      .addText((t) =>
        t.setValue(settings.startField).onChange((v) =>
          onChange({ ...settings, startField: v.trim() })
        )
      );
    new Setting(container)
      .setName("(frontmatter) 工数フィールド")
      .addText((t) =>
        t.setValue(settings.durationField).onChange((v) =>
          onChange({ ...settings, durationField: v.trim() })
        )
      );
    new Setting(container)
      .setName("(frontmatter) グループ化フィールド")
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
      .setDesc("デフォルトズーム。実行中は + - ボタンでも変更可")
      .addText((t) =>
        t.setValue(String(settings.dayWidth)).onChange((v) => {
          const n = parseInt(v, 10);
          if (!isNaN(n) && n >= 8 && n <= 80) onChange({ ...settings, dayWidth: n });
        })
      );
    new Setting(container)
      .setName("行の高さ (px)")
      .addText((t) =>
        t.setValue(String(settings.rowHeight)).onChange((v) => {
          const n = parseInt(v, 10);
          if (!isNaN(n) && n >= 18 && n <= 60) onChange({ ...settings, rowHeight: n });
        })
      );
    new Setting(container)
      .setName("完了タスクを隠す")
      .addToggle((t) =>
        t.setValue(settings.hideCompleted).onChange((v) =>
          onChange({ ...settings, hideCompleted: v })
        )
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

  // Ephemeral view state — zoom + manual shift + member tab
  const state: GanttViewState = viewState.get(el) ?? {
    zoomIdx: nearestZoomIdx(settings.dayWidth),
    offsetDays: 0,
    selectedMember: ALL_MEMBERS,
  };
  viewState.set(el, state);
  const dayWidth = ZOOM_LEVELS[state.zoomIdx];

  const today = startOfDay(new Date());
  const today0 = new Date(today.getTime() + state.offsetDays * DAY_MS);
  const windowStart = new Date(today0.getTime() - settings.windowDaysBack * DAY_MS);
  const windowEnd = new Date(today0.getTime() + settings.windowDaysForward * DAY_MS);
  const totalDays = Math.round((windowEnd.getTime() - windowStart.getTime()) / DAY_MS);

  // Toolbar
  const toolbar = el.createDiv({ cls: "nd-gantt-toolbar" });
  const tbLeft = toolbar.createDiv({ cls: "nd-gantt-toolbar-left" });
  const tbRight = toolbar.createDiv({ cls: "nd-gantt-toolbar-right" });

  mkBtn(tbLeft, "« 前へ", () => {
    state.offsetDays -= Math.max(1, Math.floor(settings.windowDaysForward / 2));
    void renderGantt(el, settings, ctx);
  });
  mkBtn(tbLeft, "今日", () => {
    state.offsetDays = 0;
    void renderGantt(el, settings, ctx);
  });
  mkBtn(tbLeft, "次へ »", () => {
    state.offsetDays += Math.max(1, Math.floor(settings.windowDaysForward / 2));
    void renderGantt(el, settings, ctx);
  });

  const periodLabel = tbRight.createSpan({
    cls: "nd-gantt-period",
    text: `${fmt(windowStart)} 〜 ${fmt(windowEnd)} (${totalDays}日 / ${dayWidth}px)`,
  });
  void periodLabel;
  mkBtn(tbRight, "−", () => {
    if (state.zoomIdx > 0) {
      state.zoomIdx--;
      void renderGantt(el, settings, ctx);
    }
  });
  mkBtn(tbRight, "+", () => {
    if (state.zoomIdx < ZOOM_LEVELS.length - 1) {
      state.zoomIdx++;
      void renderGantt(el, settings, ctx);
    }
  });
  mkBtn(tbRight, "リセット", () => {
    state.zoomIdx = nearestZoomIdx(settings.dayWidth);
    state.offsetDays = 0;
    void renderGantt(el, settings, ctx);
  });

  // Collect bars
  let bars: Bar[] = [];
  let tagColors: Record<string, string> = {};
  try {
    if (settings.source === "markwhen") {
      const result = await collectFromMarkwhen(ctx, settings, windowStart, windowEnd);
      bars = result.bars;
      tagColors = result.tagColors;
    } else {
      bars = collectFromFrontmatter(ctx, settings, windowStart, windowEnd);
    }
  } catch (e) {
    el.createEl("pre", { cls: "nd-error", text: `Gantt error: ${(e as Error).message}` });
    return;
  }

  if (settings.hideCompleted) bars = bars.filter((b) => !b.done);

  // Member tabs (auto-discover from bar owners)
  const members = Array.from(new Set(bars.map((b) => b.owner).filter(Boolean))).sort();
  renderMemberTabs(el, members, state.selectedMember, (next) => {
    state.selectedMember = next;
    void renderGantt(el, settings, ctx);
  });
  if (state.selectedMember !== ALL_MEMBERS) {
    bars = bars.filter((b) => b.owner === state.selectedMember);
  }

  if (bars.length === 0) {
    el.createDiv({
      cls: "nd-empty",
      text:
        settings.source === "markwhen"
          ? `${settings.markwhenPath} にイベントがありません`
          : `フォルダ "${settings.folder}" に期限を持つタスクがありません`,
    });
    return;
  }

  const ordered = orderBars(bars);

  // Skip bars entirely outside the window (label + bar both gone — no orphans).
  // Bars partially in window will be clamped at render time.
  const visible = ordered.filter((b) => b.end >= windowStart && b.start <= windowEnd);

  if (visible.length === 0) {
    el.createDiv({
      cls: "nd-empty",
      text: `この期間 (${fmt(windowStart)} 〜 ${fmt(windowEnd)}) にイベントなし。« 前へ / 次へ » で期間を動かすか、設定で期間日数を増やしてください。`,
    });
    return;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Two-pane synced scroll layout. Left pane is physically separate from
  // the horizontally-scrolling right pane, so it never disappears.
  // Vertical scroll is synced via JS.
  // ─────────────────────────────────────────────────────────────────────────
  const HEADER_H = 48;
  const LABEL_W = 200;
  const totalWidth = totalDays * dayWidth;

  const chart = el.createDiv({ cls: "nd-gantt-chart2" });

  // Left pane: corner + labels (vertical-only, synced)
  const left = chart.createDiv({ cls: "nd-gantt-left" });
  left.style.width = `${LABEL_W}px`;
  const leftCorner = left.createDiv({ cls: "nd-gantt-left-corner", text: "タスク" });
  leftCorner.style.height = `${HEADER_H}px`;
  const leftBody = left.createDiv({ cls: "nd-gantt-left-body" });

  // Right pane: header + bar grid (both axes)
  const right = chart.createDiv({ cls: "nd-gantt-right" });
  const rightHeader = right.createDiv({ cls: "nd-gantt-right-header" });
  rightHeader.style.width = `${totalWidth}px`;
  rightHeader.style.height = `${HEADER_H}px`;
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(windowStart.getTime() + i * DAY_MS);
    const cell = rightHeader.createDiv({ cls: "nd-gantt-day-cell" });
    cell.style.width = `${dayWidth}px`;
    cell.style.left = `${i * dayWidth}px`;
    if (isWeekend(d)) cell.addClass("nd-gantt-weekend");
    if (sameDay(d, today)) cell.addClass("nd-gantt-today-col");
    if (d.getDate() === 1 || i === 0) {
      cell.createDiv({ cls: "nd-gantt-month", text: `${d.getFullYear()}/${d.getMonth() + 1}` });
    }
    if (dayWidth >= 16) {
      cell.createDiv({ cls: "nd-gantt-day-num", text: String(d.getDate()) });
    }
    if (dayWidth >= 24) {
      cell.createDiv({
        cls: "nd-gantt-weekday",
        text: ["日", "月", "火", "水", "木", "金", "土"][d.getDay()],
      });
    }
  }
  const rightBody = right.createDiv({ cls: "nd-gantt-right-body" });
  rightBody.style.width = `${totalWidth}px`;

  let rowIdx = 0;
  let currentSection = "__none__";
  for (const bar of visible) {
    if (bar.section !== currentSection) {
      currentSection = bar.section;
      if (currentSection) {
        const sLabel = leftBody.createDiv({ cls: "nd-gantt-section-label", text: currentSection });
        sLabel.style.height = `${settings.rowHeight}px`;
        const sRow = rightBody.createDiv({ cls: "nd-gantt-section-row" });
        sRow.style.top = `${rowIdx * settings.rowHeight}px`;
        sRow.style.width = `${totalWidth}px`;
        sRow.style.height = `${settings.rowHeight}px`;
        rowIdx++;
      }
    }

    const label = leftBody.createDiv({ cls: "nd-gantt-task-label" });
    label.style.height = `${settings.rowHeight}px`;
    if (bar.isGroupHeader) label.addClass("nd-gantt-task-label-group");
    if (bar.group && !bar.isGroupHeader) label.addClass("nd-gantt-task-label-child");
    const link = label.createEl("a", { cls: "nd-gantt-task-link", text: bar.title });
    if (bar.onClick)
      link.addEventListener("click", (e) => {
        e.preventDefault();
        bar.onClick?.();
      });

    const row = rightBody.createDiv({ cls: "nd-gantt-task-row" });
    row.style.top = `${rowIdx * settings.rowHeight}px`;
    row.style.width = `${totalWidth}px`;
    row.style.height = `${settings.rowHeight}px`;
    if (rowIdx % 2 === 1) row.addClass("nd-gantt-row-alt");

    const startDays = Math.max(0, daysBetween(windowStart, bar.start));
    const endDaysExcl = Math.min(totalDays, daysBetween(windowStart, bar.end) + 1);
    const startPx = startDays * dayWidth;
    const widthPx = Math.max(dayWidth, (endDaysExcl - startDays) * dayWidth);

    const barEl = row.createDiv({ cls: "nd-gantt-bar" });
    barEl.style.left = `${startPx}px`;
    barEl.style.width = `${widthPx}px`;
    barEl.style.height = `${settings.rowHeight - 6}px`;
    if (bar.start < windowStart) barEl.addClass("nd-gantt-bar-clip-left");
    if (bar.end > windowEnd) barEl.addClass("nd-gantt-bar-clip-right");
    barEl.title = bar.tooltip ?? `${bar.title}\n${fmt(bar.start)} → ${fmt(bar.end)}`;
    if (bar.done) barEl.addClass("nd-gantt-bar-done");
    if (bar.isGroupHeader) barEl.addClass("nd-gantt-bar-group");
    const overdue = bar.end < today && !bar.done;
    if (overdue) barEl.addClass("nd-gantt-bar-overdue");

    const tagColor = bar.tags.map((t) => tagColors[t]).find(Boolean);
    if (tagColor && !overdue && !bar.done) {
      barEl.style.background = tagColor;
      barEl.style.color = pickFg(tagColor);
    }

    barEl.createSpan({ cls: "nd-gantt-bar-label", text: bar.title });
    if (bar.onClick) {
      barEl.addEventListener("click", () => bar.onClick?.());
      barEl.addClass("nd-gantt-bar-clickable");
    }

    rowIdx++;
  }

  const totalBodyHeight = rowIdx * settings.rowHeight;
  leftBody.style.height = `${totalBodyHeight}px`;
  rightBody.style.height = `${totalBodyHeight}px`;

  // Today vertical line in right-body
  const todayDays = daysBetween(windowStart, today);
  if (todayDays >= 0 && todayDays <= totalDays) {
    const todayLine = rightBody.createDiv({ cls: "nd-gantt-today-line" });
    todayLine.style.left = `${todayDays * dayWidth + dayWidth / 2}px`;
    todayLine.style.height = `${totalBodyHeight}px`;
  }

  // Sync vertical scroll: right.scrollTop → left.scrollTop
  // (right is the master because user scrolls it directly; left scroll is hidden)
  let scrollSyncing = false;
  right.addEventListener("scroll", () => {
    if (scrollSyncing) return;
    scrollSyncing = true;
    leftBody.scrollTop = right.scrollTop;
    window.requestAnimationFrame(() => {
      scrollSyncing = false;
    });
  });
  // Mouse wheel on left pane scrolls the right pane (so wheel-over-labels works)
  leftBody.addEventListener("wheel", (e) => {
    if (e.deltaY !== 0) {
      e.preventDefault();
      right.scrollTop += e.deltaY;
    }
  });

  // Auto-scroll horizontally so today is near left edge.
  window.setTimeout(() => {
    right.scrollLeft = Math.max(0, todayDays * dayWidth - 80);
  }, 0);
}

function mkBtn(parent: HTMLElement, text: string, on: () => void): HTMLElement {
  const b = parent.createEl("button", { cls: "nd-gantt-btn", text });
  b.addEventListener("click", on);
  return b;
}

async function collectFromMarkwhen(
  ctx: WidgetContext,
  settings: Settings,
  windowStart: Date,
  windowEnd: Date
): Promise<{ bars: Bar[]; tagColors: Record<string, string> }> {
  const file = ctx.app.vault.getAbstractFileByPath(settings.markwhenPath);
  if (!(file instanceof TFile)) {
    throw new Error(`${settings.markwhenPath} が見つかりません`);
  }
  const raw = await ctx.app.vault.cachedRead(file);
  const doc = parseMarkwhen(raw);

  const bars: Bar[] = [];
  void windowStart;
  void windowEnd;
  for (const ev of doc.events) {
    const done = ev.tags.includes("done");
    const tooltip =
      `${ev.title}\n${fmt(ev.start)} → ${fmt(ev.end)}` +
      (ev.section ? `\n${ev.section}` : "") +
      (ev.group ? `\n[${ev.group}]` : "") +
      (ev.tags.length ? `\n#${ev.tags.join(" #")}` : "");
    let onClick: (() => void) | undefined;
    let owner = "";
    if (ev.link) {
      const path = normalizeLinkPath(ev.link);
      owner = ownerFromPath(path, settings.folder);
      onClick = () => {
        const target = ctx.app.metadataCache.getFirstLinkpathDest(path, settings.markwhenPath);
        if (target instanceof TFile) {
          void ctx.app.workspace.getLeaf(false).openFile(target);
        }
      };
    }
    bars.push({
      start: ev.start,
      end: ev.end,
      title: ev.title,
      section: ev.section,
      group: ev.group,
      tags: ev.tags,
      done,
      isGroupHeader: ev.isGroupHeader,
      owner,
      onClick,
      tooltip,
    });
  }
  return { bars, tagColors: doc.tagColors };
}

function collectFromFrontmatter(
  ctx: WidgetContext,
  settings: Settings,
  windowStart: Date,
  windowEnd: Date
): Bar[] {
  const folder = settings.folder.replace(/\/+$/, "") + "/";
  const out: Bar[] = [];
  const files: TFile[] = ctx.app.vault.getMarkdownFiles();
  for (const f of files) {
    if (!f.path.startsWith(folder)) continue;
    const fm = readFrontmatter(ctx, f);
    const status = fm[settings.statusField] ? fmString(fm[settings.statusField]) : "";
    const done = status === "完了";
    const deadlineRaw = fm[settings.deadlineField];
    if (!deadlineRaw || deadlineRaw === "なし") continue;
    const end = parseISODate(fmString(deadlineRaw));
    if (!end) continue;
    const startRaw = settings.startField ? fm[settings.startField] : null;
    let start = startRaw ? parseISODate(fmString(startRaw)) : null;
    if (!start) {
      const dur = parseDurationDays(fmString(fm[settings.durationField] ?? ""));
      // Minimum 1 day visible — but use a sensible week-ish fallback for tasks
      // with only an hourly 工数. If user really wants 1-day bars, set startField.
      const days = dur < 1 ? 3 : Math.max(1, Math.ceil(dur));
      start = new Date(end.getTime() - (days - 1) * DAY_MS);
    }
    void windowStart;
    void windowEnd;
    const pjt = fm[settings.groupByField] ? fmString(fm[settings.groupByField]) : "";
    out.push({
      start,
      end,
      title: f.basename,
      section: pjt,
      group: "",
      tags: [],
      done,
      isGroupHeader: false,
      owner: ownerFromPath(f.path, settings.folder),
      onClick: () => void ctx.app.workspace.getLeaf(false).openFile(f),
      tooltip: `${f.basename}\n${fmt(start)} → ${fmt(end)}\n${pjt}${status ? " • " + status : ""}`,
    });
  }
  return out;
}

function orderBars(bars: Bar[]): Bar[] {
  // Keep input order grouped by section, group; group header first within a group
  const groups = new Map<string, Map<string, Bar[]>>();
  const sectionOrder: string[] = [];
  const groupOrderBySection = new Map<string, string[]>();
  for (const b of bars) {
    if (!groups.has(b.section)) {
      groups.set(b.section, new Map());
      sectionOrder.push(b.section);
      groupOrderBySection.set(b.section, []);
    }
    const sm = groups.get(b.section)!;
    if (!sm.has(b.group)) {
      sm.set(b.group, []);
      groupOrderBySection.get(b.section)!.push(b.group);
    }
    sm.get(b.group)!.push(b);
  }
  const result: Bar[] = [];
  for (const s of sectionOrder) {
    const sm = groups.get(s)!;
    for (const g of groupOrderBySection.get(s)!) {
      const arr = sm.get(g)!;
      // group header first if present
      const header = arr.find((b) => b.isGroupHeader);
      const rest = arr.filter((b) => !b.isGroupHeader).sort((a, b) => a.start.getTime() - b.start.getTime());
      if (header) result.push(header);
      result.push(...rest);
    }
  }
  return result;
}

function normalizeLinkPath(link: string): string {
  // strip pipe alias and surrounding spaces, ensure trailing .md if no ext
  const lhs = link.split("|")[0].trim();
  return lhs;
}

function parseISODate(s: string): Date | null {
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

function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function nearestZoomIdx(px: number): number {
  let best = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < ZOOM_LEVELS.length; i++) {
    const d = Math.abs(ZOOM_LEVELS[i] - px);
    if (d < bestDiff) {
      bestDiff = d;
      best = i;
    }
  }
  return best;
}

function pickFg(hex: string): string {
  // very simple luminance pick
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "white";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#222" : "white";
}
