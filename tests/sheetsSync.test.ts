import { describe, it, expect } from "vitest";
import { __test } from "../src/sync/sheetsSync";

const { mergeBoth, COL, HEADER_ROW, fmEquivalent, rowEquivalent } = __test;

describe("HEADER_ROW", () => {
  it("has 14 columns matching the design", () => {
    expect(HEADER_ROW).toHaveLength(14);
    expect(HEADER_ROW[COL.task_id]).toBe("task_id");
    expect(HEADER_ROW[COL.title]).toBe("タイトル");
    expect(HEADER_ROW[COL.status]).toBe("status");
    expect(HEADER_ROW[COL.origin]).toBe("origin");
  });
});

function makeSheetRow(overrides: Partial<Record<string, string>> = {}): string[] {
  const row = new Array(14).fill("");
  row[COL.task_id] = overrides.task_id ?? "t-1";
  row[COL.title] = overrides.title ?? "テストタスク";
  row[COL.PJT] = overrides.PJT ?? "やっちゃば";
  row[COL.担当] = overrides.担当 ?? "高木";
  row[COL.依頼者] = overrides.依頼者 ?? "";
  row[COL.期限] = overrides.期限 ?? "2026-06-15";
  row[COL.優先度] = overrides.優先度 ?? "High";
  row[COL.ラベル] = overrides.ラベル ?? "開発";
  row[COL.status] = overrides.status ?? "進行中";
  row[COL.工数] = overrides.工数 ?? "2h";
  row[COL.depends] = overrides.depends ?? "なし";
  row[COL.vault_link] = overrides.vault_link ?? "タスク/詳細/x.md";
  row[COL.last_updated] = overrides.last_updated ?? "2026-05-19T10:00:00.000Z";
  row[COL.origin] = overrides.origin ?? "vault";
  return row;
}

describe("mergeBoth column ownership", () => {
  const baseVaultRec = {
    file: { stat: { mtime: 0, ctime: 0 } } as any,
    path: "タスク/詳細/x.md",
    title: "テストタスク",
    body: "",
    rawFrontmatter: "",
    lastModified: 0,
    frontmatter: {
      task_id: "t-1",
      PJT: "やっちゃば",
      期限: "2026-06-15",
      優先度: "High",
      ラベル: "開発",
      status: "進行中",
      工数: "2h",
      depends: "なし",
      担当: "高木",
      sync_meta: { last_sync: "2026-05-19T09:00:00.000Z" },
    },
  };

  it("Sheets-owned fields (担当) flow from sheet → vault frontmatter", () => {
    const sheetRow = makeSheetRow({ 担当: "別の人" });
    const { mergedFm } = mergeBoth(baseVaultRec as any, sheetRow, "2026-05-19T11:00:00.000Z");
    expect(mergedFm.担当).toBe("別の人");
  });

  it("Vault-owned fields (status) flow from vault → sheet row", () => {
    const sheetRow = makeSheetRow({ status: "完了" }); // sheet should be overwritten
    const { mergedRow } = mergeBoth(baseVaultRec as any, sheetRow, "now");
    expect(mergedRow[COL.status]).toBe("進行中"); // vault wins
  });

  it("Vault-owned fields (工数) flow from vault → sheet row", () => {
    const sheetRow = makeSheetRow({ 工数: "10h" });
    const { mergedRow } = mergeBoth(baseVaultRec as any, sheetRow, "now");
    expect(mergedRow[COL.工数]).toBe("2h");
  });

  it("Sheets-owned (期限) preserves sheet value even if vault has one", () => {
    const sheetRow = makeSheetRow({ 期限: "2026-12-31" });
    const { mergedFm } = mergeBoth(baseVaultRec as any, sheetRow, "now");
    expect(mergedFm.期限).toBe("2026-12-31");
  });

  it("detects conflict when both sides changed after last_sync", () => {
    const lastSync = "2026-05-19T09:00:00.000Z";
    const rec = {
      ...baseVaultRec,
      lastModified: Date.parse("2026-05-19T10:00:00.000Z"), // after last_sync
      frontmatter: { ...baseVaultRec.frontmatter, sync_meta: { last_sync: lastSync } },
    };
    const sheetRow = makeSheetRow({
      last_updated: "2026-05-19T10:30:00.000Z", // also after last_sync
    });
    const { conflict } = mergeBoth(rec as any, sheetRow, "2026-05-19T11:00:00.000Z");
    expect(conflict).toBe(true);
  });

  it("no conflict when only one side changed", () => {
    const lastSync = "2026-05-19T09:00:00.000Z";
    const rec = {
      ...baseVaultRec,
      lastModified: Date.parse("2026-05-19T10:00:00.000Z"), // changed
      frontmatter: { ...baseVaultRec.frontmatter, sync_meta: { last_sync: lastSync } },
    };
    const sheetRow = makeSheetRow({
      last_updated: lastSync, // unchanged
    });
    const { conflict } = mergeBoth(rec as any, sheetRow, "2026-05-19T11:00:00.000Z");
    expect(conflict).toBe(false);
  });

  it("preserves task_id in merged row", () => {
    const sheetRow = makeSheetRow({ task_id: "t-1" });
    const { mergedRow } = mergeBoth(baseVaultRec as any, sheetRow, "now");
    expect(mergedRow[COL.task_id]).toBe("t-1");
  });

  it("sets origin=vault after merge (vault is the writer)", () => {
    const sheetRow = makeSheetRow();
    const { mergedRow } = mergeBoth(baseVaultRec as any, sheetRow, "now");
    expect(mergedRow[COL.origin]).toBe("vault");
  });
});

