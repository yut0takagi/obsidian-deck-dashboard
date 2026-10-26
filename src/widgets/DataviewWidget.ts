import { Setting } from "obsidian";
import type { WidgetDefinition } from "./types";
import { getDataviewApi } from "../adapters/dataview";
import { wireInternalLinks } from "./linkHandler";
import { renderTokenNotice } from "./tokenNotice";
import { expandFolderTokens } from "../core/pathTokens";
import { t } from "../core/i18n";

interface Settings {
  query: string;
  mode: "dql" | "js";
}

export const dataviewWidget: WidgetDefinition<Settings> = {
  type: "dataview",
  label: "Dataview Query",
  description: t().dataviewRunADataviewDqlQuery,
  defaultSettings: () => ({
    query: 'TABLE file.mtime AS "Updated" SORT file.mtime DESC LIMIT 5',
    mode: "dql",
  }),
  async render(el, settings, ctx) {
    el.empty();
    el.addClass("nd-widget-dataview");
    const dv = getDataviewApi(ctx.app);
    if (!dv) {
      el.createEl("p", { cls: "nd-empty", text: t().dataviewTheDataviewPluginIsRequired });
      return;
    }
    const expanded = expandFolderTokens(settings.query, ctx.settings);
    if (!expanded.ok) {
      renderTokenNotice(el, ctx, expanded.missing);
      return;
    }
    try {
      if (settings.mode === "dql") {
        await dv.execute(expanded.query, el, ctx.parent, ctx.sourcePath);
      } else {
        await dv.executeJs(expanded.query, el, ctx.parent, ctx.sourcePath);
      }
      wireInternalLinks(el, ctx.app, ctx.sourcePath);
    } catch (e) {
      const pre = el.createEl("pre", { cls: "nd-error" });
      pre.setText(`Dataview error: ${(e as Error).message}`);
    }
  },
  renderSettingsForm(container, settings, onChange) {
    new Setting(container)
      .setName(t().dataviewMode)
      .setDesc(t().dataviewDqlDataviewQueryLanguageJs)
      .addDropdown((d) =>
        d
          .addOption("dql", "DQL")
          .addOption("js", "DataviewJS")
          .setValue(settings.mode)
          .onChange((v) => onChange({ ...settings, mode: v as "dql" | "js" }))
      );
    new Setting(container)
      .setName(t().dataviewQuery)
      .setDesc(t().dataviewDataviewDqlOrJsTaskfolder)
      .addTextArea((t) => {
        t.setValue(settings.query);
        t.inputEl.rows = 8;
        t.inputEl.addClass("deck-input-full");
        t.inputEl.addClass("deck-input-mono");
        t.onChange((v) => onChange({ ...settings, query: v }));
      });
  },
};
