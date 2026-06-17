# Gmail メールビューワー 設計書

- **日付**: 2026-06-18
- **対象プラグイン**: Notion Dashboard (obsidian-notion-dashboard)
- **目的**: Obsidian プラグイン内で「メールを確認・作成・送信」できる Gmail クライアントを追加する

---

## 1. 決定事項サマリ

| 項目 | 決定 |
| --- | --- |
| バックエンド | **Gmail API**（既存 `GoogleOAuth` を再利用） |
| UI 配置 | **ハイブリッド**（ダッシュボードウィジェット ＋ 専用ペイン `ItemView`） |
| 機能範囲 | **フル**（受信一覧・閲覧・作成・返信/転送・検索・ラベル・添付） |
| 送信機構 | **方式A**: プラグインは Gmail 下書きを作るところまで。実際の送信は **Gmail を Web で開いて人が確認・送信** |
| AI 連携 | 返信時に **スレッド要約 ＋ vault(ナレッジ/議事録)からの過去背景 RAG → AI 返信ドラフト生成** |
| vault 連携 | **読み取り (RAG) のみ**。メールのノート化は今回スコープ外 |
| 動作環境 | **デスクトップ限定**（OAuth の loopback サーバが desktop only） |

---

## 2. 背景・既存パターン

このプラグインは Google 連携基盤を既に持つ:

- `src/auth/googleOAuth.ts` — OAuth (loopback + PKCE)。`SCOPES` 配列、`hasScope()`、`getAccessToken()`（自動リフレッシュ）。
- `src/adapters/googleCalendar.ts` / `googleSheets.ts` — ステートレス関数。`requestUrl` + `Authorization: Bearer` で REST を叩く。
- `src/widgets/*` — `WidgetDefinition<TSettings>`（`render` / `renderSettingsForm`）。`index.ts` で登録。
- `src/core/DashboardView.ts` — `ItemView` ベース。`main.ts` で `registerView`。
- `src/ui/*Modal.ts` — `Modal` ベースの対話UI。
- `src/widgets/AISearchWidget.ts` — Claude 連携（`claude -p` / Anthropic API のバックエンド切替）＋ vault 候補抽出（keyword pre-filter）。
- `src/widgets/linkHandler.ts` — `wireInternalLinks` 等。

メールビューワーはこの構成にそのまま乗せる。新規概念は最小限。

---

## 3. アーキテクチャ

### 3.1 モジュール構成

```
auth/googleOAuth.ts        変更: SCOPES に gmail.modify を追加
adapters/gmail.ts          新規: Gmail REST のステートレスラッパ + Web URL ヘルパー
core/vaultRetrieval.ts     新規: AISearch の候補抽出ロジックを共通化（Mail と共用）
core/MailView.ts           新規: ItemView 本体（2ペイン: 一覧 + 本文）
core/constants.ts          変更: VIEW_TYPE_MAIL 追加
widgets/MailWidget.ts      新規: ダッシュボード用受信箱ウィジェット
widgets/index.ts           変更: mailWidget を登録
ui/MailComposeModal.ts     新規: 作成/返信/転送モーダル（AI支援 + 下書き作成 + Gmailで開く）
ai/mailAssist.ts           新規: スレッド要約 + vault背景RAG + AI返信ドラフト生成
commands.ts                変更: Mailビューを開くコマンド
main.ts                    変更: registerView(VIEW_TYPE_MAIL) + リボン
ui/SyncSettingsTab.ts      変更: Gmail 設定セクション
```

### 3.2 各ユニットの責務・インターフェース・依存

#### `adapters/gmail.ts`（純粋なAPIラッパ）
- **責務**: Gmail REST v1 を叩いて型付き結果を返す。状態を持たない。
- **依存**: `obsidian.requestUrl`, `GoogleOAuth`。
- **主なエクスポート**:
  - `listThreads(oauth, query, maxResults): Promise<GmailThreadSummary[]>` — `users.threads.list`（`q` クエリ対応）+ 各スレッドの先頭メッセージのヘッダ取得。
  - `getThread(oauth, threadId): Promise<GmailThread>` — `users.threads.get(format=full)`。本文(text/html)・ヘッダ・添付メタをパース。
  - `getMessage(oauth, messageId): Promise<GmailMessage>`。
  - `listLabels(oauth): Promise<GmailLabel[]>`。
  - `modifyMessageLabels(oauth, messageId, add[], remove[]): Promise<void>` — 既読化(`UNREAD`除去)・アーカイブ(`INBOX`除去)・ラベル付与。
  - `trashMessage(oauth, messageId): Promise<void>` — `users.messages.trash`（永久削除はしない）。
  - `createDraft(oauth, draft: DraftInput): Promise<{ draftId; messageId; threadId }>` — `users.drafts.create`。RFC 2822 MIME を base64url で生成。返信時は `threadId` + `In-Reply-To`/`References` を付与。
  - `getAttachment(oauth, messageId, attachmentId): Promise<{ data: ArrayBuffer; ... }>`。
  - `getProfile(oauth): Promise<{ emailAddress: string }>` — `authuser` 用の自アドレス取得（キャッシュ）。
