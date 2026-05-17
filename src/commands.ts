import { Notice, Plugin, TFile, normalizePath } from "obsidian";
import {
  DASHBOARD_EXTENSION,
  DEFAULT_DASHBOARD_FOLDER,
  DEFAULT_HOME_FILENAME,
  VIEW_TYPE_DASHBOARD,
} from "./core/constants";
import {
  createDefaultDashboard,
  serializeDashboard,
} from "./core/DashboardModel";
import type { Dashboard } from "./core/types";
import { DashboardView } from "./core/DashboardView";
import { GoogleOAuth } from "./auth/googleOAuth";
import { GoogleAuthModal } from "./ui/GoogleAuthModal";
import { listCalendars } from "./adapters/googleCalendar";

export function registerCommands(plugin: Plugin): void {
  plugin.addCommand({
    id: "create-new",
    name: "Create new dashboard",
    callback: async () => {
      await createNewDashboard(plugin, "Untitled", createDefaultDashboard("Untitled"));
    },
  });

  plugin.addCommand({
    id: "open-home",
    name: "Open home dashboard",
    callback: async () => {
      await openHomeDashboard(plugin);
    },
  });

  plugin.addCommand({
    id: "add-widget",
    name: "Add widget to active dashboard",
    checkCallback: (checking) => {
      const view = activeDashboardView(plugin);
      if (checking) return !!view;
      view?.openAddWidget();
      return true;
    },
  });

  plugin.addCommand({
    id: "toggle-edit",
    name: "Toggle dashboard edit mode",
    checkCallback: (checking) => {
      const view = activeDashboardView(plugin);
      if (checking) return !!view;
      view?.toggleEditMode();
      return true;
    },
  });

  plugin.addCommand({
    id: "google-auth",
    name: "Google Calendar: Authenticate / setup credentials",
    callback: () => {
      new GoogleAuthModal(plugin.app, new GoogleOAuth(plugin)).open();
    },
  });

  plugin.addCommand({
    id: "google-signout",
    name: "Google Calendar: Sign out",
    callback: async () => {
      await new GoogleOAuth(plugin).clearTokens();
      new Notice("Google Calendar からサインアウトしました");
    },
  });

  plugin.addCommand({
    id: "google-list-calendars",
    name: "Google Calendar: List calendars (for calendarId lookup)",
    callback: async () => {
      try {
        const oauth = new GoogleOAuth(plugin);
        const cals = await listCalendars(oauth);
        const lines = cals.map(
          (c) => `${c.primary ? "★" : "  "} ${c.summary}\n   → ${c.id}`
        );
        new Notice(`カレンダー一覧 (${cals.length}件) — コンソールに出力`);
        // eslint-disable-next-line no-console
        console.log("[Notion Dashboard] Google Calendars:\n" + lines.join("\n\n"));
      } catch (e) {
        new Notice(`取得失敗: ${(e as Error).message}`);
      }
    },
  });
}

function activeDashboardView(plugin: Plugin): DashboardView | null {
  const leaf = plugin.app.workspace.getActiveViewOfType(DashboardView as any);
  return (leaf as DashboardView | null) ?? null;
}

async function createNewDashboard(
  plugin: Plugin,
  baseTitle: string,
  initial: Dashboard
): Promise<TFile> {
  const folder = normalizePath(DEFAULT_DASHBOARD_FOLDER);
  if (!plugin.app.vault.getAbstractFileByPath(folder)) {
    await plugin.app.vault.createFolder(folder);
  }
  const baseName = sanitizeFilename(baseTitle);
  const path = await uniquePath(
    plugin,
    `${folder}/${baseName}.${DASHBOARD_EXTENSION}`
  );
  const file = await plugin.app.vault.create(path, serializeDashboard(initial));
  await openInDashboardView(plugin, file);
  new Notice(`Dashboard created: ${file.path}`);
  return file;
}

