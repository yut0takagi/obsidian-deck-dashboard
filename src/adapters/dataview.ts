import type { App } from "obsidian";

export function getDataviewApi(app: App): any | null {
  const plugins = (app as any).plugins?.plugins;
  const dv = plugins?.["dataview"];
  return dv?.api ?? null;
}

export function isDataviewInstalled(app: App): boolean {
  return getDataviewApi(app) !== null;
}
