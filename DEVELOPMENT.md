# Development

## Setup

```bash
git clone <this-repo> ~/Develop/obsidian-notion-dashboard
cd ~/Develop/obsidian-notion-dashboard
npm install
```

## Live development (watch mode)

```bash
npm run dev
```

This rebuilds `main.js` on every change.

## Install into a vault for testing

```bash
VAULT=/path/to/your/vault
REPO=$(pwd)
mkdir -p "$VAULT/.obsidian/plugins/notion-dashboard"
ln -sf "$REPO/main.js" "$VAULT/.obsidian/plugins/notion-dashboard/main.js"
ln -sf "$REPO/manifest.json" "$VAULT/.obsidian/plugins/notion-dashboard/manifest.json"
ln -sf "$REPO/styles.css" "$VAULT/.obsidian/plugins/notion-dashboard/styles.css"
```

Then in Obsidian: Settings → Community plugins → Reload → enable "Notion Dashboard".

Use the **Hot Reload** community plugin to auto-reload on rebuild.

## Tests

```bash
npm test           # one-shot
npm run test:watch # watch
```
