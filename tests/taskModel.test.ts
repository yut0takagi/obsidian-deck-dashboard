import { describe, it, expect } from "vitest";
import {
  filterByScope,
  generateTaskId,
  isSyncEnabled,
  ownerFromPath,
  parseFrontmatter,
  serializeFrontmatter,
  TaskFrontmatter,
} from "../src/core/taskModel";
import type { TFile } from "obsidian";

describe("generateTaskId", () => {
  it("matches t-YYYYMMDD-6hex format", () => {
    const id = generateTaskId(new Date(2026, 4, 19));
    expect(id).toMatch(/^t-20260519-[0-9a-f]{6}$/);
  });

  it("zero-pads month and day", () => {
    const id = generateTaskId(new Date(2026, 0, 5));
    expect(id).toMatch(/^t-20260105-/);
  });

  it("produces different ids on consecutive calls", () => {
    const a = generateTaskId();
    const b = generateTaskId();
    expect(a).not.toBe(b);
  });
});

describe("isSyncEnabled", () => {
  it("returns true by default", () => {
    expect(isSyncEnabled({})).toBe(true);
  });
  it("returns false when sync: false", () => {
    expect(isSyncEnabled({ sync: false })).toBe(false);
  });
  it("returns false when sync is string 'false'", () => {
    expect(isSyncEnabled({ sync: "false" })).toBe(false);
  });
});

describe("parseFrontmatter", () => {
  it("parses flat key/value pairs", () => {
    const raw = "PJT: やっちゃば\n期限: 2026-06-15\n優先度: High";
    const fm = parseFrontmatter(raw);
    expect(fm.PJT).toBe("やっちゃば");
    expect(fm.期限).toBe("2026-06-15");
    expect(fm.優先度).toBe("High");
  });

  it("parses nested sync_meta block", () => {
    const raw = [
      "task_id: t-20260519-abc123",
      "sync_meta:",
      "  sheet_row: 5",
      "  last_sync: 2026-05-19T11:00:00Z",
      "  origin: vault",
    ].join("\n");
    const fm = parseFrontmatter(raw);
    expect(fm.task_id).toBe("t-20260519-abc123");
    expect(fm.sync_meta?.sheet_row).toBe(5);
    expect(fm.sync_meta?.last_sync).toBe("2026-05-19T11:00:00Z");
    expect(fm.sync_meta?.origin).toBe("vault");
  });

  it("coerces boolean literals", () => {
    const fm = parseFrontmatter("sync: false");
    expect(fm.sync).toBe(false);
  });
});

describe("serializeFrontmatter", () => {
  it("roundtrips flat keys", () => {
    const fm: TaskFrontmatter = {
      PJT: "技術",
      期限: "2026-07-01",
      status: "進行中",
      task_id: "t-20260519-xyz",
    };
    const text = serializeFrontmatter(fm);
    expect(text).toContain("PJT: 技術");
    expect(text).toContain("status: 進行中");
    expect(text).toContain("task_id: t-20260519-xyz");
  });

  it("writes sync_meta as nested block", () => {
    const fm: TaskFrontmatter = {
      task_id: "t-1",
      sync_meta: {
        sheet_row: 3,
        last_sync: "2026-05-19T12:00:00Z",
        origin: "sheets",
      },
    };
    const text = serializeFrontmatter(fm);
    expect(text).toContain("sync_meta:");
    expect(text).toContain("  sheet_row: 3");
    expect(text).toContain("  last_sync: 2026-05-19T12:00:00Z");
    expect(text).toContain("  origin: sheets");
  });

  it("skips undefined values", () => {
    const fm: TaskFrontmatter = { PJT: "X", 期限: undefined };
    const text = serializeFrontmatter(fm);
    expect(text).toContain("PJT: X");
    expect(text).not.toContain("期限");
  });
});

describe("ownerFromPath", () => {
  it("returns null for flat task files", () => {
    expect(ownerFromPath("タスク/詳細/foo.md")).toBeNull();
  });
  it("returns owner segment for nested files", () => {
    expect(ownerFromPath("タスク/詳細/高木悠人/foo.md")).toBe("高木悠人");
    expect(ownerFromPath("タスク/詳細/嵯峨/bar.md")).toBe("嵯峨");
  });
});

describe("filterByScope", () => {
  const mk = (path: string): TFile => ({ path } as unknown as TFile);
  const files = [
    mk("タスク/詳細/flat-task.md"),
    mk("タスク/詳細/高木悠人/my-task.md"),
    mk("タスク/詳細/嵯峨/their-task.md"),
  ];

  it("personal scope includes flat + selfOwner folder", () => {
    const result = filterByScope(files, "personal", "高木悠人").map((f) => f.path);
    expect(result).toContain("タスク/詳細/flat-task.md");
    expect(result).toContain("タスク/詳細/高木悠人/my-task.md");
    expect(result).not.toContain("タスク/詳細/嵯峨/their-task.md");
  });

  it("org scope excludes flat AND selfOwner — only other members' tasks", () => {
    const result = filterByScope(files, "org", "高木悠人").map((f) => f.path);
    expect(result).not.toContain("タスク/詳細/flat-task.md");
    expect(result).not.toContain("タスク/詳細/高木悠人/my-task.md");
    expect(result).toContain("タスク/詳細/嵯峨/their-task.md");
  });

  it("personal scope excludes other members' tasks", () => {
    const result = filterByScope(files, "personal", "高木悠人").map((f) => f.path);
    expect(result).not.toContain("タスク/詳細/嵯峨/their-task.md");
  });
});
