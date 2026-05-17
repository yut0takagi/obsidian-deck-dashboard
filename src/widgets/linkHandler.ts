import type { App } from "obsidian";

export function wireInternalLinks(el: HTMLElement, app: App, sourcePath: string): void {
  el.addEventListener("click", (e) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    const a = target.closest("a.internal-link, a[data-href]") as HTMLAnchorElement | null;
    if (!a) return;
    const href = a.getAttribute("data-href") ?? a.getAttribute("href");
    if (!href) return;
    e.preventDefault();
    e.stopPropagation();
    const newTab = e.ctrlKey || e.metaKey || (e as MouseEvent).button === 1;
    app.workspace.openLinkText(href, sourcePath, newTab);
  });
  el.addEventListener("auxclick", (e) => {
    if ((e as MouseEvent).button !== 1) return;
    const target = e.target as HTMLElement | null;
    if (!target) return;
    const a = target.closest("a.internal-link, a[data-href]") as HTMLAnchorElement | null;
    if (!a) return;
    const href = a.getAttribute("data-href") ?? a.getAttribute("href");
    if (!href) return;
    e.preventDefault();
    app.workspace.openLinkText(href, sourcePath, true);
  });
}
