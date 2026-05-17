import { widgetRegistry } from "./registry";
import { markdownWidget } from "./MarkdownWidget";
import { noteEmbedWidget } from "./NoteEmbedWidget";
import { dataviewWidget } from "./DataviewWidget";
import { counterWidget } from "./CounterWidget";

export function registerBuiltinWidgets(): void {
  widgetRegistry.register(markdownWidget);
  widgetRegistry.register(noteEmbedWidget);
  widgetRegistry.register(dataviewWidget);
  widgetRegistry.register(counterWidget);
}

export { widgetRegistry };
