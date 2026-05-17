import { Notice, Setting, TFile, normalizePath } from "obsidian";
import type { WidgetDefinition, WidgetContext } from "./types";

interface Settings {
  folder: string;
  defaultPjt: string;
  defaultPriority: string;
  defaultStatus: string;
  defaultLabel: string;
  defaultDuration: string;
}

export const taskCreatorWidget: WidgetDefinition<Settings> = {
  type: "task-creator",
  label: "Task Creator (新規タスク追加)",
  description: "フォームから frontmatter付きタスクノートを作成する。Kanban/Ganttに即反映。",
  defaultSettings: () => ({
    folder: "タスク/詳細",
    defaultPjt: "",
    defaultPriority: "Medium",
    defaultStatus: "未着手",
    defaultLabel: "作成",
    defaultDuration: "2h",
  }),
  async render(el, settings, ctx) {
    el.empty();
    el.addClass("nd-widget-task-creator");
    renderForm(el, settings, ctx);
  },
  renderSettingsForm(container, settings, onChange) {
    new Setting(container).setName("保存先フォルダ").addText((t) =>
      t.setValue(settings.folder).onChange((v) =>
        onChange({ ...settings, folder: v.trim() || "タスク/詳細" })
      )
    );
    new Setting(container).setName("デフォルト PJT").addText((t) =>
      t.setValue(settings.defaultPjt).onChange((v) => onChange({ ...settings, defaultPjt: v }))
    );
    new Setting(container).setName("デフォルト 優先度").addDropdown((d) =>
      d
        .addOption("Urgent", "Urgent")
        .addOption("High", "High")
        .addOption("Medium", "Medium")
        .addOption("Low", "Low")
        .setValue(settings.defaultPriority)
        .onChange((v) => onChange({ ...settings, defaultPriority: v }))
    );
    new Setting(container).setName("デフォルト status").addDropdown((d) =>
      d
        .addOption("未着手", "未着手")
        .addOption("作業中", "作業中")
        .addOption("レビュー待ち", "レビュー待ち")
        .addOption("完了", "完了")
        .setValue(settings.defaultStatus)
        .onChange((v) => onChange({ ...settings, defaultStatus: v }))
    );
    new Setting(container).setName("デフォルト ラベル").addText((t) =>
      t.setValue(settings.defaultLabel).onChange((v) => onChange({ ...settings, defaultLabel: v }))
    );
    new Setting(container).setName("デフォルト 工数").addText((t) =>
      t
        .setValue(settings.defaultDuration)
        .onChange((v) => onChange({ ...settings, defaultDuration: v }))
    );
  },
};

interface FormState {
  title: string;
  pjt: string;
  deadline: string;
  priority: string;
  status: string;
  label: string;
  duration: string;
}

function renderForm(el: HTMLElement, settings: Settings, ctx: WidgetContext): void {
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 86400000);
  const isoTomorrow = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;

  const state: FormState = {
    title: "",
    pjt: settings.defaultPjt,
    deadline: isoTomorrow,
    priority: settings.defaultPriority,
    status: settings.defaultStatus,
    label: settings.defaultLabel,
    duration: settings.defaultDuration,
  };

  const form = el.createDiv({ cls: "nd-task-form" });

  // Title (large, focused)
  const titleRow = form.createDiv({ cls: "nd-task-row" });
  const titleInput = titleRow.createEl("input", {
    cls: "nd-task-title-input",
    attr: { type: "text", placeholder: "タスク名 (例: 作成 提案スライド)" },
  });
  titleInput.addEventListener("input", () => (state.title = titleInput.value));
  titleInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
  });

  // Compact row with key fields
  const fieldsRow = form.createDiv({ cls: "nd-task-fields" });

  mkLabeledInput(fieldsRow, "PJT", state.pjt, (v) => (state.pjt = v), "PJT名");
  mkLabeledInput(fieldsRow, "期限", state.deadline, (v) => (state.deadline = v), "YYYY-MM-DD or なし");

  const prioCell = mkLabeled(fieldsRow, "優先度");
  const prioSel = prioCell.createEl("select", { cls: "nd-task-select" });
  for (const v of ["Urgent", "High", "Medium", "Low"]) {
    const opt = prioSel.createEl("option", { text: v });
    opt.value = v;
    if (v === state.priority) opt.selected = true;
  }
  prioSel.addEventListener("change", () => (state.priority = prioSel.value));

  const statusCell = mkLabeled(fieldsRow, "status");
  const statusSel = statusCell.createEl("select", { cls: "nd-task-select" });
  for (const v of ["未着手", "作業中", "レビュー待ち", "完了"]) {
    const opt = statusSel.createEl("option", { text: v });
    opt.value = v;
    if (v === state.status) opt.selected = true;
  }
  statusSel.addEventListener("change", () => (state.status = statusSel.value));

  mkLabeledInput(fieldsRow, "ラベル", state.label, (v) => (state.label = v), "作成/設計...");
  mkLabeledInput(fieldsRow, "工数", state.duration, (v) => (state.duration = v), "30m/1h/1d/1w");

  // Submit
  const btnRow = form.createDiv({ cls: "nd-task-btn-row" });
  const submitBtn = btnRow.createEl("button", { cls: "mod-cta", text: "＋ タスク追加" });
  submitBtn.addEventListener("click", submit);
  const hint = btnRow.createSpan({ cls: "nd-muted nd-task-hint", text: "⌘+Enter でも追加" });
  void hint;

  setTimeout(() => titleInput.focus(), 50);

  async function submit(): Promise<void> {
    const title = state.title.trim();
    if (!title) {
      new Notice("タスク名を入力してください");
      titleInput.focus();
      return;
    }
    const folder = normalizePath(settings.folder);
    if (!ctx.app.vault.getAbstractFileByPath(folder)) {
      await ctx.app.vault.createFolder(folder);
    }
    const filename = sanitize(title) + ".md";
    let path = `${folder}/${filename}`;
    let i = 2;
    while (ctx.app.vault.getAbstractFileByPath(path)) {
      path = `${folder}/${sanitize(title)} ${i}.md`;
      i++;
    }
    const fm = [
      "---",
      `PJT: ${state.pjt || "なし"}`,
      `期限: ${state.deadline || "なし"}`,
      `優先度: ${state.priority}`,
      `ラベル: ${state.label || "なし"}`,
      `status: ${state.status}`,
      `工数: ${state.duration || "1h"}`,
      `depends: なし`,
      "---",
      "",
      `# ${title}`,
      "",
    ].join("\n");
    const file = await ctx.app.vault.create(path, fm);
    new Notice(`✅ 追加: ${title}`);
    // Reset title only — keep other defaults for batch entry
    titleInput.value = "";
    state.title = "";
    titleInput.focus();
    void file;
  }
}

function mkLabeled(parent: HTMLElement, label: string): HTMLElement {
  const cell = parent.createDiv({ cls: "nd-task-cell" });
  cell.createSpan({ cls: "nd-task-cell-label", text: label });
  return cell;
}

function mkLabeledInput(
  parent: HTMLElement,
  label: string,
  value: string,
  onChange: (v: string) => void,
  placeholder?: string
): HTMLInputElement {
  const cell = mkLabeled(parent, label);
  const input = cell.createEl("input", { cls: "nd-task-input", attr: { type: "text" } });
  input.value = value;
  if (placeholder) input.placeholder = placeholder;
  input.addEventListener("input", () => onChange(input.value));
  return input;
}

function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").trim() || "Untitled";
}
