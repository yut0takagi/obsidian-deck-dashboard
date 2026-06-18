import { Plugin } from "obsidian";
import { DashboardView } from "./core/DashboardView";
import { MailView } from "./core/MailView";
import {
  DASHBOARD_EXTENSION,
  VIEW_TYPE_DASHBOARD,
  VIEW_TYPE_MAIL,
} from "./core/constants";
import { registerCommands } from "./commands";
import { registerBuiltinWidgets } from "./widgets";
import { getAISessionRegistry } from "./core/AISessionRegistry";
import { AISessionListModal } from "./ui/AISessionListModal";
import { AutoSyncWatcher } from "./sync/autoSyncWatcher";
import { SyncSettingsTab } from "./ui/SyncSettingsTab";

export default class NotionDashboardPlugin extends Plugin {
  private aiStatusBar: HTMLElement | null = null;
  private aiUnsubscribe: (() => void) | null = null;

  async onload(): Promise<void> {
    registerBuiltinWidgets();

    this.registerView(VIEW_TYPE_DASHBOARD, (leaf) => new DashboardView(leaf, this));
    this.registerView(VIEW_TYPE_MAIL, (leaf) => new MailView(leaf, this));
    this.registerExtensions([DASHBOARD_EXTENSION], VIEW_TYPE_DASHBOARD);

    registerCommands(this);

    this.addRibbonIcon("layout-dashboard", "Open home dashboard", () => {
      (this.app as any).commands.executeCommandById("notion-dashboard:open-home");
    });
    this.addRibbonIcon("mail", "メールを開く", () => {
      (this.app as any).commands.executeCommandById("notion-dashboard:open-mail");
    });

    this.installAIStatusBar();

    // Settings tab (Settings → Community plugins → Notion Dashboard)
    this.addSettingTab(new SyncSettingsTab(this.app, this));

    // Auto-sync watcher (タスク/詳細/*.md modifications → debounced Sheets sync)
    const watcher = new AutoSyncWatcher(this, this.app);
    void watcher.install();
  }

  async onunload(): Promise<void> {
    if (this.aiUnsubscribe) {
      this.aiUnsubscribe();
      this.aiUnsubscribe = null;
    }
    // The status bar element is auto-cleaned by Obsidian when the plugin
    // unloads (`addStatusBarItem` registers it for cleanup).
    this.aiStatusBar = null;
  }

  private installAIStatusBar(): void {
    const item = this.addStatusBarItem();
    item.addClass("nd-ai-statusbar");
    item.setAttribute("aria-label", "AI移譲セッション");
    item.addEventListener("click", () => {
      const vaultRoot = (this.app.vault.adapter as any).getBasePath?.() as string | undefined;
      new AISessionListModal({
        app: this.app,
        vaultRoot: vaultRoot ?? "",
      }).open();
    });
    this.aiStatusBar = item;

    const registry = getAISessionRegistry();
    this.aiUnsubscribe = registry.onChange(() => this.refreshAIStatusBar());
    this.refreshAIStatusBar();
  }

  private refreshAIStatusBar(): void {
    if (!this.aiStatusBar) return;
    const registry = getAISessionRegistry();
    const running = registry.listRunning();
    const total = registry.list().length;

    this.aiStatusBar.empty();
    if (total === 0) {
      this.aiStatusBar.addClass("nd-ai-statusbar-empty");
      this.aiStatusBar.setText("🤖");
      this.aiStatusBar.setAttribute("aria-label", "AI移譲: アクティブなセッションなし");
      return;
    }
    this.aiStatusBar.removeClass("nd-ai-statusbar-empty");
    if (running.length > 0) this.aiStatusBar.addClass("nd-ai-statusbar-running");
    else this.aiStatusBar.removeClass("nd-ai-statusbar-running");

    const icon = running.length > 0 ? "⚡" : "🤖";
    const label =
      running.length > 0
        ? `${icon} AI ${running.length}実行中`
        : `${icon} AI ${total}件`;
    this.aiStatusBar.setText(label);
    this.aiStatusBar.setAttribute(
      "aria-label",
      `AI移譲: 実行中 ${running.length}件 / 合計 ${total}件`
    );
  }
}
