import { CURRENT_SCHEMA_VERSION } from "../constants";
import type { Dashboard } from "../types";

// Snapshot of the user's preferred home layout. Update this when the canonical
// home dashboard should change for new installs (or after a `reset-home`).
const STOCK_HOME_TEMPLATE: Dashboard = {
  version: CURRENT_SCHEMA_VERSION,
  title: "ホーム",
  layout: [
    { i: "today", x: 0, y: 0, w: 4, h: 2 },
    { i: "kpi-overdue", x: 4, y: 1, w: 2, h: 2 },
    { i: "kpi-today", x: 6, y: 2, w: 2, h: 2 },
    { i: "kpi-week", x: 8, y: 3, w: 2, h: 2 },
    { i: "kpi-meetings", x: 10, y: 4, w: 2, h: 2 },
    { i: "ai-search", x: 0, y: 5, w: 12, h: 4 },
    { i: "gantt", x: 0, y: 6, w: 12, h: 6 },
    { i: "kanban", x: 0, y: 7, w: 12, h: 6 },
    { i: "today-cal", x: 0, y: 8, w: 4, h: 7 },
    { i: "tasks-today", x: 6, y: 9, w: 4, h: 7 },
    { i: "tasks-week", x: 0, y: 10, w: 4, h: 7 },
    { i: "tasks-by-pjt", x: 6, y: 11, w: 6, h: 5 },
    { i: "recent-minutes", x: 0, y: 12, w: 6, h: 5 },
    { i: "quick-links", x: 0, y: 16, w: 12, h: 4 },
  ],
  widgets: {
    today: {
      type: "today",
      title: "今日",
      settings: {
        greeting: "おはよう ☀️",
        dailyFolder: "日報",
        dailyFormat: "YYYY/YYYY-MM-DD",
      },
    },
    "kpi-overdue": {
      type: "counter",
      title: "期限超過",
      settings: {
        query:
          'LIST FROM "タスク/詳細"\n' +
          'WHERE status != "完了" AND 期限 != null AND 期限 != "なし" AND date(期限) < date(today)',
        label: "🔥 期限超過",
        unit: "件",
      },
    },
    "kpi-today": {
      type: "counter",
      title: "今日締切",
      settings: {
        query:
          'LIST FROM "タスク/詳細"\n' +
          'WHERE status != "完了" AND 期限 = date(today)',
        label: "📌 今日締切",
        unit: "件",
      },
    },
    "kpi-week": {
      type: "counter",
      title: "今週締切",
      settings: {
        query:
          'LIST FROM "タスク/詳細"\n' +
          'WHERE status != "完了" AND date(期限) >= date(today) AND date(期限) <= date(today) + dur(7 days)',
        label: "📅 今週締切",
        unit: "件",
      },
    },
    "kpi-meetings": {
      type: "counter",
      title: "今週議事録",
      settings: {
        query: 'LIST FROM "議事録" WHERE file.cday >= date(today) - dur(7 days)',
        label: "💬 7日以内議事録",
        unit: "件",
      },
    },
    "ai-search": {
      type: "ai-search",
      title: "AI Search (自然言語検索)",
      settings: {
        backend: "claude-code",
        claudeCmd: "claude",
        model: "claude-haiku-4-5-20251001",
        topK: 30,
        excerptChars: 300,
        folders: [],
      },
    },
    gantt: {
      type: "gantt",
      title: "Gantt",
      settings: {
        folder: "タスク/詳細",
        deadlineField: "期限",
        startField: "開始",
        durationField: "工数",
        statusField: "status",
        groupByField: "PJT",
        windowDaysBack: 180,
        windowDaysForward: 365,
        rowHeight: 26,
        dayWidth: 24,
        hideCompleted: false,
      },
    },
    kanban: {
      type: "kanban",
      title: "Kanban (タスク)",
      settings: {
        folder: "タスク/詳細",
        statusField: "status",
        columns: ["未着手", "作業中", "AI移譲", "レビュー待ち", "完了"],
        showFields: ["PJT", "期限", "優先度"],
        hideCompleted: false,
      },
    },
    "today-cal": {
      type: "gcal",
      title: "今週の予定",
      settings: {
        calendarId: "primary",
        windowDays: 7,
        maxEvents: 40,
      },
    },
    "tasks-today": {
      type: "dataview",
      title: "🔥 今日 + 期限超過タスク",
      settings: {
        mode: "dql",
        query:
          'TABLE PJT, 期限 AS "期限", 優先度 AS "優先", status AS "状態"\n' +
          'FROM "タスク/詳細"\n' +
          'WHERE status != "完了" AND 期限 != null AND 期限 != "なし" AND date(期限) <= date(today)\n' +
          'SORT date(期限) ASC\n' +
          'LIMIT 6',
      },
    },
    "tasks-week": {
      type: "dataview",
      title: "📅 今週締切タスク (明日〜7日)",
      settings: {
        mode: "dql",
        query:
          'TABLE PJT, 期限 AS "期限", 優先度 AS "優先"\n' +
          'FROM "タスク/詳細"\n' +
          'WHERE status != "完了" AND 期限 != null AND 期限 != "なし"\n' +
          '  AND date(期限) > date(today) AND date(期限) <= date(today) + dur(7 days)\n' +
          'SORT date(期限) ASC',
      },
    },
    "tasks-by-pjt": {
      type: "dataview",
      title: "📊 PJT別 未完了タスク",
      settings: {
        mode: "dql",
        query:
          'TABLE length(rows) AS "件数"\n' +
          'FROM "タスク/詳細"\n' +
          'WHERE status != "完了"\n' +
          'GROUP BY PJT\n' +
          'SORT length(rows) DESC',
      },
    },
    "recent-minutes": {
      type: "dataview",
      title: "💬 最近の議事録 (10件)",
      settings: {
        mode: "dql",
        query:
          'TABLE file.mtime AS "更新"\n' +
          'FROM "議事録"\n' +
          'SORT file.mtime DESC\n' +
          'LIMIT 10',
      },
    },
    "quick-links": {
      type: "markdown",
      title: "🔗 クイックリンク / メモ",
      settings: {
        content:
          "## 主要ノート\n" +
          "- [[自分について]]\n" +
          "- [[ONBOARDING]]\n" +
          "- [[README]]\n\n" +
          "## ダッシュボード操作\n" +
          "- ⚙ で各ウィジェット編集 (入力は自動保存)\n" +
          "- ✎ で並び替え・幅変更モード\n" +
          "- ↻ で個別ウィジェット再読み込み\n" +
          "- タイトル（上の「ホーム」）クリックでリネーム\n\n" +
          "_このメモは自由に書き換えてOK_",
      },
    },
  },
};

let templateOverride: Dashboard | null = null;

// Replace the home template at runtime (e.g. user-defined templates loaded
// from settings or an external JSON). Pass `null` to fall back to the stock
// template bundled with the plugin.
export function setHomeTemplate(template: Dashboard | null): void {
  templateOverride = template;
}

// Returns a deep copy of the active home template so callers can freely mutate
// the result (e.g. rename the title) without corrupting the shared template.
export function getHomeTemplate(title?: string): Dashboard {
  const source = templateOverride ?? STOCK_HOME_TEMPLATE;
  const clone = cloneDashboard(source);
  if (title !== undefined) clone.title = title;
  return clone;
}

export function getStockHomeTemplate(): Dashboard {
  return cloneDashboard(STOCK_HOME_TEMPLATE);
}

function cloneDashboard(d: Dashboard): Dashboard {
  // Templates are pure JSON, so structured cloning via JSON round-trip is
  // sufficient and avoids leaking references between consumers.
  return JSON.parse(JSON.stringify(d)) as Dashboard;
}
