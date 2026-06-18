import type { App } from "obsidian";

export function wireInternalLinks(el: HTMLElement, app: App, sourcePath: string): void {
  el.addEventListener("click", (e) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    const a = target.closest<HTMLAnchorElement>("a.internal-link, a[data-href]");
    if (!a) return;
    const href = a.getAttribute("data-href") ?? a.getAttribute("href");
    if (!href) return;
    e.preventDefault();
    e.stopPropagation();
    const newTab = e.ctrlKey || e.metaKey || e.button === 1;
    void app.workspace.openLinkText(href, sourcePath, newTab);
  });
  el.addEventListener("auxclick", (e) => {
    if (e.button !== 1) return;
    const target = e.target as HTMLElement | null;
    if (!target) return;
    const a = target.closest<HTMLAnchorElement>("a.internal-link, a[data-href]");
    if (!a) return;
    const href = a.getAttribute("data-href") ?? a.getAttribute("href");
    if (!href) return;
    e.preventDefault();
    void app.workspace.openLinkText(href, sourcePath, true);
  });
}
