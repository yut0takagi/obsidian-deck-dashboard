import { MarkdownRenderer, Setting, TFile } from "obsidian";
import type { WidgetDefinition } from "./types";
import { wireInternalLinks } from "./linkHandler";
import { t } from "../core/i18n";

interface Settings {
  notePath: string;
  maxLines: number;
}

export const noteEmbedWidget: WidgetDefinition<Settings> = {
  type: "note",
  label: "Note Embed",
  description: t().noteEmbedPreviewANoteFromYour,
  defaultSettings: () => ({ notePath: "", maxLines: 30 }),
  async render(el, settings, ctx) {
    el.empty();
    el.addClass("nd-widget-note");
    if (!settings.notePath) {
      el.createEl("p", { cls: "nd-empty", text: t().noteEmbedNoNotePathConfiguredChoose });
      return;
    }
    const file = ctx.app.vault.getAbstractFileByPath(settings.notePath);
    if (!(file instanceof TFile)) {
      el.createEl("p", { cls: "nd-empty", text: t().noteEmbedNoteNotFound(settings.notePath) });
      return;
    }
    const header = el.createDiv({ cls: "nd-note-header" });
    const link = header.createEl("a", { text: file.basename, cls: "internal-link" });
    link.addEventListener("click", (e) => {
      e.preventDefault();
      void ctx.app.workspace.openLinkText(file.path, "", false);
    });
    const body = el.createDiv({ cls: "nd-note-body" });
    const raw = await ctx.app.vault.cachedRead(file);
    const lines = raw.split("\n").slice(0, settings.maxLines).join("\n");
    await MarkdownRenderer.render(ctx.app, lines, body, file.path, ctx.parent);
    wireInternalLinks(body, ctx.app, file.path);
  },
  renderSettingsForm(container, settings, onChange) {
    new Setting(container)
      .setName(t().noteEmbedNotePath)
      .setDesc(t().noteEmbedPathRelativeToTheVault)
      .addText((t) =>
        t.setValue(settings.notePath).onChange((v) => onChange({ ...settings, notePath: v }))
      );
    new Setting(container)
      .setName(t().noteEmbedMaximumLines)
      .setDesc(t().noteEmbedMaximumNumberOfLinesShown)
      .addText((t) =>
        t.setValue(String(settings.maxLines)).onChange((v) => {
          const n = parseInt(v, 10);
          if (!isNaN(n) && n > 0) onChange({ ...settings, maxLines: n });
        })
      );
  },
};
