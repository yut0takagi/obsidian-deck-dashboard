import { MarkdownRenderer, Setting, TFile } from "obsidian";
import type { WidgetDefinition } from "./types";
import { wireInternalLinks } from "./linkHandler";

interface Settings {
  notePath: string;
  maxLines: number;
}

export const noteEmbedWidget: WidgetDefinition<Settings> = {
  type: "note",
  label: "Note Embed",
  description: "任意のノートをプレビュー表示する。",
  defaultSettings: () => ({ notePath: "", maxLines: 30 }),
  async render(el, settings, ctx) {
    el.empty();
    el.addClass("nd-widget-note");
    if (!settings.notePath) {
      el.createEl("p", { cls: "nd-empty", text: "ノートパスが未設定です。設定から指定してください。" });
      return;
    }
    const file = ctx.app.vault.getAbstractFileByPath(settings.notePath);
    if (!(file instanceof TFile)) {
      el.createEl("p", { cls: "nd-empty", text: `ノートが見つかりません: ${settings.notePath}` });
      return;
    }
    const header = el.createDiv({ cls: "nd-note-header" });
    const link = header.createEl("a", { text: file.basename, cls: "internal-link" });
    link.addEventListener("click", (e) => {
      e.preventDefault();
      ctx.app.workspace.openLinkText(file.path, "", false);
    });
    const body = el.createDiv({ cls: "nd-note-body" });
    const raw = await ctx.app.vault.cachedRead(file);
    const lines = raw.split("\n").slice(0, settings.maxLines).join("\n");
    await MarkdownRenderer.render(ctx.app, lines, body, file.path, ctx.parent);
    wireInternalLinks(body, ctx.app, file.path);
  },
  renderSettingsForm(container, settings, onChange) {
    new Setting(container)
      .setName("ノートパス")
      .setDesc("vaultルートからの相対パス (例: 自分について.md)")
      .addText((t) =>
        t.setValue(settings.notePath).onChange((v) => onChange({ ...settings, notePath: v }))
      );
    new Setting(container)
      .setName("最大行数")
      .setDesc("プレビューに表示する最大行数")
      .addText((t) =>
        t.setValue(String(settings.maxLines)).onChange((v) => {
          const n = parseInt(v, 10);
          if (!isNaN(n) && n > 0) onChange({ ...settings, maxLines: n });
        })
      );
  },
};
