import { Setting, TFile } from "obsidian";
import type { WidgetDefinition, WidgetContext } from "./types";

type ChartType =
  | "tasks-completed-30d"
  | "notes-created-30d"
  | "tasks-by-pjt"
  | "tasks-by-status";

interface Settings {
  charts: ChartType[];
  folder: string;
  statusField: string;
  pjtField: string;
}

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

const DAY_MS = 86400000;

const CHART_LABELS: Record<ChartType, string> = {
  "tasks-completed-30d": "📈 完了タスク (過去30日)",
  "notes-created-30d": "📝 ノート作成数 (過去30日)",
  "tasks-by-pjt": "📊 PJT別タスク数",
  "tasks-by-status": "🥧 status別タスク数",
};

export const chartsWidget: WidgetDefinition<Settings> = {
  type: "charts",
  label: "Charts (進捗グラフ)",
  description:
    "完了タスク・ノート作成数・PJT別の集計をSVGミニグラフで表示。Chart libraryなしの軽量実装。",
  defaultSettings: () => ({
    charts: ["tasks-completed-30d", "tasks-by-pjt", "tasks-by-status"],
    folder: "タスク/詳細",
    statusField: "status",
    pjtField: "PJT",
  }),
  async render(el, settings, ctx) {
    el.empty();
    el.addClass("nd-widget-charts");
    for (const c of settings.charts) {
      const block = el.createDiv({ cls: "nd-chart-block" });
      block.createDiv({ cls: "nd-chart-title", text: CHART_LABELS[c] });
      const body = block.createDiv({ cls: "nd-chart-body" });
      try {
        await renderChart(body, c, settings, ctx);
      } catch (e) {
        body.createEl("pre", { cls: "nd-error", text: `chart error: ${(e as Error).message}` });
      }
    }
  },
  renderSettingsForm(container, settings, onChange) {
    new Setting(container)
      .setName("表示するチャート (カンマ区切り)")
      .setDesc("tasks-completed-30d / notes-created-30d / tasks-by-pjt / tasks-by-status")
      .addText((t) => {
        t.setValue(settings.charts.join(","));
        t.inputEl.addClass("deck-input-full");
        t.onChange((v) =>
          onChange({
            ...settings,
            charts: v.split(",").map((s) => s.trim()).filter(Boolean) as ChartType[],
          })
        );
      });
    new Setting(container).setName("タスクフォルダ").addText((t) =>
      t.setValue(settings.folder).onChange((v) =>
        onChange({ ...settings, folder: v.trim() || "タスク/詳細" })
      )
    );
    new Setting(container).setName("status フィールド").addText((t) =>
      t.setValue(settings.statusField).onChange((v) =>
        onChange({ ...settings, statusField: v.trim() || "status" })
      )
    );
    new Setting(container).setName("PJT フィールド").addText((t) =>
      t.setValue(settings.pjtField).onChange((v) =>
        onChange({ ...settings, pjtField: v.trim() || "PJT" })
      )
    );
  },
};

async function renderChart(
  el: HTMLElement,
  type: ChartType,
  settings: Settings,
  ctx: WidgetContext
): Promise<void> {
  switch (type) {
    case "tasks-completed-30d":
      await renderTasksCompleted(el, settings, ctx);
      break;
    case "notes-created-30d":
      await renderNotesCreated(el, settings, ctx);
      break;
    case "tasks-by-pjt":
      await renderTasksByPjt(el, settings, ctx);
      break;
    case "tasks-by-status":
      await renderTasksByStatus(el, settings, ctx);
      break;
  }
}

async function renderTasksCompleted(
  el: HTMLElement,
  settings: Settings,
  ctx: WidgetContext
): Promise<void> {
  const folder = settings.folder.replace(/\/+$/, "") + "/";
  const files: TFile[] = ctx.app.vault.getMarkdownFiles();
  const today = startOfDay(new Date());
  const buckets: number[] = new Array<number>(30).fill(0);
  for (const f of files) {
    if (!f.path.startsWith(folder)) continue;
    const fm = readFrontmatter(ctx, f);
    if (fm[settings.statusField] !== "完了") continue;
    // Use file mtime as completion timestamp proxy
    const dayIdx = Math.floor((today.getTime() - startOfDay(new Date(f.stat.mtime)).getTime()) / DAY_MS);
    if (dayIdx >= 0 && dayIdx < 30) buckets[29 - dayIdx]++;
  }
  drawLineChart(el, buckets, last30Labels(today));
}

async function renderNotesCreated(
  el: HTMLElement,
  settings: Settings,
  ctx: WidgetContext
): Promise<void> {
  void settings;
  const files: TFile[] = ctx.app.vault.getMarkdownFiles();
  const today = startOfDay(new Date());
  const buckets: number[] = new Array<number>(30).fill(0);
  for (const f of files) {
    const dayIdx = Math.floor((today.getTime() - startOfDay(new Date(f.stat.ctime)).getTime()) / DAY_MS);
    if (dayIdx >= 0 && dayIdx < 30) buckets[29 - dayIdx]++;
  }
  drawLineChart(el, buckets, last30Labels(today));
}

