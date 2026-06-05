# Phrabit 引き継ぎ（2026-05）

Cursor での開発から Codex + VSCode への引き継ぎ用ドキュメント。  
**新しいセッションでは、まずこのファイルと `AGENTS.md` を読むこと。**

---

## プロダクト概要

**Phrabit（フレービット）** — 海外（マカオ・WSOP など）でライブポーカーをする日本人向けの語学学習・会話補助アプリ。

- **翻訳**（日↔中 / 日↔英、3モード）
- **会話**（その場で交互翻訳）
- **ドリル**（SRS による瞬間作文）
- **保存**（ライブラリ）

**本番 URL:** https://phrabit.com  
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
- 初回体感速度対策: `/add` と `/conversation` で表示後1.5秒、入力欄フォーカス、音声ボタン押下時に `/api/phrase/add` へ `warmup: true` を送り、Azure/DeepL のみを軽く温める。保存・通常ログには混ぜない。

### 多言語対応

- 言語定義: `src/lib/languages.ts`
- DB/API/保存形式は `sourceLanguage` / `targetLanguage` / `sourceText` / `targetText` / `readingType` を持つ多言語前提に整理済み
- 中国語・英語を UI から切替可能
- 表に出す対象言語は `ACTIVE_TARGET_LANGUAGE_CODES` で制御。現在は `["zh", "en"]`
- ドリル・ライブラリは対象言語別に分離/フィルター可能

### 会話画面（`/conversation`）

- 翻訳中は **ライブラリに保存しない**（`persist: false`）
- **ドリルに追加** で初めて localStorage + クラウド保存
- 右上「ドリルに追加」→ フレーズ選択 → ピンイン・解説生成 → `shouldDrill: true`
- カードタップで翻訳側の音声再生（再生ボタン・プロバイダラベルは非表示）
- デフォルトモード: **速度**（翻訳画面は **通常**）

### 認証

- Supabase Auth
- UI は Google ログインのみ
- ログイン UI は Google OAuth の同一タブリダイレクトで ID token を受け取り、`supabase.auth.signInWithIdToken()` に渡す方式
- Google Cloud の Web Client ID を `NEXT_PUBLIC_GOOGLE_CLIENT_ID` に設定する
- Google Cloud の承認済みリダイレクト URI に `/auth/google/callback`（本番・ローカル）を追加する
- Supabase Dashboard 側でも Google provider の Client ID / Secret 設定が必要
- `src/app/auth/google/callback/page.tsx`
- `src/app/auth/callback/page.tsx`（旧Supabase OAuth callback。残置）
- `src/components/AuthSessionKeeper.tsx`（layout に追加）
- ゲスト利用可。ログインで Supabase 同期。

### 利用上限・不正利用対策

- 翻訳 API は厳密な日次上限ではなく、短時間の大量利用をメモリ上でブロックする
- デフォルト: ゲスト **100回/分**、ログイン **100回/分**。超過時は **1時間ブロック**
- ブロック発生時は Resend 設定があれば管理者メールへ通知
- `/api/phrase/explain` は日次上限チェック対象外（翻訳1回に解説含む扱い）だが、短時間大量利用ブロックは対象
- 音声など一部 API は既存の日次上限チェックを継続
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
| `src/lib/languages.ts` | 言語定義、翻訳方向、多言語 UI 表示制御 |
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
