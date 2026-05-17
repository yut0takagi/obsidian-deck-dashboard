import { Setting } from "obsidian";
import type { WidgetDefinition } from "./types";
import { getDataviewApi } from "../adapters/dataview";
import { wireInternalLinks } from "./linkHandler";

interface Settings {
  query: string;
  mode: "dql" | "js";
}

export const dataviewWidget: WidgetDefinition<Settings> = {
  type: "dataview",
  label: "Dataview Query",
  description: "Dataviewの DQL クエリを実行して結果を表示する。",
  defaultSettings: () => ({
    query: "TABLE file.mtime AS \"更新\" FROM \"日報\" SORT file.mtime DESC LIMIT 5",
    mode: "dql",
  }),
  async render(el, settings, ctx) {
    el.empty();
    el.addClass("nd-widget-dataview");
    const dv = getDataviewApi(ctx.app);
    if (!dv) {
      el.createEl("p", { cls: "nd-empty", text: "Dataview プラグインが必要です。" });
      return;
    }
    try {
      if (settings.mode === "dql") {
        await dv.execute(settings.query, el, ctx.parent, ctx.sourcePath);
      } else {
        await dv.executeJs(settings.query, el, ctx.parent, ctx.sourcePath);
      }
      wireInternalLinks(el, ctx.app, ctx.sourcePath);
    } catch (e) {
      const pre = el.createEl("pre", { cls: "nd-error" });
      pre.setText(`Dataview error: ${(e as Error).message}`);
    }
  },
  renderSettingsForm(container, settings, onChange) {
    new Setting(container)
      .setName("モード")
      .setDesc("DQL: Dataviewクエリ言語 / JS: DataviewJS")
      .addDropdown((d) =>
        d
          .addOption("dql", "DQL")
          .addOption("js", "DataviewJS")
          .setValue(settings.mode)
          .onChange((v) => onChange({ ...settings, mode: v as "dql" | "js" }))
      );
    new Setting(container)
      .setName("クエリ")
      .setDesc("Dataview の DQL or JS")
      .addTextArea((t) => {
        t.setValue(settings.query);
        t.inputEl.rows = 8;
        t.inputEl.style.width = "100%";
        t.inputEl.style.fontFamily = "var(--font-monospace)";
        t.onChange((v) => onChange({ ...settings, query: v }));
      });
  },
};
