import { requestUrl } from "obsidian";
// @ts-ignore — ical.js ships without bundled types
import ICAL from "ical.js";

export interface CalEvent {
  uid: string;
  summary: string;
  location: string;
  start: Date;
  end: Date;
  allDay: boolean;
}

export async function fetchIcal(url: string): Promise<string> {
  const res = await requestUrl({ url, method: "GET" });
  if (res.status >= 400) {
    throw new Error(`iCal fetch failed: HTTP ${res.status}`);
  }
  return res.text;
}

export function parseEventsInRange(
  icsText: string,
  rangeStart: Date,
  rangeEnd: Date
): CalEvent[] {
  const jcal = ICAL.parse(icsText);
  const vcal = new ICAL.Component(jcal);
  const vevents = vcal.getAllSubcomponents("vevent");

  const out: CalEvent[] = [];
  const rangeStartIcal = ICAL.Time.fromJSDate(rangeStart, true);
  const rangeEndIcal = ICAL.Time.fromJSDate(rangeEnd, true);

  for (const v of vevents) {
    const event = new ICAL.Event(v);
    const summary: string = event.summary ?? "(no title)";
    const location: string = event.location ?? "";
    const uid: string = event.uid ?? "";

    if (event.isRecurring()) {
      const iter = event.iterator();
      let next: any;
      // Hard cap to avoid infinite expansion on broken rules
      let safety = 5000;
      while ((next = iter.next()) && safety-- > 0) {
        if (next.compare(rangeEndIcal) > 0) break;
        const occ = event.getOccurrenceDetails(next);
        const startJs = occ.startDate.toJSDate();
        const endJs = occ.endDate.toJSDate();
        if (endJs < rangeStart) continue;
        if (startJs > rangeEnd) continue;
        out.push({
          uid: `${uid}-${startJs.toISOString()}`,
          summary,
          location,
          start: startJs,
          end: endJs,
          allDay: occ.startDate.isDate,
        });
      }
    } else {
      const startJs = event.startDate.toJSDate();
      const endJs = event.endDate.toJSDate();
      if (endJs < rangeStart) continue;
      if (startJs > rangeEnd) continue;
      out.push({
        uid,
        summary,
        location,
        start: startJs,
        end: endJs,
        allDay: event.startDate.isDate,
      });
    }
  }

  out.sort((a, b) => a.start.getTime() - b.start.getTime());
  return out;
}