async function openHomeDashboard(plugin: Plugin): Promise<void> {
  const folder = normalizePath(DEFAULT_DASHBOARD_FOLDER);
  const homePath = `${folder}/${DEFAULT_HOME_FILENAME}.${DASHBOARD_EXTENSION}`;
  let file = plugin.app.vault.getAbstractFileByPath(homePath);
  if (!(file instanceof TFile)) {
    if (!plugin.app.vault.getAbstractFileByPath(folder)) {
      await plugin.app.vault.createFolder(folder);
    }
    file = await plugin.app.vault.create(
      homePath,
      serializeDashboard(buildSampleHome())
    );
    new Notice(`Home dashboard created at ${homePath}`);
  }
  await openInDashboardView(plugin, file as TFile);
}

async function openInDashboardView(plugin: Plugin, file: TFile): Promise<void> {
  // .dashboard is registered to VIEW_TYPE_DASHBOARD via registerExtensions,
  // so openFile routes to DashboardView automatically.
  const leaf = plugin.app.workspace.getLeaf(false);
  await leaf.openFile(file);
  plugin.app.workspace.revealLeaf(leaf);
}

async function uniquePath(plugin: Plugin, desired: string): Promise<string> {
  if (!plugin.app.vault.getAbstractFileByPath(desired)) return desired;
  const dot = desired.lastIndexOf(".");
  const stem = desired.slice(0, dot);
  const ext = desired.slice(dot);
  let i = 2;
  while (plugin.app.vault.getAbstractFileByPath(`${stem} ${i}${ext}`)) i++;
  return `${stem} ${i}${ext}`;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").trim() || "Untitled";
}

function buildSampleHome(): Dashboard {
  return {
    version: 1,
    title: "ホーム",
    layout: [
      // Row 1: Today (4) + 3 KPI (8)
      { i: "today", x: 0, y: 0, w: 4, h: 4 },
      { i: "kpi-overdue", x: 4, y: 0, w: 2, h: 2 },
      { i: "kpi-today", x: 6, y: 0, w: 2, h: 2 },
      { i: "kpi-week", x: 8, y: 0, w: 2, h: 2 },
      { i: "kpi-meetings", x: 10, y: 0, w: 2, h: 2 },
      // Row 1b: 2 quick-status under KPI
      { i: "kpi-tasks", x: 4, y: 1, w: 4, h: 2 },
      { i: "kpi-knowledge", x: 8, y: 1, w: 4, h: 2 },
      // Row 2: Today's schedule + today/overdue tasks
      { i: "today-cal", x: 0, y: 2, w: 6, h: 7 },
      { i: "tasks-today", x: 6, y: 2, w: 6, h: 7 },
      // Row 3: This week's deadlines + project status
      { i: "tasks-week", x: 0, y: 3, w: 6, h: 5 },
      { i: "tasks-by-pjt", x: 6, y: 3, w: 6, h: 5 },
      // Row 4: Recent activity
      { i: "recent-minutes", x: 0, y: 4, w: 6, h: 5 },
      { i: "recent-daily", x: 6, y: 4, w: 6, h: 5 },
      // Row 5: Quick links
      { i: "quick-links", x: 0, y: 5, w: 12, h: 4 },
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
      "kpi-tasks": {
        type: "counter",
        title: "未完了タスク総数",
        settings: {
          query: 'LIST FROM "タスク/詳細" WHERE status != "完了"',
          label: "📝 未完了タスク",
          unit: "件",
        },
      },
      "kpi-knowledge": {
        type: "counter",
        title: "ナレッジ件数",
        settings: {
          query: 'LIST FROM "ナレッジ" WHERE !contains(file.name, "ナレッジマップ")',
          label: "📚 ナレッジ",
          unit: "件",
        },
      },
      "today-cal": {
        type: "gcal",
        title: "今週の予定",
        settings: {
          calendarId: "primary",
          windowDays: 7,
          maxEvents: 50,
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
            'SORT date(期限) ASC',
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
      "recent-daily": {
        type: "dataview",
        title: "📝 最近の日報 (7件)",
        settings: {
          mode: "dql",
          query:
            'TABLE file.mtime AS "更新"\n' +
            'FROM "日報"\n' +
            'SORT file.mtime DESC\n' +
            'LIMIT 7',
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
}
