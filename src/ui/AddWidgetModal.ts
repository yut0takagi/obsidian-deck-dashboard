import { App, Modal, Setting } from "obsidian";
import { widgetRegistry } from "../widgets";
import type { WidgetInstance } from "../core/types";

export class AddWidgetModal extends Modal {
  private onSubmit: (w: WidgetInstance) => void;

  constructor(app: App, onSubmit: (w: WidgetInstance) => void) {
    super(app);
    this.onSubmit = onSubmit;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "ウィジェットを追加" });

    const grid = contentEl.createDiv({ cls: "nd-widget-picker" });
    for (const def of widgetRegistry.all()) {
      const card = grid.createDiv({ cls: "nd-widget-card" });
      card.createEl("h3", { text: def.label });
      card.createEl("p", { text: def.description, cls: "nd-muted" });
      const btn = card.createEl("button", { text: "追加", cls: "mod-cta" });
      btn.addEventListener("click", () => {
        this.onSubmit({
          type: def.type,
          title: def.label,
          settings: def.defaultSettings(),
        });
        this.close();
      });
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export class EditWidgetModal extends Modal {
  private widget: WidgetInstance;
  private onSave: (next: WidgetInstance) => void;
  private onDelete: () => void;
  private dirty = false;
  private deleted = false;

  constructor(
    app: App,
    widget: WidgetInstance,
    onSave: (next: WidgetInstance) => void,
    onDelete: () => void
  ) {
    super(app);
    this.widget = { ...widget, settings: { ...(widget.settings as object) } };
    this.onSave = onSave;
    this.onDelete = onDelete;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    const def = widgetRegistry.get(this.widget.type);
    contentEl.createEl("h2", { text: `編集: ${def?.label ?? this.widget.type}` });

    contentEl.createEl("p", {
      cls: "nd-muted",
      text: "✏ 入力するだけで自動保存されます (閉じるかEscでOK)",
    });

    new Setting(contentEl)
      .setName("タイトル")
      .addText((t) =>
        t.setValue(this.widget.title ?? "").onChange((v) => {
          this.widget.title = v;
          this.dirty = true;
        })
      );

    const settingsBox = contentEl.createDiv({ cls: "nd-settings-box" });
    if (def) {
      def.renderSettingsForm(settingsBox, this.widget.settings, (next) => {
        this.widget.settings = next;
        this.dirty = true;
      });
    } else {
      settingsBox.createEl("p", { text: `不明なウィジェット種別: ${this.widget.type}` });
    }

    const btnRow = contentEl.createDiv({ cls: "nd-btn-row" });
    const deleteBtn = btnRow.createEl("button", { text: "🗑 削除", cls: "mod-warning" });
    deleteBtn.addEventListener("click", () => {
      this.deleted = true;
      this.onDelete();
      this.close();
    });
    const spacer = btnRow.createDiv();
    spacer.style.flex = "1";
    const closeBtn = btnRow.createEl("button", { text: "閉じる", cls: "mod-cta" });
    closeBtn.addEventListener("click", () => {
      this.close();
    });
  }

  onClose(): void {
    if (!this.deleted && this.dirty) {
      this.onSave(this.widget);
    }
    this.contentEl.empty();
  }
}
