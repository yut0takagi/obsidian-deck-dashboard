export interface LayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WidgetInstance<TSettings = unknown> {
  type: string;
  title?: string;
  settings: TSettings;
}

export interface Dashboard {
  version: number;
  title: string;
  layout: LayoutItem[];
  widgets: Record<string, WidgetInstance>;
}
