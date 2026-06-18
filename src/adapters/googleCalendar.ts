import { requestUrl } from "obsidian";
import type { GoogleOAuth } from "../auth/googleOAuth";

export interface GCalEvent {
  id: string;
  summary: string;
  location: string;
  start: Date;
  end: Date;
  allDay: boolean;
  htmlLink: string;
}

export interface GCalCalendar {
  id: string;
  summary: string;
  description: string;
  primary: boolean;
  backgroundColor: string;
}

const API = "https://www.googleapis.com/calendar/v3";

/** Raw Google Calendar API shapes (only the fields this adapter reads). */
interface RawCalendarListEntry {
  id?: string;
  summary?: string;
  description?: string;
  primary?: boolean;
  backgroundColor?: string;
}

interface RawCalendarList {
  items?: RawCalendarListEntry[];
}

interface RawEventDateTime {
  dateTime?: string;
  date?: string;
}

interface RawCalendarEvent {
  id?: string;
  summary?: string;
  location?: string;
  htmlLink?: string;
  start?: RawEventDateTime;
  end?: RawEventDateTime;
}

interface RawEventList {
  items?: RawCalendarEvent[];
}

async function authedGet(oauth: GoogleOAuth, url: string): Promise<unknown> {
  const token = await oauth.getAccessToken();
  const res = await requestUrl({
    url,
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status >= 400) {
    throw new Error(`Google API HTTP ${res.status}: ${res.text}`);
  }
  return res.json;
}

export async function listCalendars(oauth: GoogleOAuth): Promise<GCalCalendar[]> {
  const json = (await authedGet(
    oauth,
    `${API}/users/me/calendarList?maxResults=250`
  )) as RawCalendarList;
  return (json.items ?? []).map((c) => ({
    id: c.id ?? "",
    summary: c.summary ?? "(no name)",
    description: c.description ?? "",
    primary: !!c.primary,
    backgroundColor: c.backgroundColor ?? "",
  }));
}

export async function listEvents(
  oauth: GoogleOAuth,
  calendarId: string,
  timeMin: Date,
  timeMax: Date,
  maxResults = 50
): Promise<GCalEvent[]> {
  const params = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    maxResults: String(maxResults),
    singleEvents: "true",
    orderBy: "startTime",
  }).toString();
  const url = `${API}/calendars/${encodeURIComponent(calendarId)}/events?${params}`;
  const json = (await authedGet(oauth, url)) as RawEventList;
  return (json.items ?? []).map((ev) => {
    const isAllDay = !!ev.start?.date;
    const start = isAllDay
      ? new Date((ev.start?.date ?? "") + "T00:00:00")
      : new Date(ev.start?.dateTime ?? "");
    const end = isAllDay
      ? new Date((ev.end?.date ?? "") + "T00:00:00")
      : new Date(ev.end?.dateTime ?? "");
    return {
      id: ev.id ?? "",
      summary: ev.summary ?? "(no title)",
      location: ev.location ?? "",
      start,
      end,
      allDay: isAllDay,
      htmlLink: ev.htmlLink ?? "",
    };
  });
}
