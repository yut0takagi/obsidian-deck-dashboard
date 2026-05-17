import type { App, Component } from "obsidian";

export interface WidgetContext {
  app: App;
  parent: Component;
  sourcePath: string;
}

export interface WidgetDefinition<TSettings = unknown> {
  type: string;
  label: string;
  description: string;
  defaultSettings: () => TSettings;
  render(el: HTMLElement, settings: TSettings, ctx: WidgetContext): void | Promise<void>;
  renderSettingsForm(container: HTMLElement, settings: TSettings, onChange: (next: TSettings) => void): void;
}