describe("fmEquivalent (diff detection)", () => {
  const base = {
    task_id: "t-1",
    PJT: "やっちゃば",
    期限: "2026-06-15",
    優先度: "High",
    ラベル: "開発",
    status: "進行中",
    工数: "2h",
    depends: "なし",
    担当: "高木",
  };
  it("returns true when only sync_meta differs (ignored)", () => {
    const a = { ...base, sync_meta: { last_sync: "2026-05-19T09:00Z" } };
    const b = { ...base, sync_meta: { last_sync: "2026-05-19T10:00Z" } };
    expect(fmEquivalent(a, b)).toBe(true);
  });
  it("returns false when status differs", () => {
    expect(fmEquivalent(base, { ...base, status: "完了" })).toBe(false);
  });
  it("returns false when PJT differs", () => {
    expect(fmEquivalent(base, { ...base, PJT: "別PJT" })).toBe(false);
  });
  it("treats undefined and empty as equivalent", () => {
    expect(fmEquivalent({ ...base, 依頼者: undefined }, { ...base, 依頼者: "" })).toBe(true);
  });
});

describe("rowEquivalent (diff detection)", () => {
  function row(overrides: Record<number, string> = {}): string[] {
    const r = new Array(14).fill("");
    r[COL.task_id] = "t-1";
    r[COL.title] = "テスト";
    r[COL.PJT] = "やっちゃば";
    r[COL.status] = "進行中";
    r[COL.last_updated] = "2026-05-19T09:00Z";
    r[COL.origin] = "vault";
    for (const [k, v] of Object.entries(overrides)) r[Number(k)] = v;
    return r;
  }
  it("returns true when only last_updated differs", () => {
    const a = row();
    const b = row({ [COL.last_updated]: "2026-05-19T10:00Z" });
    expect(rowEquivalent(a, b)).toBe(true);
  });
  it("returns true when only origin differs", () => {
    const a = row();
    const b = row({ [COL.origin]: "sheets" });
    expect(rowEquivalent(a, b)).toBe(true);
  });
  it("returns false when status differs", () => {
    const a = row();
    const b = row({ [COL.status]: "完了" });
    expect(rowEquivalent(a, b)).toBe(false);
  });
});