- **MIME ビルダー**（純ロジック・テスト対象）:
  - ヘッダ（From/To/Cc/Subject/In-Reply-To/References/MIME-Version/Content-Type）
  - 本文（text/plain。将来 multipart/alternative 拡張余地）
  - 添付ありは `multipart/mixed`（各 part を base64 エンコード）
  - 全体を base64url 化
- **Web URL ヘルパー**（純ロジック・テスト対象）:
  - `gmailThreadUrl(email, threadId)` → `https://mail.google.com/mail/?authuser=<email>#all/<threadId>`
  - `gmailDraftUrl(email, draftMessageId)` → `https://mail.google.com/mail/?authuser=<email>#drafts/<messageId>`
  - `gmailDraftsListUrl(email)` → フォールバック用 `#drafts`

#### `core/vaultRetrieval.ts`（共通の候補抽出）
- **責務**: クエリ文字列 + 対象/除外フォルダから vault 内 Markdown を keyword スコアリングして上位候補（path + 抜粋 + score）を返す。
- **依存**: `obsidian.App`（`getMarkdownFiles` / `cachedRead`）。
- **インターフェース**: `selectCandidates(app, query, opts): Promise<Candidate[]>`。
- **背景**: 現状 `AISearchWidget.ts` に同等ロジックが内包されている。Mail でも同じ抽出が必要になるため共通モジュールへ抽出し、`AISearchWidget` もこれを使うようリファクタする（既存の責務境界の改善。今回の作業に必要な範囲のみ）。

#### `core/MailView.ts`（専用ペイン）
- **責務**: 2ペインのメールクライアント UI。左=一覧（検索ボックス + ラベル絞り込み）、右=スレッド本文（添付・AI要約・アクション）。
- **依存**: `adapters/gmail`, `GoogleOAuth`, `MailComposeModal`, `ai/mailAssist`, 設定。
- **公開メソッド**: `openThread(threadId)`（ウィジェットからの遷移用）, 標準 `ItemView` ライフサイクル。
- **アクション**: 返信 / 転送 / AI返信 / 既読・未読 / アーカイブ / trash / ラベル付与 / 更新。

#### `widgets/MailWidget.ts`（ダッシュボードウィジェット）
- **責務**: コンパクトな受信一覧（直近 N 件）＋`作成`/`更新`ボタン。メールクリックで `MailView` を該当スレッドで開く。
- **依存**: `adapters/gmail`, `GoogleOAuth`, `MailComposeModal`。
- **Settings**: `query`（既定 `in:inbox`）, `maxItems`, `unreadOnly`。
- **未認証/スコープ不足**: Calendar ウィジェットと同様に「再認証してください」を表示。

#### `ui/MailComposeModal.ts`（作成/返信/転送）
- **責務**: To/Cc/件名/本文の編集、添付追加、AI返信ドラフト呼び出し、「Gmailで確認」操作。
- **モード**: `new` / `reply`（threadId + 引用 + 宛先プリセット）/ `forward`（本文・添付引継ぎ）。
- **「Gmailで確認」フロー**: `createDraft` → 成功なら `gmailDraftUrl` を `window.open`（開けない/失敗時は `gmailDraftsListUrl` フォールバック + Notice）。**プラグインからは送信しない**。
- **依存**: `adapters/gmail`, `ai/mailAssist`。

#### `ai/mailAssist.ts`（AI 返信支援）
- **責務**: 返信ドラフト生成パイプライン。
  1. `getThread` の本文からスレッド要約用テキストを組み立て。
  2. `vaultRetrieval.selectCandidates(app, query, { folders: RAG対象 })` で過去背景を抽出（query = 送信者名 + 件名 + 主要キーワード）。
  3. Claude（`claude -p` または Anthropic API。AISearch と同じ backend 設定を流用）に「スレッド要約」と「vault背景を踏まえた返信ドラフト」を依頼。
  4. 返り値: `{ summary: string; replyDraft: string; sources: string[] }`。
- **依存**: `adapters/anthropic`（`chat`）, `adapters/claudeCode`（`runClaudeP`）, `vaultRetrieval`。
- **設定**: backend / claudeCmd / model / RAG対象フォルダ（既定: 議事録, ナレッジ など。設定で変更可）。

---