async function renderTasksByPjt(
  el: HTMLElement,
  settings: Settings,
  ctx: WidgetContext
): Promise<void> {
  const folder = settings.folder.replace(/\/+$/, "") + "/";
  const files: TFile[] = ctx.app.vault.getMarkdownFiles();
  const counts = new Map<string, number>();
  for (const f of files) {
    if (!f.path.startsWith(folder)) continue;
    const fm = readFrontmatter(ctx, f);
    if (fm[settings.statusField] === "完了") continue;
    const pjt = fmString(fm[settings.pjtField] ?? "(なし)");
    counts.set(pjt, (counts.get(pjt) ?? 0) + 1);
  }
  const entries = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
  drawBarChart(el, entries);
}

async function renderTasksByStatus(
  el: HTMLElement,
  settings: Settings,
  ctx: WidgetContext
): Promise<void> {
  const folder = settings.folder.replace(/\/+$/, "") + "/";
  const files: TFile[] = ctx.app.vault.getMarkdownFiles();
  const counts = new Map<string, number>();
  for (const f of files) {
    if (!f.path.startsWith(folder)) continue;
    const fm = readFrontmatter(ctx, f);
    const s = fmString(fm[settings.statusField] ?? "(なし)");
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  const order = ["未着手", "作業中", "レビュー待ち", "完了"];
  const entries = order
    .map((k) => [k, counts.get(k) ?? 0] as [string, number])
    .filter((e) => e[1] > 0);
  // include any other statuses
  for (const [k, v] of counts) {
    if (!order.includes(k)) entries.push([k, v]);
  }
  drawBarChart(el, entries);
}

function drawLineChart(el: HTMLElement, values: number[], labels: string[]): void {
  const W = 400;
  const H = 110;
  const padL = 28;
  const padB = 18;
  const padT = 6;
  const max = Math.max(1, ...values);
  const stepX = (W - padL) / Math.max(1, values.length - 1);
  const chartH = H - padT - padB;

  const svg = el.createSvg("svg", { attr: { viewBox: `0 0 ${W} ${H}`, class: "nd-chart-svg" } });
  // axes
  svg.createSvg("line", {
    attr: { x1: padL, y1: H - padB, x2: W, y2: H - padB, class: "nd-chart-axis" },
  });
  // y ticks
  for (let i = 0; i <= 4; i++) {
    const y = padT + (chartH * (4 - i)) / 4;
    const v = Math.round((max * i) / 4);
    svg.createSvg("text", {
      attr: { x: padL - 4, y: y + 3, "text-anchor": "end", class: "nd-chart-text" },
    }).textContent = String(v);
    svg.createSvg("line", {
      attr: { x1: padL, y1: y, x2: W, y2: y, class: "nd-chart-grid" },
    });
  }
  // line
  const pts = values
    .map((v, i) => {
      const x = padL + i * stepX;
      const y = padT + chartH - (v / max) * chartH;
      return `${x},${y}`;
    })
    .join(" ");
  svg.createSvg("polyline", { attr: { points: pts, class: "nd-chart-line" } });
  // dots
  values.forEach((v, i) => {
    const x = padL + i * stepX;
    const y = padT + chartH - (v / max) * chartH;
    const c = svg.createSvg("circle", { attr: { cx: x, cy: y, r: 2, class: "nd-chart-dot" } });
    const title = svg.createSvg("title");
    title.setText(`${labels[i]}: ${v}`);
    c.appendChild(title);
  });
  // x labels (sparse)
  for (let i = 0; i < values.length; i += 5) {
    const x = padL + i * stepX;
    svg.createSvg("text", {
      attr: { x, y: H - 4, "text-anchor": "middle", class: "nd-chart-text" },
    }).textContent = labels[i];
  }
}

function drawBarChart(el: HTMLElement, entries: [string, number][]): void {
  const W = 400;
  const padL = 100;
  const barH = 18;
  const gap = 6;
  const H = entries.length * (barH + gap) + 10;
  const max = Math.max(1, ...entries.map(([, v]) => v));
  const svg = el.createSvg("svg", { attr: { viewBox: `0 0 ${W} ${H}`, class: "nd-chart-svg" } });
  entries.forEach(([label, val], i) => {
    const y = i * (barH + gap) + 4;
    // label
    svg.createSvg("text", {
      attr: { x: padL - 4, y: y + barH / 2 + 4, "text-anchor": "end", class: "nd-chart-text" },
    }).textContent = label.length > 14 ? label.slice(0, 13) + "…" : label;
    // bar bg
    svg.createSvg("rect", {
      attr: { x: padL, y, width: W - padL - 24, height: barH, class: "nd-chart-bar-bg" },
    });
    const bw = ((W - padL - 24) * val) / max;
    svg.createSvg("rect", { attr: { x: padL, y, width: bw, height: barH, class: "nd-chart-bar" } });
    svg.createSvg("text", {
      attr: { x: padL + bw + 4, y: y + barH / 2 + 4, class: "nd-chart-text" },
    }).textContent = String(val);
  });
}

function last30Labels(today: Date): string[] {
  const out: string[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today.getTime() - i * DAY_MS);
    out.push(`${d.getMonth() + 1}/${d.getDate()}`);
  }
  return out;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
