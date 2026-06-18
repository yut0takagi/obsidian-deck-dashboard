# Development

## Setup

```bash
git clone <this-repo> ~/Develop/obsidian-deck-dashboard
cd ~/Develop/obsidian-deck-dashboard
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
mkdir -p "$VAULT/.obsidian/plugins/deck-dashboard"
ln -sf "$REPO/main.js" "$VAULT/.obsidian/plugins/deck-dashboard/main.js"
ln -sf "$REPO/manifest.json" "$VAULT/.obsidian/plugins/deck-dashboard/manifest.json"
ln -sf "$REPO/styles.css" "$VAULT/.obsidian/plugins/deck-dashboard/styles.css"
```

Then in Obsidian: Settings → Community plugins → Reload → enable "Deck".

Use the **Hot Reload** community plugin to auto-reload on rebuild.

## Tests

```bash
npm test           # one-shot
npm run test:watch # watch
```

## Home dashboard template

`src/core/templates/homeTemplate.ts` holds the canonical layout used when:

- the **Open home dashboard** command is invoked and no `ホーム.dashboard` file exists yet, or
- the **Reset home dashboard to template** command is invoked (overwrites the
  existing home dashboard after a confirmation modal).

### Updating the stock layout

1. Rearrange your home dashboard inside Obsidian (edit mode → drag/resize).
2. Open the resulting `<vault>/ダッシュボード/ホーム.dashboard` JSON.
3. Mirror the `layout` and `widgets` blocks into `STOCK_HOME_TEMPLATE`. Keep
   widget IDs semantic (`kanban`, `gantt`, `ai-search`) — replace auto-generated
   `w_xxxx_NN` IDs that Obsidian assigns to manually-added widgets so the
   template stays readable and diff-friendly.
4. `npm test` — `homeTemplate.test.ts` enforces layout/widget ID parity, the
   absence of `w_*` placeholders, and that every widget `type` is registered.

### Swapping the template at runtime

`setHomeTemplate(custom | null)` replaces the active template until cleared.
This is the seam used by tests; future settings UI (or a "load from file"
command) can plug into the same hook without touching `commands.ts`.

## Google Sheets Sync (task management)

Bidirectional sync between `タスク/詳細/*.md` frontmatter and a Google Sheet.

### Commands

- `Sheets Sync: Setup` — Creates a new spreadsheet, writes the header row, and
  stores the spreadsheet ID in plugin data. Run once per vault.
- `Sheets Sync: Sync now` — Bidirectional reconcile (pull + push) with column
  ownership rules and timestamp-based conflict detection.
- `Sheets Sync: Show status` — Reports the configured spreadsheet URL and last
  sync time.

### Column ownership

| Owner | Columns |
|---|---|
| Sheets | タイトル / PJT / 担当 / 依頼者 / 期限 / 優先度 / ラベル |
| Vault  | status / 工数 / depends |
| System | task_id / vault_link / last_updated / origin |

On conflict (both sides modified after the last sync), ownership rules still
decide the merged value; the event is logged to `ログ/sync/{date}.jsonl`.

### Opt out

Add `sync: false` to a task's frontmatter to exclude it from sync entirely.

### Required OAuth scopes

`spreadsheets` + `drive.file` are appended to the existing
`calendar.readonly`. After upgrading, re-run **Google Calendar: Authenticate**
to refresh tokens with the new scopes.
