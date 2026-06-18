import { requestUrl } from "obsidian";
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
  let res;
  try {
    res = await requestUrl({ url, method: "GET" });
  } catch (e) {
    throw new Error(`ネットワークエラー: ${(e as Error).message}`);
  }
  if (res.status === 403) {
    throw new Error(
      `HTTP 403 Forbidden — このURLは社内ネットワーク/VPN専用、もしくはトークンが失効している可能性。Googleカレンダーの「カレンダーの非公開URL（iCal形式）」推奨。`
    );
  }
  if (res.status === 404) {
    throw new Error(`HTTP 404 — URLが見つかりません。URLの再取得を。`);
  }
  if (res.status === 401) {
    throw new Error(`HTTP 401 — 認証が必要。iCal URLはトークン埋め込み式の公開URLにしてください。`);
  }
  if (res.status >= 400) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.text;
}

export function parseEventsInRange(
  icsText: string,
  rangeStart: Date,
  rangeEnd: Date
): CalEvent[] {
  // ICAL.parse() is typed `any` upstream; the jCal payload is the array/string
  // form ICAL.Component accepts, so narrow at this boundary.
  const jcal = ICAL.parse(icsText) as unknown[] | string;
  const vcal = new ICAL.Component(jcal);
  const vevents = vcal.getAllSubcomponents("vevent");

  const out: CalEvent[] = [];
  const rangeEndIcal = ICAL.Time.fromJSDate(rangeEnd, true);

  for (const v of vevents) {
    const event = new ICAL.Event(v);
    const summary: string = event.summary ?? "(no title)";
    const location: string = event.location ?? "";
    const uid: string = event.uid ?? "";

    if (event.isRecurring()) {
      const iter = event.iterator();
      // iter.next() returns the next ICAL.Time, or a falsy value when the
      // iteration is exhausted (the typings declare a non-null Time).
      let next: ICAL.Time | null;
      // Hard cap to avoid infinite expansion on broken rules
      let safety = 5000;
      while ((next = iter.next() as ICAL.Time | null) && safety-- > 0) {
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
