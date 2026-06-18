import type { App, Component } from "obsidian";

/** Result of `dv.tryQuery` — a narrow surface for the shapes we read. */
export interface DataviewQueryResult {
  values?: { length: number };
  rows?: unknown[];
}

/** Narrow typed surface for the (untyped) Dataview plugin API. */
export interface DataviewApi {
  tryQuery(source: string): Promise<DataviewQueryResult>;
  execute(
    source: string,
    container: HTMLElement,
    component: Component,
    sourcePath: string
  ): Promise<void>;
  executeJs(
    source: string,
    container: HTMLElement,
    component: Component,
    sourcePath: string
  ): Promise<void>;
}

interface DataviewPlugin {
  api?: DataviewApi;
}

interface AppWithPlugins {
  plugins?: { plugins?: Record<string, DataviewPlugin | undefined> };
}

export function getDataviewApi(app: App): DataviewApi | null {
  const plugins = (app as unknown as AppWithPlugins).plugins?.plugins;
  const dv = plugins?.["dataview"];
  return dv?.api ?? null;
}

export function isDataviewInstalled(app: App): boolean {
  return getDataviewApi(app) !== null;
}
