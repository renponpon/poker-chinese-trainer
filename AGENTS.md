# AGENTS.md — Phrabit / Codex 向け常設ルール

このファイルは Codex（VSCode）が作業開始時に読むプロジェクト指示書。  
詳細な現状・完了事項は `docs/handoff-codex.md` を参照。

---

## プロジェクト

- **名前:** Phrabit（フレービット）
- **種別:** Next.js 16 App Router + TypeScript + Tailwind v4
- **目的:** 中国語圏ポーカー向け。現場の一言を翻訳→必要なものだけドリル化
- **本番:** https://poker-chinese-trainer.vercel.app
- **開発ポート:** `3010`（`npm run dev`）

---

## 作業開始時

1. `docs/handoff-codex.md` で現フェーズと見送り事項を確認
2. 変更前に関連ファイルを **読んでから** 編集（既存の命名・パターンに合わせる）
3. 実装後は `npm run build` でビルド確認
4. **commit / push / deploy はユーザー明示指示時のみ**

---

## 現フェーズの優先度

**マカオ実地検証中。** 新機能よりログ・小さなバグ修正。

- やる: 実地ログ整理、明確なバグ修正、本番 env 確認
- やらない: 大規模リファクタ、スコープ外機能、ドキュメントの勝手な追加
- 迷ったら: `docs/product-iteration-priority.md` と `docs/handoff-codex.md` に従う

---

## コード規約

- **最小 diff。** 依頼された問題だけ直す
- **過剰抽象化禁止。** 1〜2行ヘルパーよりインライン
- **既存コンポーネントを拡張。** 似た機能の再実装禁止
- コメントは非自明なビジネスロジックのみ
- テストは依頼時または意味のあるカバレッジがある場合のみ

---

## 翻訳・会話の設計（変更時は必ず理解）

### 3モード

- `speed` → Azure（`skipPinyin: true`）
- `normal` → DeepL → 失敗時 Azure
- `quality` → Gemini（JSON で翻訳+解説+ピンイン）

### 会話画面の保存方針

- 翻訳 API: `persist: false` → **サーバー・localStorage に保存しない**
- ドリル追加時: `addLocalPhrase` + `/api/phrase/explain` + `/api/phrase/save-pack`
- **会話中にライブラリへ自動保存しない**（2026-05 確定）

### 解説

- 速度・通常: 翻訳時はピンイン・解説空 → ドリル追加時に explain API
- explain API は利用上限から除外
- 解説プロンプト: `src/lib/explanation-prompt.ts`（対訳行の繰り返し禁止）

---

## 秘密情報

- **`.env.local` を commit しない**
- キー類: GEMINI, DEEPL, AZURE, SUPABASE, NOTION, OPENAI 等
- 本番 env は Vercel Dashboard で管理

---

## Git / デプロイ

- ブランチ: 通常 `main`
- リモート: `origin` → GitHub `renponpon/poker-chinese-trainer`
- push → Vercel 自動デプロイ
- force push to main 禁止（ユーザー明示時以外）
- commit メッセージ: 英語、1〜2文、why 重視

---

## ユーザーとのコミュニケーション

- **日本語**で応答
- コード引用は `startLine:endLine:filepath` 形式
- 過度な bold / 箇条書きの羅列を避け、読みやすい文章で
- タスク完了後に不要な follow-up 提案を毎回しない

---

## 触る前に読むべきファイル（タスク別）

| タスク | ファイル |
|--------|----------|
| 翻訳・モード | `generation-mode.ts`, `api/phrase/add/route.ts` |
| 会話 | `conversation/page.tsx` |
| 解説 | `api/phrase/explain/route.ts`, `explanation-prompt.ts` |
| ドリル/SRS | `srs.ts`, `drill/DrillRunner.tsx` |
| 保存 | `library/LibraryView.tsx`, `local-phrases.ts` |
| 認証 | `supabase.ts`, `AuthButton.tsx`, `AuthSessionKeeper.tsx` |

---

## 既知の落とし穴

- DeepL「おはよう」→「早上好 早上好」は **API 由来。放置**
- `save-pack` は最大10件/リクエスト（会話ドリル追加はクライアントで chunk）
- BottomNav に会話タブなし（翻訳画面から `/conversation` へ）
- `PHRASE_UPDATED_EVENT` は DrillRunner のみリスナー。Library は初回読込のみ
- README の記述は古い部分あり。`handoff-codex.md` を正とする

---

## ドキュメント

- ユーザー依頼なしに `docs/*.md` を新規作成しない
- 実地ログ追記は `docs/macao-field-test-log.md` のみ OK（ユーザー依頼時）

---

*このファイルと `docs/handoff-codex.md` をセットで保守する。大きな設計変更後は handoff を更新すること。*
