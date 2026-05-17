export class Plugin {
  app: any = {};
  manifest: any = {};
  registerView(): void {}
  registerExtensions(): void {}
  addCommand(): void {}
  addRibbonIcon(): any { return null; }
  loadData(): Promise<any> { return Promise.resolve({}); }
  saveData(): Promise<void> { return Promise.resolve(); }
  onload(): void {}
  onunload(): void {}
}

export class ItemView {
  containerEl: any = { children: [{}, { empty: () => {}, createEl: () => ({}) }] };
  getViewType(): string { return ""; }
  getDisplayText(): string { return ""; }
  onOpen(): Promise<void> { return Promise.resolve(); }
  onClose(): Promise<void> { return Promise.resolve(); }
}

export class TextFileView extends ItemView {
  data = "";
  file: any = null;
  setViewData(_data: string, _clear: boolean): void {}
  getViewData(): string { return this.data; }
  clear(): void {}
}

export class WorkspaceLeaf {
  view: any = null;
  openFile(): Promise<void> { return Promise.resolve(); }
  setViewState(): Promise<void> { return Promise.resolve(); }
}

export class TFile {
  path = "";
  basename = "";
  extension = "";
}

export class Notice {
  constructor(_msg: string) {}
}

export const normalizePath = (p: string) => p;
