import { TextFileView, WorkspaceLeaf } from "obsidian";
import { VIEW_TYPE_DASHBOARD } from "./constants";
import {
  parseDashboard,
  serializeDashboard,
  createDefaultDashboard,
  DashboardParseError,
} from "./DashboardModel";
import type { Dashboard } from "./types";

export class DashboardView extends TextFileView {
  private dashboard: Dashboard = createDefaultDashboard("Untitled");

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_DASHBOARD;
  }

  getDisplayText(): string {
    return this.dashboard.title || this.file?.basename || "Dashboard";
  }

  getIcon(): string {
    return "layout-dashboard";
  }

  setViewData(data: string, _clear: boolean): void {
    try {
      this.dashboard = parseDashboard(data);
    } catch (e) {
      if (e instanceof DashboardParseError) {
        this.renderError(e.message);
        return;
      }
      throw e;
    }
    this.render();
  }

  getViewData(): string {
    return serializeDashboard(this.dashboard);
  }

  clear(): void {
    this.dashboard = createDefaultDashboard("Untitled");
  }

  async onOpen(): Promise<void> {
    this.render();
  }

  async onClose(): Promise<void> {
    this.containerEl.children[1].empty();
  }

  private render(): void {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("notion-dashboard-view");

    const header = container.createDiv({ cls: "notion-dashboard-header" });
    header.createEl("h1", { text: this.dashboard.title });

    const body = container.createDiv({ cls: "notion-dashboard-body" });
    if (Object.keys(this.dashboard.widgets).length === 0) {
      body.createEl("p", {
        cls: "notion-dashboard-empty",
        text: "No widgets yet. Use the command palette → \"Dashboard: Add widget\" (coming in Phase 2).",
      });
    }
  }

  private renderError(message: string): void {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.createEl("h2", { text: "Failed to load dashboard" });
    container.createEl("pre", { text: message });
  }
}
