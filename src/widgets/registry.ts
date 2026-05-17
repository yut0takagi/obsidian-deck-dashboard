import type { WidgetDefinition } from "./types";

class Registry {
  private defs = new Map<string, WidgetDefinition<any>>();

  register<T>(def: WidgetDefinition<T>): void {
    this.defs.set(def.type, def);
  }

  get(type: string): WidgetDefinition<any> | undefined {
    return this.defs.get(type);
  }

  all(): WidgetDefinition<any>[] {
    return Array.from(this.defs.values());
  }
}

export const widgetRegistry = new Registry();
