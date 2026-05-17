import { Setting, TFile } from "obsidian";
import type { WidgetDefinition } from "./types";

interface Settings {
  dailyFolder: string;
  dailyFormat: "YYYY-MM-DD" | "YYYY/MM/DD" | "YYYY/YYYY-MM-DD";
  greeting: string;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function formatDailyPath(format: Settings["dailyFormat"], folder: string, d: Date): string {
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const folderTrim = folder.replace(/\/+$/, "");
  switch (format) {
    case "YYYY-MM-DD":
      return `${folderTrim}/${y}-${m}-${day}.md`;
    case "YYYY/MM/DD":
      return `${folderTrim}/${y}/${m}/${y}-${m}-${day}.md`;
    case "YYYY/YYYY-MM-DD":
      return `${folderTrim}/${y}/${y}-${m}-${day}.md`;
  }
}

export const todayWidget: WidgetDefinition<Settings> = {
  type: "today",
  label: "Today (日付)",
  description: "今日の日付・曜日を大きく表示 + 日報ノートへのクイックリンク。",
  defaultSettings: () => ({
    dailyFolder: "日報",
    dailyFormat: "YYYY/YYYY-MM-DD",
    greeting: "",
  }),
  render(el, settings, ctx) {
    el.empty();
    el.addClass("nd-widget-today");
    const now = new Date();
    const wd = ["日", "月", "火", "水", "木", "金", "土"][now.getDay()];

    const wrap = el.createDiv({ cls: "nd-today-wrap" });

    if (settings.greeting) {
      wrap.createDiv({ cls: "nd-today-greeting", text: settings.greeting });
    }

    const dateLine = wrap.createDiv({ cls: "nd-today-date" });
    dateLine.createSpan({ cls: "nd-today-month", text: `${now.getMonth() + 1}月` });
    dateLine.createSpan({ cls: "nd-today-day", text: String(now.getDate()) });
    dateLine.createSpan({ cls: "nd-today-weekday", text: `(${wd})` });

    wrap.createDiv({
      cls: "nd-today-year",
      text: `${now.getFullYear()}/${pad(now.getMonth() + 1)}/${pad(now.getDate())}`,
    });

    // Daily note link
    const linkRow = wrap.createDiv({ cls: "nd-today-links" });
    const dailyPath = formatDailyPath(settings.dailyFormat, settings.dailyFolder, now);
    const existing = ctx.app.vault.getAbstractFileByPath(dailyPath);
    const dailyLink = linkRow.createEl("a", {
      cls: "nd-today-daily-link",
      text: existing instanceof TFile ? "📝 今日の日報を開く" : "📝 今日の日報を作成",
    });
    dailyLink.addEventListener("click", async (e) => {
      e.preventDefault();
      let file = ctx.app.vault.getAbstractFileByPath(dailyPath);
      if (!(file instanceof TFile)) {
        // create parent folders
        const lastSlash = dailyPath.lastIndexOf("/");
        const folder = dailyPath.slice(0, lastSlash);
        if (folder && !ctx.app.vault.getAbstractFileByPath(folder)) {
          await ctx.app.vault.createFolder(folder).catch(() => {});
        }
        try {
          file = await ctx.app.vault.create(dailyPath, `# ${dailyPath.split("/").pop()?.replace(/\.md$/, "") ?? ""}\n\n`);
        } catch (err) {
          // race: file created in between
          file = ctx.app.vault.getAbstractFileByPath(dailyPath);
        }
      }
      if (file instanceof TFile) {
        await ctx.app.workspace.getLeaf(false).openFile(file);
      }
    });
  },
  renderSettingsForm(container, settings, onChange) {
    new Setting(container)
      .setName("挨拶 (任意)")
      .setDesc("例: おはよう / 今日もいい一日を")
      .addText((t) =>
        t.setValue(settings.greeting).onChange((v) => onChange({ ...settings, greeting: v }))
      );
    new Setting(container)
      .setName("日報フォルダ")
      .addText((t) =>
        t.setValue(settings.dailyFolder).onChange((v) =>
          onChange({ ...settings, dailyFolder: v.trim() || "日報" })
        )
      );
    new Setting(container)
      .setName("日報ファイルパス形式")
      .setDesc("vaultの命名規則に合わせる")
      .addDropdown((d) =>
        d
          .addOption("YYYY-MM-DD", "日報/YYYY-MM-DD.md")
          .addOption("YYYY/MM/DD", "日報/YYYY/MM/YYYY-MM-DD.md")
          .addOption("YYYY/YYYY-MM-DD", "日報/YYYY/YYYY-MM-DD.md")
          .setValue(settings.dailyFormat)
          .onChange((v) => onChange({ ...settings, dailyFormat: v as Settings["dailyFormat"] }))
      );
  },
};
