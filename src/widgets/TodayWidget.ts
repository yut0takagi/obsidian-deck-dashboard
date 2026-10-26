import { Setting, TFile, moment } from "obsidian";
import type { WidgetDefinition } from "./types";
import { readCoreDailyNotes, resolveDailyNote, type DailyFormat } from "../core/dailyNote";
import { t } from "../core/i18n";
import { renderFolderNotice } from "./setupNotice";
import { safeVaultPath } from "../core/safePath";

interface Settings {
  /** Empty = Settings → Deck, then the core Daily notes plugin. */
  dailyFolder: string;
  dailyFormat: DailyFormat;
  greeting: string;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export const todayWidget: WidgetDefinition<Settings> = {
  type: "today",
  label: t().todayTodayDate,
  description: t().todayTodaySDateAndWeekday,
  defaultSettings: () => ({
    dailyFolder: "",
    dailyFormat: "YYYY-MM-DD",
    greeting: "",
  }),
  render(el, settings, ctx) {
    el.empty();
    el.addClass("nd-widget-today");
    const now = new Date();
    const wd = t().weekdaysShort[now.getDay()];

    const wrap = el.createDiv({ cls: "nd-today-wrap" });

    if (settings.greeting) {
      wrap.createDiv({ cls: "nd-today-greeting", text: settings.greeting });
    }

    const dateLine = wrap.createDiv({ cls: "nd-today-date" });
    dateLine.createSpan({ cls: "nd-today-month", text: t().todayMonth(now.getMonth() + 1) });
    dateLine.createSpan({ cls: "nd-today-day", text: String(now.getDate()) });
    dateLine.createSpan({ cls: "nd-today-weekday", text: `(${wd})` });

    wrap.createDiv({
      cls: "nd-today-year",
      text: `${now.getFullYear()}/${pad(now.getMonth() + 1)}/${pad(now.getDate())}`,
    });

    // Daily note link
    const linkRow = wrap.createDiv({ cls: "nd-today-links" });
    const target = resolveDailyNote({
      widgetFolder: settings.dailyFolder,
      widgetFormat: settings.dailyFormat,
      settingsFolder: ctx.settings.dailyNotesFolder,
      core: readCoreDailyNotes(ctx.app),
      now,
      formatMoment: (fmt) => moment(now).format(fmt),
    });
    if (target.kind === "unset") {
      renderFolderNotice(linkRow, ctx, t().dailyFolderName);
      return;
    }
    // The folder may come from a .dashboard file: only paths inside the vault.
    const safe = safeVaultPath(target.path, "");
    if (!safe.ok) {
      linkRow.createEl("p", { cls: "nd-error", text: `Daily note path refused: ${safe.reason}` });
      return;
    }
    const dailyPath = safe.path;
    const existing = ctx.app.vault.getAbstractFileByPath(dailyPath);
    const dailyLink = linkRow.createEl("a", {
      cls: "nd-today-daily-link",
      text: existing instanceof TFile ? t().todayOpenTodaySNote : t().todayCreateTodaySNote,
    });
    dailyLink.addEventListener("click", (e) => {
      e.preventDefault();
      void (async () => {
        let file = ctx.app.vault.getAbstractFileByPath(dailyPath);
        if (!(file instanceof TFile)) {
          // create parent folders
          const lastSlash = dailyPath.lastIndexOf("/");
          const folder = lastSlash > 0 ? dailyPath.slice(0, lastSlash) : ""; // "" = vault root
          if (folder && !ctx.app.vault.getAbstractFileByPath(folder)) {
            await ctx.app.vault.createFolder(folder).catch(() => {});
          }
          try {
            file = await ctx.app.vault.create(dailyPath, `# ${dailyPath.split("/").pop()?.replace(/\.md$/, "") ?? ""}\n\n`);
          } catch {
            // race: file created in between
            file = ctx.app.vault.getAbstractFileByPath(dailyPath);
          }
        }
        if (file instanceof TFile) {
          await ctx.app.workspace.getLeaf(false).openFile(file);
        }
      })();
    });
  },
  renderSettingsForm(container, settings, onChange) {
    new Setting(container)
      .setName(t().todayGreetingOptional)
      .setDesc(t().todayExampleGoodMorningHaveA)
      .addText((t) =>
        t.setValue(settings.greeting).onChange((v) => onChange({ ...settings, greeting: v }))
      );
    new Setting(container)
      .setName(t().todayDailyNotesFolder)
      .setDesc(t().inheritFolderHint)
      .addText((text) =>
        text.setValue(settings.dailyFolder).onChange((v) =>
          onChange({ ...settings, dailyFolder: v.trim() })
        )
      );
    new Setting(container)
      .setName(t().todayDailyNotePathFormat)
      .setDesc(t().todayMatchYourVaultSNaming)
      .addDropdown((d) =>
        d
          .addOption("YYYY-MM-DD", "<folder>/YYYY-MM-DD.md")
          .addOption("YYYY/MM/DD", "<folder>/YYYY/MM/YYYY-MM-DD.md")
          .addOption("YYYY/YYYY-MM-DD", "<folder>/YYYY/YYYY-MM-DD.md")
          .setValue(settings.dailyFormat)
          .onChange((v) => onChange({ ...settings, dailyFormat: v as DailyFormat }))
      );
  },
};
