import type { WidgetDefinition } from "./types";

/** A widget definition whose settings type is erased to `unknown` for storage. */
type AnyWidgetDefinition = WidgetDefinition<unknown>;

class Registry {
  private defs = new Map<string, AnyWidgetDefinition>();

  register<T>(def: WidgetDefinition<T>): void {
    // Settings type is erased on storage; call sites pass the matching
    // settings object at render/edit time.
    this.defs.set(def.type, def);
  }

  get(type: string): AnyWidgetDefinition | undefined {
    return this.defs.get(type);
  }

  all(): AnyWidgetDefinition[] {
    return Array.from(this.defs.values());
  }
}

export const widgetRegistry = new Registry();
