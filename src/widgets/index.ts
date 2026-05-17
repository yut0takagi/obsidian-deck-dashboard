import { widgetRegistry } from "./registry";
import { markdownWidget } from "./MarkdownWidget";
import { noteEmbedWidget } from "./NoteEmbedWidget";
import { dataviewWidget } from "./DataviewWidget";
import { counterWidget } from "./CounterWidget";
import { calendarWidget } from "./CalendarWidget";
import { googleCalendarWidget } from "./GoogleCalendarWidget";
import { todayWidget } from "./TodayWidget";
import { kanbanWidget } from "./KanbanWidget";

export function registerBuiltinWidgets(): void {
  widgetRegistry.register(todayWidget);
  widgetRegistry.register(markdownWidget);
  widgetRegistry.register(noteEmbedWidget);
  widgetRegistry.register(dataviewWidget);
  widgetRegistry.register(counterWidget);
  widgetRegistry.register(calendarWidget);
  widgetRegistry.register(googleCalendarWidget);
  widgetRegistry.register(kanbanWidget);
}

export { widgetRegistry };
