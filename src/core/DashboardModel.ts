import { CURRENT_SCHEMA_VERSION } from "./constants";
import type { Dashboard, LayoutItem, WidgetInstance } from "./types";

export class DashboardParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DashboardParseError";
  }
}

export function createDefaultDashboard(title: string): Dashboard {
  return {
    version: CURRENT_SCHEMA_VERSION,
    title,
    layout: [],
    widgets: {},
  };
}

export function serializeDashboard(d: Dashboard): string {
  return JSON.stringify(d, null, 2);
}

export function parseDashboard(raw: string): Dashboard {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return createDefaultDashboard("Untitled");
  }

  let json: unknown;
  try {
    json = JSON.parse(trimmed);
  } catch (e) {
    throw new DashboardParseError(`Failed to parse dashboard JSON: ${(e as Error).message}`);
  }

  if (typeof json !== "object" || json === null) {
    throw new DashboardParseError("Dashboard root must be an object");
  }

  const obj = json as Record<string, unknown>;

  if (typeof obj.version !== "number") {
    throw new DashboardParseError("Dashboard.version must be a number");
  }
  if (typeof obj.title !== "string") {
    throw new DashboardParseError("Dashboard.title must be a string");
  }
  if (!Array.isArray(obj.layout)) {
    throw new DashboardParseError("Dashboard.layout must be an array");
  }
  if (typeof obj.widgets !== "object" || obj.widgets === null || Array.isArray(obj.widgets)) {
    throw new DashboardParseError("Dashboard.widgets must be an object");
  }

  return {
    version: obj.version,
    title: obj.title,
    layout: obj.layout as LayoutItem[],
    widgets: obj.widgets as Record<string, WidgetInstance>,
  };
}