## 4. データフロー

### 4.1 確認（読む）
1. リボン/コマンドで `MailView` 起動。
2. `listThreads(query)` → 左ペイン一覧描画。
3. スレッド選択 → `getThread` → 右ペイン描画。
4. 開封時に `modifyMessageLabels(remove=['UNREAD'])` で既読化。

### 4.2 作成（新規）
1. `作成` → `MailComposeModal(mode=new)`。
2. 本文編集 → 「Gmailで確認」 → `createDraft` → ブラウザで下書きを開く → ユーザーが Gmail で送信。

### 4.3 返信（AI）
1. スレッドで `AI返信` → `mailAssist`（要約 + vault背景RAG + ドラフト生成）。
2. `MailComposeModal(mode=reply)` に要約・参照元・生成ドラフトを反映。
3. ユーザー編集 → 「Gmailで確認」 → `createDraft`（threadId + In-Reply-To/References）→ ブラウザで送信。

### 4.4 ハイブリッド遷移
- `MailWidget` の一覧クリック → `MailView.openThread(threadId)`（ワークスペースで開く/フォーカス）。

---

## 5. 認証・スコープ

- `googleOAuth.ts` の `SCOPES` に `https://www.googleapis.com/auth/gmail.modify` を追加。
  - `gmail.modify` で **読取・ラベル変更・既読化・下書き作成・trash** を 1 スコープで網羅（永久削除は不可＝安全側）。
- 既存トークンには gmail スコープが無いため、ユーザーは `google-auth` コマンドで **再認証**（`prompt=consent` で再同意）。
- 各メール機能の入口で `hasScope(tokens, 'gmail.modify')` を確認。不足時は再認証導線を表示。
- 送信はブラウザの Gmail で行うため、プラグインが `messages.send` を呼ぶことはない（スコープには含まれるが使用しない）。

---

## 6. エラー処理・制約

- 未認証 / スコープ不足 → 「コマンドパレットで再認証してください」表示（既存 Calendar ウィジェット準拠）。
- API 4xx/5xx → 既存 adapter と同じくメッセージ表示（`Gmail API HTTP <status>: <text>`）。
- 下書きディープリンクが開けない環境 → `#drafts` 一覧を開くフォールバック + Notice。
- **デスクトップ限定**: OAuth が desktop only のため、モバイルでは認証導線で明示。
- レート対策: 一覧は `maxResults` 制限。スレッド本文は選択時に遅延取得。
- 添付サイズ: 大きい添付の下書き作成は base64 で重くなるため、上限（例: 25MB の Gmail 制限）超過時は警告。

---

## 7. テスト方針

既存 vitest 構成（`tests/*.test.ts` + `tests/__mocks__/obsidian.ts`）に合わせる。純ロジックを単体テスト:

- `gmail.ts`: MIME ビルダー（ヘッダ整形・multipart・base64url）、`gmailWebUrl` 系生成、スレッド/メッセージのパース（固定 JSON フィクスチャ）。
- `vaultRetrieval.ts`: 候補抽出（tokenize / scoreFilename / scoreContent / フォルダ除外）。
- ラベル差分計算（既読化・アーカイブの add/remove 算出）。
- AISearch リファクタ後も既存テストが緑であること。

API 呼び出し・UI 描画はモック境界まで（`requestUrl` をモック）。

---

## 8. 実装フェーズ（1 spec を段階実装）

1. **コア読取**: gmail.modify 追加 / `adapters/gmail` 読取系 / `MailView` 一覧・本文 / 既読化 / `MailWidget` / VIEW 登録・コマンド・リボン。
2. **作成・送信(ブラウザ確認)**: `MailComposeModal`(new) / `createDraft` / Gmail で開く / 返信・転送（スレッド連結）。
3. **AI 返信**: `vaultRetrieval` 共通化（AISearch リファクタ含む）/ `ai/mailAssist`（要約 + RAG + ドラフト）/ ComposeModal 連携。
4. **フル拡張**: 検索クエリ / ラベル絞り込み・付与 / 添付（閲覧 + 下書きへ添付）/ アーカイブ・trash。

各フェーズ完了時点で「確認・書く・送信（ブラウザ）」が動く状態を維持する（フェーズ2終了で MVP 達成）。

---

## 9. スコープ外（YAGNI）

- プラグインからの直接送信（`messages.send`）。
- メールの vault ノート化（保存）。
- 複数 Google アカウントの切替 UI（`authuser` は自アドレス固定で対応）。
- HTML 本文のリッチエディタ作成（作成は text/plain。閲覧は HTML 表示）。
- プッシュ通知 / リアルタイム同期（手動「更新」のみ）。
- モバイル対応（desktop 限定）。
