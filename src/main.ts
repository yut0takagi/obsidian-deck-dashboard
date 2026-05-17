import { Plugin } from "obsidian";
import { DashboardView } from "./core/DashboardView";
import {
  DASHBOARD_EXTENSION,
  VIEW_TYPE_DASHBOARD,
} from "./core/constants";
import { registerCommands } from "./commands";
import { registerBuiltinWidgets } from "./widgets";

export default class NotionDashboardPlugin extends Plugin {
  async onload(): Promise<void> {
    registerBuiltinWidgets();

    this.registerView(VIEW_TYPE_DASHBOARD, (leaf) => new DashboardView(leaf, this));
    this.registerExtensions([DASHBOARD_EXTENSION], VIEW_TYPE_DASHBOARD);

    registerCommands(this);

    this.addRibbonIcon("layout-dashboard", "Open home dashboard", () => {
      (this.app as any).commands.executeCommandById("notion-dashboard:open-home");
    });
  }

  async onunload(): Promise<void> {
    // registerView and registerExtensions are auto-cleaned by Plugin lifecycle.
  }
}
