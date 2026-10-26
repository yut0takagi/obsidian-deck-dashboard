import { Notice, Plugin, TextFileView, WorkspaceLeaf } from "obsidian";
import type { Component } from "obsidian";
import { RenderScope } from "./renderScope";
import { VIEW_TYPE_DASHBOARD } from "./constants";
import {
  parseDashboard,
  serializeDashboard,
  createDefaultDashboard,
  DashboardParseError,
} from "./DashboardModel";
import type { Dashboard, LayoutItem, WidgetInstance } from "./types";
import { widgetRegistry } from "../widgets";
import { AddWidgetModal, EditWidgetModal } from "../ui/AddWidgetModal";
import type { DeckHost } from "./settings";
import { t } from "./i18n";

/** The plugin as seen by a dashboard view. */
export type DashboardHost = Plugin & DeckHost;

export class DashboardView extends TextFileView {
  private dashboard: Dashboard = createDefaultDashboard("Untitled");
  private editMode = false;
  private plugin: DashboardHost;
  /** Everything widgets register lives here and is released on re-render. */
  private readonly renders = new RenderScope(this);

  constructor(leaf: WorkspaceLeaf, plugin: DashboardHost) {
    super(leaf);
    this.plugin = plugin;
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
    this.renders.dispose();
    this.containerEl.children[1].empty();
  }

  /** Re-render every widget (e.g. after Settings → Deck changed). */
  refresh(): void {
    this.render();
  }

  toggleEditMode(): void {
    this.editMode = !this.editMode;
    this.render();
  }

  openAddWidget(): void {
    new AddWidgetModal(this.app, (widget) => {
      this.addWidget(widget);
    }).open();
  }

  private addWidget(widget: WidgetInstance): void {
    const id = `w_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000)}`;
    this.dashboard.widgets[id] = widget;
    const nextY = this.dashboard.layout.reduce((max, l) => Math.max(max, l.y + l.h), 0);
    this.dashboard.layout.push({ i: id, x: 0, y: nextY, w: 12, h: 4 });
    this.persist();
    this.render();
  }

  private updateWidget(id: string, next: WidgetInstance): void {
    this.dashboard.widgets[id] = next;
    this.persist();
    this.render();
  }

  private deleteWidget(id: string): void {
    delete this.dashboard.widgets[id];
    this.dashboard.layout = this.dashboard.layout.filter((l) => l.i !== id);
    this.persist();
    this.render();
  }

  private persist(): void {
    this.requestSave();
  }

