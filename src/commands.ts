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
      { i: "welcome", x: 0, y: 0, w: 12, h: 4 },
      { i: "kpi-tasks", x: 0, y: 1, w: 4, h: 3 },
      { i: "kpi-meetings", x: 4, y: 1, w: 4, h: 3 },
      { i: "kpi-knowledge", x: 8, y: 1, w: 4, h: 3 },
      { i: "today-cal", x: 0, y: 2, w: 6, h: 7 },
      { i: "tasks-today", x: 6, y: 2, w: 6, h: 7 },
      { i: "recent-minutes", x: 0, y: 3, w: 6, h: 6 },
      { i: "recent-daily", x: 6, y: 3, w: 6, h: 6 },
    ],
    widgets: {
      welcome: {
        type: "markdown",
        title: "ようこそ",
        settings: {
          content:
            "# ようこそ Notion Dashboard へ\n\n" +
            "このウィジェットは自由に編集できる。⚙アイコンから内容を変更しよう。\n" +
            "- `+ ウィジェット追加` で新しいウィジェットを足す\n" +
            "- `✎ 編集モード` で並び替え・幅変更ができる\n" +
            "- タイトル(上の `ホーム`)をクリックでリネーム",
        },
      },
      "kpi-tasks": {
        type: "counter",
        title: "未完了タスク",
        settings: {
          query: 'LIST FROM "タスク/詳細" WHERE status != "完了"',
          label: "未完了タスク",
          unit: "件",
        },
      },
      "kpi-meetings": {
        type: "counter",
        title: "今月の議事録",
        settings: {
          query: 'LIST FROM "議事録" WHERE file.mday > date(today) - dur(30 days)',
          label: "30日以内の議事録",
          unit: "件",
        },
      },
      "kpi-knowledge": {
        type: "counter",
        title: "ナレッジ件数",
        settings: {
          query: 'LIST FROM "ナレッジ" WHERE !contains(file.name, "ナレッジマップ")',
          label: "ナレッジ総数",
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
        title: "今週のタスク",
        settings: {
          mode: "dql",
          query:
            'TABLE PJT, 期限, 優先度, status\n' +
            'FROM "タスク/詳細"\n' +
            'WHERE status != "完了" AND 期限 != null AND 期限 != "なし"\n' +
            'SORT 期限 ASC\n' +
            'LIMIT 12',
        },
      },
      "recent-minutes": {
        type: "dataview",
        title: "最近の議事録",
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
        title: "最近の日報",
        settings: {
          mode: "dql",
          query:
            'TABLE file.mtime AS "更新"\n' +
            'FROM "日報"\n' +
            'SORT file.mtime DESC\n' +
            'LIMIT 7',
        },
      },
    },
  };
}
