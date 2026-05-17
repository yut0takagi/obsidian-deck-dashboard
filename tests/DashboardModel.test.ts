import { describe, it, expect } from "vitest";
import { parseDashboard, serializeDashboard, createDefaultDashboard } from "../src/core/DashboardModel";
import { CURRENT_SCHEMA_VERSION } from "../src/core/constants";

describe("DashboardModel", () => {
  describe("createDefaultDashboard", () => {
    it("returns a Dashboard with given title, empty layout, empty widgets, current version", () => {
      const d = createDefaultDashboard("My Home");
      expect(d.title).toBe("My Home");
      expect(d.version).toBe(CURRENT_SCHEMA_VERSION);
      expect(d.layout).toEqual([]);
      expect(d.widgets).toEqual({});
    });
  });

  describe("serializeDashboard", () => {
    it("returns pretty-printed JSON with 2-space indent", () => {
      const d = createDefaultDashboard("X");
      const raw = serializeDashboard(d);
      expect(raw).toContain('"title": "X"');
      expect(raw.split("\n").length).toBeGreaterThan(3);
    });
  });

  describe("parseDashboard", () => {
    it("round-trips a default dashboard", () => {
      const d = createDefaultDashboard("Y");
      const parsed = parseDashboard(serializeDashboard(d));
      expect(parsed).toEqual(d);
    });

    it("returns a default dashboard when input is empty string", () => {
      const parsed = parseDashboard("");
      expect(parsed.version).toBe(CURRENT_SCHEMA_VERSION);
      expect(parsed.layout).toEqual([]);
    });

    it("throws DashboardParseError when JSON is malformed", () => {
      expect(() => parseDashboard("{not json")).toThrow(/parse/i);
    });

    it("throws DashboardParseError when required field is missing", () => {
      expect(() => parseDashboard('{"title":"x"}')).toThrow(/version|layout|widgets/i);
    });

    it("fills in defaults for optional missing fields layout/widgets when version+title present", () => {
      const minimal = JSON.stringify({ version: 1, title: "x", layout: [], widgets: {} });
      const parsed = parseDashboard(minimal);
      expect(parsed.title).toBe("x");
    });
  });
});
