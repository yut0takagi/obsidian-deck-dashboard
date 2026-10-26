import { Setting } from "obsidian";
import type { WidgetDefinition } from "./types";
import { GoogleOAuth } from "../auth/googleOAuth";
import { listEvents, type GCalEvent } from "../adapters/googleCalendar";
import { t } from "../core/i18n";

interface Settings {
  calendarId: string;
  windowDays: number;
  maxEvents: number;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatTimeRange(ev: GCalEvent): string {
  if (ev.allDay) return t().googleCalendarAllDay;
  const fmt = (d: Date) =>
    `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const sameDay =
    ev.start.getFullYear() === ev.end.getFullYear() &&
    ev.start.getMonth() === ev.end.getMonth() &&
    ev.start.getDate() === ev.end.getDate();
  return sameDay ? `${fmt(ev.start)}–${fmt(ev.end)}` : fmt(ev.start);
}

function formatDateHeader(d: Date): string {
  const today = startOfToday();
  const dayMs = 24 * 60 * 60 * 1000;
  const diff = Math.round((d.getTime() - today.getTime()) / dayMs);
  const wd = t().weekdaysShort[d.getDay()];
  const label = t().googleCalendarText(d.getMonth() + 1, d.getDate(), wd);
  if (diff === 0) return t().googleCalendarToday(label);
  if (diff === 1) return t().googleCalendarTomorrow(label);
  if (diff === -1) return t().googleCalendarYesterday(label);
  return label;
}

function groupByDay(events: GCalEvent[]): Map<string, GCalEvent[]> {
  const m = new Map<string, GCalEvent[]>();
  for (const ev of events) {
    const k = ev.start.toDateString();
    const list = m.get(k) ?? [];
    list.push(ev);
    m.set(k, list);
  }
  return m;
}

export const googleCalendarWidget: WidgetDefinition<Settings> = {
  type: "gcal",
  label: "Google Calendar",
  description:
    t().googleCalendarFetchEventsUsingTheGoogle,
  defaultSettings: () => ({
    calendarId: "primary",
    windowDays: 7,
    maxEvents: 50,
  }),
  async render(el, settings, ctx) {
    el.empty();
    el.addClass("nd-widget-calendar");
    const oauth = new GoogleOAuth(ctx.plugin);
    if (!(await oauth.isAuthenticated())) {
      const empty = el.createDiv({ cls: "nd-empty" });
      empty.createEl("p", {
        text: t().googleCalendarAuthenticationRequiredOpenTheCommand,
      });
      return;
    }
    const status = el.createDiv({ cls: "nd-muted", text: t().googleCalendarLoading });
    try {
      const timeMin = startOfToday();
      const timeMax = new Date(timeMin);
      timeMax.setDate(timeMax.getDate() + Math.max(1, settings.windowDays));
      const events = await listEvents(
        oauth,
        settings.calendarId || "primary",
        timeMin,
        timeMax,
        settings.maxEvents
      );
      status.remove();
      if (events.length === 0) {
        el.createEl("p", { cls: "nd-empty", text: t().googleCalendarNoEvents });
        return;
      }
      const groups = groupByDay(events);
      for (const [k, evs] of groups) {
        const day = new Date(k);
        el.createEl("div", { cls: "nd-cal-day", text: formatDateHeader(day) });
        const ul = el.createEl("ul", { cls: "nd-cal-list" });
        for (const ev of evs) {
          const li = ul.createEl("li", { cls: "nd-cal-event" });
          const t = li.createEl("span", { cls: "nd-cal-time", text: formatTimeRange(ev) });
          if (ev.allDay) t.addClass("nd-cal-allday");
          const sum = li.createEl("a", {
            cls: "nd-cal-summary",
            text: ev.summary,
          });
          if (ev.htmlLink) {
            sum.setAttr("href", ev.htmlLink);
            sum.setAttr("target", "_blank");
          }
          if (ev.location) {
            li.createEl("span", { cls: "nd-cal-location", text: ` @ ${ev.location}` });
          }
        }
      }
    } catch (e) {
      status.remove();
      el.createEl("pre", {
        cls: "nd-error",
        text: `Google Calendar error: ${(e as Error).message}`,
      });
    }
  },
  renderSettingsForm(container, settings, onChange) {
    new Setting(container)
      .setName(t().googleCalendarCalendarId)
      .setDesc(t().googleCalendarPrimaryYourMainCalendarA)
      .addText((t) => {
        t.setValue(settings.calendarId);
        t.inputEl.addClass("deck-input-full");
        t.onChange((v) => onChange({ ...settings, calendarId: v.trim() || "primary" }));
      });
    new Setting(container)
      .setName(t().googleCalendarDaysToDisplay)
      .addText((t) =>
        t.setValue(String(settings.windowDays)).onChange((v) => {
          const n = parseInt(v, 10);
          if (!isNaN(n) && n > 0) onChange({ ...settings, windowDays: n });
        })
      );
    new Setting(container)
      .setName(t().googleCalendarMaximumEvents)
      .addText((t) =>
        t.setValue(String(settings.maxEvents)).onChange((v) => {
          const n = parseInt(v, 10);
          if (!isNaN(n) && n > 0) onChange({ ...settings, maxEvents: n });
        })
      );
  },
};
