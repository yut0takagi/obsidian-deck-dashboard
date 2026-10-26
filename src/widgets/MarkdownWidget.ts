import { MarkdownRenderer, Setting } from "obsidian";
import type { WidgetDefinition } from "./types";
import { wireInternalLinks } from "./linkHandler";
import { t } from "../core/i18n";

interface Settings {
  content: string;
}

export const markdownWidget: WidgetDefinition<Settings> = {
  type: "markdown",
  label: "Markdown",
  description: t().markdownAFreeformMarkdownNoteWith,
  defaultSettings: () => ({
    content: t().markdownNotesWriteHereUseNote,
  }),
  async render(el, settings, ctx) {
    el.empty();
    el.addClass("nd-widget-markdown");
    await MarkdownRenderer.render(ctx.app, settings.content, el, ctx.sourcePath, ctx.parent);
    wireInternalLinks(el, ctx.app, ctx.sourcePath);
  },
  renderSettingsForm(container, settings, onChange) {
    new Setting(container)
      .setName(t().markdownContent)
      .setDesc("Markdown")
      .addTextArea((t) => {
        t.setValue(settings.content);
        t.inputEl.rows = 10;
        t.inputEl.addClass("deck-input-full");
        t.onChange((v) => onChange({ ...settings, content: v }));
      });
  },
};
