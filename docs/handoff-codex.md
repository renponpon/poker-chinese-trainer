# Phrabit 引き継ぎ（2026-05）

Cursor での開発から Codex + VSCode への引き継ぎ用ドキュメント。  
**新しいセッションでは、まずこのファイルと `AGENTS.md` を読むこと。**

---

## プロダクト概要

**Phrabit（フレービット）** — 中国語圏（主にマカオ）でライブポーカーをする日本人向けの中国語学習・会話補助アプリ。

- **翻訳**（日↔中、3モード）
- **会話**（その場で交互翻訳）
- **ドリル**（SRS による瞬間作文）
- **保存**（ライブラリ）

**本番 URL:** https://poker-chinese-trainer.vercel.app  
**GitHub:** https://github.com/renponpon/poker-chinese-trainer  
**最新の主要コミット:** `aa4d741` — Add three-mode translation, conversation drill flow, and auth persistence.

---

## 直近完了した実装（2026-05）

### 翻訳アーキテクチャ（3モード）

| モード | API | ピンイン・解説 |
|--------|-----|----------------|
| **速度** (`speed`) | Azure（ピンインなし） | ドリル追加時に Gemini で生成 |
| **通常** (`normal`) | DeepL → 失敗時 Azure | 同上 |
| **品質** (`quality`) | Gemini | 翻訳と同時 or ドリル追加時 |

- 型・ラベル: `src/lib/generation-mode.ts`
- ルーティング: `src/app/api/phrase/add/route.ts` の `translateByMode()`
- UI: `src/components/GenerationModeToggle.tsx`（1ボタンで 速度→通常→品質 を循環）

### 会話画面（`/conversation`）

- 翻訳中は **ライブラリに保存しない**（`persist: false`）
- **ドリルに追加** で初めて localStorage + クラウド保存
- 右上「ドリルに追加」→ フレーズ選択 → ピンイン・解説生成 → `shouldDrill: true`
- カードタップで翻訳側の音声再生（再生ボタン・プロバイダラベルは非表示）
- デフォルトモード: **速度**（翻訳画面は **通常**）

### 認証

- Supabase Auth（PKCE）
- `src/app/auth/callback/page.tsx`
- `src/components/AuthSessionKeeper.tsx`（layout に追加）
- ゲスト利用可。ログインで Supabase 同期。

### 利用上限

- ゲスト **100回/日**、ログイン **200回/日**
- `/api/phrase/explain` は上限チェック対象外（翻訳1回に解説含む扱い）
- 設定: `src/lib/server/usage-limits.ts`、`.env.local`

### 本番環境

- Vercel Production に `DEEPL_API_KEY` 含む主要 env 設定済み
- スモークテスト 11/11 PASS（2026-05-23 時点）

---

## 意図的に未対応・見送り

| 項目 | 理由 |
|------|------|
| DeepL「おはよう→早上好 早上好」重複 | DeepL API 由来。アプリ側では放置 |
| タブ自動反映（`PHRASE_UPDATED_EVENT`） | タブ開き直しで十分 |
| 会話ログの sessionStorage 永続化 | 今は不要 |
| 会話カテゴリ | 未分類で OK |
| 「会話を消去」ボタン | 削除済み。代わりにドリルに追加 |
| ゲスト→ログイン同期 UI | 中期 |

---

## 既知の制限

- 同一入力の再送信置き換えは **ローカルのみ**（Supabase/Notion の古いフレーズが残る可能性）
- 会話画面リロードで会話ログは消える（state のみ）
- ドリル追加時の SRS サーバー同期は未実装（ローカルのみ）
- SRS / フレーズは **URL（オリジン）ごとに別 localStorage**。本番 URL を固定して使う
- 利用上限カウント: 速度・通常モードは翻訳+解説で実質2イベント/フレーズになりうる

---

## 次フェーズ（最優先）

**マカオ実地検証** — コードより **ログ記録** を優先。

- 記録先: `docs/macao-field-test-log.md`
- 参照: `docs/customer-understanding-synthesis.md`、`docs/product-concept-test-script.md`
- 重点: 会話→ドリル追加フロー、3モード体感、Google翻訳との差、音声入力、使わなかった理由

---

## 主要ファイル一覧

| パス | 役割 |
|------|------|
| `src/app/add/page.tsx` | 翻訳画面、モード切替、解説非同期 |
| `src/app/conversation/page.tsx` | 会話、ドリル追加選択 UI |
| `src/app/api/phrase/add/route.ts` | 翻訳 API（`persist` オプション） |
| `src/app/api/phrase/explain/route.ts` | 解説+ピンイン生成 |
| `src/app/api/phrase/save-pack/route.ts` | クラウド一括保存（ドリル追加時） |
| `src/lib/generation-mode.ts` | 速度/通常/品質 定義 |
| `src/lib/server/deepl-translator.ts` | DeepL |
| `src/lib/server/azure-translator.ts` | Azure |
| `src/lib/local-phrases.ts` | localStorage フレーズ |
| `src/lib/srs.ts` | SRS ロジック |
| `src/lib/supabase.ts` | Supabase クライアント |
| `src/components/GenerationModeToggle.tsx` | モード1ボタン |
| `src/components/BottomNav.tsx` | 下部ナビ |

---

## ローカル開発

```bash
npm install
# .env.local を用意（.env.local.example 参照。Git に commit しない）
npm run dev
# → http://localhost:3010
npm run build  # デプロイ前確認
```
