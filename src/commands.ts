import { Notice, Plugin, TFile, normalizePath } from "obsidian";
import {
  DASHBOARD_EXTENSION,
  DEFAULT_DASHBOARD_FOLDER,
  DEFAULT_HOME_FILENAME,
} from "./core/constants";
import { createDefaultDashboard, serializeDashboard } from "./core/DashboardModel";

export function registerCommands(plugin: Plugin): void {
  plugin.addCommand({
    id: "create-new",
    name: "Create new dashboard",
    callback: async () => {
      await createNewDashboard(plugin, "Untitled");
    },
  });

  plugin.addCommand({
    id: "open-home",
    name: "Open home dashboard",
    callback: async () => {
      await openHomeDashboard(plugin);
    },
  });
}

async function createNewDashboard(plugin: Plugin, title: string): Promise<TFile> {
  const folder = normalizePath(DEFAULT_DASHBOARD_FOLDER);
  if (!plugin.app.vault.getAbstractFileByPath(folder)) {
    await plugin.app.vault.createFolder(folder);
  }
  const baseName = sanitizeFilename(title);
  const path = await uniquePath(plugin, `${folder}/${baseName}.${DASHBOARD_EXTENSION}`);
  const file = await plugin.app.vault.create(path, serializeDashboard(createDefaultDashboard(title)));
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
      serializeDashboard(createDefaultDashboard(DEFAULT_HOME_FILENAME))
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