  private render(): void {
    const container = this.containerEl.children[1] as HTMLElement;
    const renderScope = this.renders.next();
    container.empty();
    container.addClass("deck-dashboard-view");

    const header = container.createDiv({ cls: "nd-header" });
    const titleEl = header.createEl("h1", { cls: "nd-title", text: this.dashboard.title });
    titleEl.contentEditable = "true";
    titleEl.addEventListener("blur", () => {
      const next = (titleEl.textContent ?? "").trim() || "Untitled";
      if (next !== this.dashboard.title) {
        this.dashboard.title = next;
        this.persist();
      }
    });
    titleEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        titleEl.blur();
      }
    });

    const toolbar = header.createDiv({ cls: "nd-toolbar" });
    const addBtn = toolbar.createEl("button", { text: t().dashboardAddWidget, cls: "mod-cta" });
    addBtn.addEventListener("click", () => this.openAddWidget());

    const editBtn = toolbar.createEl("button", {
      text: this.editMode ? t().dashboardViewMode : t().dashboardEditMode,
    });
    editBtn.addEventListener("click", () => this.toggleEditMode());

    const grid = container.createDiv({ cls: "nd-grid" });
    if (this.editMode) grid.addClass("nd-edit");

    const items = this.sortedLayout();
    if (items.length === 0) {
      grid.createEl("p", {
        cls: "nd-empty",
        text: t().dashboardNoWidgetsYetClickAdd,
      });
      return;
    }

    for (const item of items) {
      const widget = this.dashboard.widgets[item.i];
      if (!widget) continue;
      this.renderWidget(grid, item, widget, renderScope);
    }
  }

  private sortedLayout(): LayoutItem[] {
    return [...this.dashboard.layout].sort((a, b) => a.y - b.y || a.x - b.x);
  }

  private renderWidget(
    grid: HTMLElement,
    layout: LayoutItem,
    widget: WidgetInstance,
    renderScope: Component
  ): void {
    const wrap = grid.createDiv({ cls: "nd-widget" });
    wrap.dataset.layoutId = layout.i;
    wrap.style.setProperty("--nd-col-span", String(Math.max(1, Math.min(12, layout.w))));
    // Fixed height — body scrolls internally when content overflows.
    // h is in grid units (80px each).
    const px = `${Math.max(2, layout.h) * 80}px`;
    wrap.style.height = px;
    wrap.style.maxHeight = px;

    // Drag-to-reorder (only when edit mode is on, to avoid accidental moves)
    if (this.editMode) {
      wrap.setAttr("draggable", "true");
      wrap.addClass("nd-widget-draggable");
      wrap.addEventListener("dragstart", (e) => {
        e.dataTransfer?.setData("application/x-nd-widget-id", layout.i);
        if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
        wrap.addClass("nd-widget-dragging");
      });
      wrap.addEventListener("dragend", () => {
        wrap.removeClass("nd-widget-dragging");
        // clean any drop-target classes lingering
        grid.querySelectorAll(".nd-widget-drop-before, .nd-widget-drop-after").forEach((el) => {
          el.removeClass("nd-widget-drop-before");
          el.removeClass("nd-widget-drop-after");
        });
      });
      wrap.addEventListener("dragover", (e) => {
        const types = e.dataTransfer?.types;
        if (!types || !Array.from(types).includes("application/x-nd-widget-id")) return;
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
        // visual hint: top half = before, bottom half = after
        const rect = wrap.getBoundingClientRect();
        const before = e.clientY < rect.top + rect.height / 2;
        wrap.removeClass(before ? "nd-widget-drop-after" : "nd-widget-drop-before");
        wrap.addClass(before ? "nd-widget-drop-before" : "nd-widget-drop-after");
      });
      wrap.addEventListener("dragleave", () => {
        wrap.removeClass("nd-widget-drop-before");
        wrap.removeClass("nd-widget-drop-after");
      });
      wrap.addEventListener("drop", (e) => {
        const sourceId = e.dataTransfer?.getData("application/x-nd-widget-id");
        if (!sourceId || sourceId === layout.i) return;
        e.preventDefault();
        const rect = wrap.getBoundingClientRect();
        const before = e.clientY < rect.top + rect.height / 2;
        this.reorderWidget(sourceId, layout.i, before);
        wrap.removeClass("nd-widget-drop-before");
        wrap.removeClass("nd-widget-drop-after");
      });
    }

    const head = wrap.createDiv({ cls: "nd-widget-head" });
    if (this.editMode) {
      head.createSpan({ cls: "nd-drag-handle", text: "⋮⋮", attr: { title: t().dashboardDragToReorder } });
    }
    const titleEl = head.createEl("div", {
      cls: "nd-widget-title",
      text: widget.title ?? widgetRegistry.get(widget.type)?.label ?? widget.type,
    });
    titleEl.title = widget.type;

    const controls = head.createDiv({ cls: "nd-widget-controls" });
    const refreshBtn = controls.createEl("button", { text: "↻", attr: { title: t().dashboardReload } });
    refreshBtn.addEventListener("click", () => {
      this.render();
    });
    const editBtn = controls.createEl("button", { text: "⚙", attr: { title: t().dashboardEdit } });
    editBtn.addEventListener("click", () => {
      new EditWidgetModal(
        this.app,
        widget,
        (next) => this.updateWidget(layout.i, next),
        () => this.deleteWidget(layout.i)
      ).open();
    });

    if (this.editMode) {
      const widthBtn = controls.createEl("button", { text: "↔", attr: { title: t().dashboardChangeWidth468 } });
      widthBtn.addEventListener("click", () => {
        layout.w = layout.w >= 12 ? 4 : layout.w + 2;
        this.persist();
        this.render();
      });
      const heightBtn = controls.createEl("button", { text: "↕", attr: { title: t().dashboardChangeHeight2WrapsAfter } });
      heightBtn.addEventListener("click", () => {
        layout.h = layout.h >= 16 ? 2 : layout.h + 2;
        this.persist();
        this.render();
      });
      const upBtn = controls.createEl("button", { text: "↑", attr: { title: t().dashboardMoveUp } });
      upBtn.addEventListener("click", () => {
        this.moveWidget(layout.i, -1);
      });
      const downBtn = controls.createEl("button", { text: "↓", attr: { title: t().dashboardMoveDown } });
      downBtn.addEventListener("click", () => {
        this.moveWidget(layout.i, +1);
      });
    }

    const body = wrap.createDiv({ cls: "nd-widget-body" });
    const def = widgetRegistry.get(widget.type);
    if (!def) {
      body.createEl("p", { cls: "nd-empty", text: t().dashboardUnsupportedWidget(widget.type) });
      return;
    }
    const sourcePath = this.file?.path ?? "";
    Promise.resolve(
      def.render(body, widget.settings, {
        app: this.app,
        plugin: this.plugin,
        parent: this.renders.child(renderScope),
        sourcePath,
        settings: this.plugin.settings,
        openSettings: () => this.plugin.openSettings(),
      })
    ).catch((e) => {
      body.createEl("pre", { cls: "nd-error", text: `Render error: ${(e as Error).message}` });
    });
  }

  private moveWidget(id: string, delta: number): void {
    const items = this.sortedLayout();
    const idx = items.findIndex((l) => l.i === id);
    if (idx < 0) return;
    const target = idx + delta;
    if (target < 0 || target >= items.length) return;
    const a = items[idx];
    const b = items[target];
    const ay = a.y;
    a.y = b.y;
    b.y = ay;
    this.persist();
    this.render();
  }

  /**
   * Reorder via D&D: move source widget to be before (or after) target widget,
   * then re-flow y coords so widgets stay in a sensible row order.
   */
  private reorderWidget(sourceId: string, targetId: string, insertBefore: boolean): void {
    if (sourceId === targetId) return;
    const ordered = this.sortedLayout();
    const sourceIdx = ordered.findIndex((l) => l.i === sourceId);
    if (sourceIdx < 0) return;
    const [moved] = ordered.splice(sourceIdx, 1);
    let targetIdx = ordered.findIndex((l) => l.i === targetId);
    if (targetIdx < 0) {
      ordered.push(moved);
    } else {
      if (!insertBefore) targetIdx += 1;
      ordered.splice(targetIdx, 0, moved);
    }
    // Re-flow y coords. Items get sequential y (1 per item) — CSS Grid will pack
    // them visually using x and span. This keeps relative order without trying
    // to pack rows of multiple items at the same y (which would require a true
    // 2D packer).
    ordered.forEach((l, i) => {
      l.y = i;
    });
    this.persist();
    this.render();
  }

  private renderError(message: string): void {
    const container = this.containerEl.children[1] as HTMLElement;
    this.renders.dispose();
    container.empty();
    container.createEl("h2", { text: "Failed to load dashboard" });
    container.createEl("pre", { text: message });
    const retryBtn = container.createEl("button", { text: t().dashboardRegenerateDefaults });
    retryBtn.addEventListener("click", () => {
      this.dashboard = createDefaultDashboard("Untitled");
      this.persist();
      this.render();
      new Notice("Dashboard reset to default");
    });
  }
}
