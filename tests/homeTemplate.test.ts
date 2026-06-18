import { afterEach, describe, expect, it } from "vitest";
import {
  getHomeTemplate,
  getStockHomeTemplate,
  setHomeTemplate,
} from "../src/core/templates/homeTemplate";
import {
  parseDashboard,
  serializeDashboard,
} from "../src/core/DashboardModel";
import { CURRENT_SCHEMA_VERSION } from "../src/core/constants";
import type { Dashboard } from "../src/core/types";

describe("homeTemplate", () => {
  afterEach(() => {
    setHomeTemplate(null);
  });

  it("returns a dashboard at the current schema version", () => {
    const tpl = getHomeTemplate();
    expect(tpl.version).toBe(CURRENT_SCHEMA_VERSION);
    expect(tpl.title).toBe("ホーム");
  });

  it("round-trips through serialize/parse without loss", () => {
    const tpl = getHomeTemplate();
    const raw = serializeDashboard(tpl);
    const parsed = parseDashboard(raw);
    expect(parsed).toEqual(tpl);
  });

  it("has a widget entry for every layout item (and vice versa)", () => {
    const tpl = getHomeTemplate();
    const layoutIds = tpl.layout.map((l) => l.i).sort();
    const widgetIds = Object.keys(tpl.widgets).sort();
    expect(layoutIds).toEqual(widgetIds);
  });

  it("uses semantic IDs (no auto-generated w_* placeholders)", () => {
    const tpl = getHomeTemplate();
    for (const item of tpl.layout) {
      expect(item.i).not.toMatch(/^w_[a-z0-9]+_\d+$/);
    }
  });

  it("returns a fresh copy each call (mutations do not bleed)", () => {
    const a = getHomeTemplate();
    a.title = "Mutated";
    a.layout.push({ i: "extra", x: 0, y: 99, w: 1, h: 1 });
    const b = getHomeTemplate();
    expect(b.title).toBe("ホーム");
    expect(b.layout.find((l) => l.i === "extra")).toBeUndefined();
  });

  it("honors title override without leaking it back into the stock template", () => {
    const renamed = getHomeTemplate("マイホーム");
    expect(renamed.title).toBe("マイホーム");
    expect(getHomeTemplate().title).toBe("ホーム");
  });

  it("setHomeTemplate replaces the active template until cleared", () => {
    const custom: Dashboard = {
      version: CURRENT_SCHEMA_VERSION,
      title: "Custom",
      layout: [{ i: "only", x: 0, y: 0, w: 4, h: 2 }],
      widgets: {
        only: { type: "markdown", settings: { content: "hello" } },
      },
    };
    setHomeTemplate(custom);
    expect(getHomeTemplate().title).toBe("Custom");
    expect(getHomeTemplate().layout).toHaveLength(1);
    setHomeTemplate(null);
    expect(getHomeTemplate().title).toBe("ホーム");
  });

  it("getStockHomeTemplate ignores any override", () => {
    setHomeTemplate({
      version: CURRENT_SCHEMA_VERSION,
      title: "Override",
      layout: [],
      widgets: {},
    });
    expect(getStockHomeTemplate().title).toBe("ホーム");
  });

  it("references only widget types that are bundled with the plugin", () => {
    // Keep this list in sync with src/widgets/index.ts (registerBuiltinWidgets).
    const allowed = new Set([
      "today",
      "counter",
      "dataview",
      "kanban",
      "gantt",
      "gcal",
      "markdown",
      "ai-search",
      "note",
      "task-creator",
      "charts",
      "calendar",
    ]);
    const tpl = getHomeTemplate();
    for (const [id, w] of Object.entries(tpl.widgets)) {
      expect(allowed.has(w.type), `widget ${id} has unknown type ${w.type}`).toBe(true);
    }
  });
});
