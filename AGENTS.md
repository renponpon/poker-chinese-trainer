# AGENTS.md — Phrabit / Codex 向け常設ルール

このファイルは Codex（VSCode）が作業開始時に読むプロジェクト指示書。  
プロダクト定義は `docs/product-vision.md`、実装の現状・完了事項は `docs/handoff-codex.md` を参照。

---

## プロジェクト

- **名前:** Phrabit（フレービット）
- **種別:** Next.js 16 App Router + TypeScript + Tailwind v4
- **目的:** 海外現場で調べた短いフレーズを、翻訳・保存・復習し、次に自分で言える言葉へ変える
- **初期ビーチヘッド:** マカオ・中国語圏でライブポーカーをする日本人
- **本番:** https://phrabit.com
- **開発ポート:** `3010`（`npm run dev`）

---

## 現在のプロダクト定義

Phrabit は、単なる翻訳アプリでも中国語総合教材でもなく、**現場で発生した一言を自分専用の復習資産に変えるプロダクト**。

- コア価値: 翻訳で終わらせず、保存・ドリル・再訪へつなげる
- 中心課題: 翻訳でその場は理解できるが、次の会話で自分の口から出てこない
- コアフロー: 現場で言えない → 翻訳する → 使い方まで理解する → 保存する → ドリルする → 次の現場で使う
- 初期検証: ポーカー現場。ただしプロダクト全体は「ポーカー専用」ではなく「現場フレーズ運用」

---

## 正本資料の優先順位

資料間で迷ったら、用途ごとに優先順位を分ける。

### プロダクト判断

1. `docs/product-vision.md` — Phrabit の現在定義
2. `docs/problem-statements.md` — 解く課題
3. `docs/user-segments.md` — 対象ユーザー
4. `docs/open-questions.md` — 未確定事項・検証すべき問い
5. `docs/roadmap.md` — 現方針に基づく実行計画

`docs/handoff-codex.md` は実装引き継ぎ用の資料。2026-05 時点の狭いポーカー向け表現が残るため、プロダクト定義の判断では `docs/product-vision.md` を優先する。

### 実装・運用判断

1. `AGENTS.md` — Codex 作業時の常設ルール
2. `docs/handoff-codex.md` — 実装の現状・完了事項・見送り事項
3. `docs/glossary.md` — 用語定義
4. `docs/domain-map.md` — DDD/ドメイン構造
5. 対象機能の実装ファイル

古い `README.md` や `SayItNext` 表記の残る資料は歴史的資料として参照し、現方針の正本にはしない。

---

## 作業開始時

1. `docs/product-vision.md` で現在のプロダクト定義を確認
2. `docs/handoff-codex.md` で実装の現状と見送り事項を確認
3. 設計判断を含む場合は `docs/glossary.md`, `docs/domain-map.md`, `docs/open-questions.md` も確認
4. 変更前に関連ファイルを **読んでから** 編集（既存の命名・パターンに合わせる）
5. 実装後は `npm run build` でビルド確認
6. **commit / push / deploy はユーザー明示指示時のみ**

---

## 現フェーズの優先度

**マカオ実地検証中。** 新機能よりログ・小さなバグ修正。

- やる: 実地ログ整理、明確なバグ修正、本番 env 確認
- やらない: 大規模リファクタ、スコープ外機能、ドキュメントの勝手な追加
- 迷ったら: `docs/product-vision.md`, `docs/open-questions.md`, `docs/product-iteration-priority.md`, `docs/handoff-codex.md` に従う

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
| プロダクト定義 | `docs/product-vision.md`, `docs/open-questions.md` |
| 用語・ドメイン設計 | `docs/glossary.md`, `docs/domain-map.md` |
| ユーザー・課題・ロードマップ | `docs/user-segments.md`, `docs/problem-statements.md`, `docs/roadmap.md` |
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
- `SayItNext` や `Poker Chinese Trainer` 表記は旧名/旧定義。現在は Phrabit として読み替える
- 「ポーカー専用」と断定しない。初期ビーチヘッドはポーカーだが、プロダクト定義は現場フレーズ運用

---

## ドキュメント

- ユーザー依頼なしに `docs/*.md` を新規作成しない
- 実地ログ追記は `docs/macao-field-test-log.md` のみ OK（ユーザー依頼時）
- 設計整理ドキュメントを更新する場合は、関連する正本資料同士の整合を確認する

---

*このファイルと `docs/handoff-codex.md` をセットで保守する。大きな設計変更後は handoff を更新すること。*
