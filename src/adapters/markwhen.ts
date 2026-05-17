// Minimal Markwhen-flavored parser tailored for this vault's タスク/ガント.mw.
// Supports:
//   - Header tag colors: "#tagname: #colorhex"
//   - "section <title>" lines
//   - "group <title> #tag1 #tag2" ... "endGroup" blocks
//   - Event lines: "YYYY-MM-DD/YYYY-MM-DD: title #tag" or "YYYY-MM-DD: title #tag"
//   - Wikilink lines inside groups (skipped for chart, available as link)
// Anything else is ignored gracefully.

export interface MwEvent {
  start: Date;
  end: Date;
  title: string;
  tags: string[];
  section: string;
  group: string;
  isGroupHeader: boolean;
  link?: string;
}

export interface MwDoc {
  tagColors: Record<string, string>;
  events: MwEvent[];
  sections: string[];
}

const RE_TAG_COLOR = /^#(\S+):\s*(#[0-9a-fA-F]{3,8})\s*$/;
const RE_SECTION = /^section\s+(.*)$/;
const RE_GROUP = /^group\s+(.*)$/;
const RE_END_GROUP = /^endGroup\s*$/;
const RE_EVENT_RANGE = /^(\d{4}-\d{1,2}-\d{1,2})\/(\d{4}-\d{1,2}-\d{1,2}):\s*(.*?)$/;
const RE_EVENT_SINGLE = /^(\d{4}-\d{1,2}-\d{1,2}):\s*(.*?)$/;
const RE_WIKILINK = /^\[\[(.+?)\]\]\s*$/;
const RE_TAG = /#(\S+)/g;

export function parseMarkwhen(raw: string): MwDoc {
  const lines = raw.split(/\r?\n/);
  const out: MwDoc = { tagColors: {}, events: [], sections: [] };
  let section = "";
  const sectionsSet = new Set<string>();
  let group = "";
  let groupHeaderEmitted = false;
  let pendingWikilink: string | null = null;
  let lastEventIdx = -1;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("//") || line.startsWith("title:") || line.startsWith("description:"))
      continue;

    let m = RE_TAG_COLOR.exec(line);
    if (m) {
      out.tagColors[m[1]] = m[2];
      continue;
    }

    m = RE_SECTION.exec(line);
    if (m) {
      section = stripTrailingMeta(m[1]);
      if (!sectionsSet.has(section)) {
        sectionsSet.add(section);
        out.sections.push(section);
      }
      group = "";
      groupHeaderEmitted = false;
      continue;
    }

    m = RE_GROUP.exec(line);
    if (m) {
      const { title, tags } = splitTitleAndTags(m[1]);
      group = title;
      groupHeaderEmitted = false;
      void tags;
      continue;
    }

    if (RE_END_GROUP.test(line)) {
      group = "";
      groupHeaderEmitted = false;
      continue;
    }

    m = RE_WIKILINK.exec(line);
    if (m) {
      pendingWikilink = m[1];
      if (lastEventIdx >= 0 && !out.events[lastEventIdx].link) {
        out.events[lastEventIdx].link = pendingWikilink;
      }
      continue;
    }

    m = RE_EVENT_RANGE.exec(line);
    if (m) {
      const start = parseISODate(m[1]);
      const end = parseISODate(m[2]);
      if (!start || !end) continue;
      const { title, tags } = splitTitleAndTags(m[3]);
      const isGroupHeader = !!group && !groupHeaderEmitted && titlesEqual(title, group);
      const ev: MwEvent = {
        start,
        end,
        title,
        tags,
        section,
        group,
        isGroupHeader,
        link: pendingWikilink ?? undefined,
      };
      pendingWikilink = null;
      if (isGroupHeader) groupHeaderEmitted = true;
      out.events.push(ev);
      lastEventIdx = out.events.length - 1;
      continue;
    }

    m = RE_EVENT_SINGLE.exec(line);
    if (m) {
      const d = parseISODate(m[1]);
      if (!d) continue;
      const { title, tags } = splitTitleAndTags(m[2]);
      const ev: MwEvent = {
        start: d,
        end: d,
        title,
        tags,
        section,
        group,
        isGroupHeader: false,
        link: pendingWikilink ?? undefined,
      };
      pendingWikilink = null;
      out.events.push(ev);
      lastEventIdx = out.events.length - 1;
      continue;
    }
  }
  return out;
}

function splitTitleAndTags(raw: string): { title: string; tags: string[] } {
  const tags: string[] = [];
  let m: RegExpExecArray | null;
  RE_TAG.lastIndex = 0;
  while ((m = RE_TAG.exec(raw))) tags.push(m[1]);
  const title = raw.replace(RE_TAG, "").replace(/\s+$/, "").trim();
  return { title, tags };
}

function parseISODate(s: string): Date | null {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3]);
}

function stripTrailingMeta(s: string): string {
  // "クエスト... — ✅ 案件終了（...）" → keep first part
  return s.split(/\s+—\s+/)[0].trim();
}

function titlesEqual(a: string, b: string): boolean {
  return a.replace(/\s/g, "") === b.replace(/\s/g, "");
}
