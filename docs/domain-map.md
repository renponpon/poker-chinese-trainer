# Domain Map

最終更新: 2026-06-08

この文書は、Phrabit を DDD 観点で初期整理したものです。実装の完全な構造ではなく、資料読み込みから導いたドメイン理解の正本候補です。推測を含む箇所は明示します。

## コアドメイン

Phrabit のコアドメインは、現場で発生した一度きりの翻訳を、次に自分で使える個人フレーズ資産へ変換することです。

言い換えると、次の変換が中心です。

| Before | After |
|--------|-------|
| その場で調べた一文 | 自分のライブラリに残るフレーズ |
| 意味だけ分かった訳文 | 読み・使い方・場面つきの表現 |
| 一度きりのメモ | ドリル対象の学習アイテム |
| 汎用教材の例文 | 自分が現場で必要とした表現 |

根拠:

- `docs/strategy-reset-2026.md`
- `docs/customer-understanding-synthesis.md`
- `docs/product-concept-validation-plan.md`
- `docs/positioning-map.md`
- `supabase/schema.sql`

## 中心フロー

```text
Phrase Capture
  -> Phrase Explanation
  -> Phrase Library
  -> Drill / SRS
  -> Reuse in the next real situation
```

補助的に、全体へ `Usage Analytics` と `Customer Discovery` がかかります。

```text
Real Situation
  -> Translate
  -> Save
  -> Drill
  -> Revisit
  -> Learn whether the product works
```

## サブドメイン

| 種類 | サブドメイン | 説明 |
|------|--------------|------|
| Core | Phrase Assetization | 現場フレーズを翻訳・文脈化・保存・復習対象化する |
| Core | Drill Readiness | 保存した表現を、次に口から出る状態へ近づける |
| Supporting | Translation Provider Orchestration | Azure, DeepL, Gemini, STT などを用途別に使い分ける |
| Supporting | Usage Analytics | 保存率、ドリル追加率、再訪、provider利用を観察する |
| Supporting | Customer Discovery | 実地ログ、インタビュー、観察シートを扱う |
| Generic | Auth / User Management | 匿名/ログイン/ユーザー所有データを扱う |
| Generic | Feedback Submission | フィードバックフォームや通知を扱う |

根拠:

- `AGENTS.md`
- `docs/translation-provider-evaluation.md`
- `docs/interview-playbook.md`
- `supabase/schema.sql`

## 境界づけられたコンテキスト

| コンテキスト | 責務 | 主な用語 | 根拠 |
|--------------|------|----------|------|
| Phrase Capture | 入力を受け、翻訳・読み・解説を生成する | source_text, target_text, reading, explanation, mode | `docs/translation-provider-evaluation.md`, `AGENTS.md` |
| Conversation Assist | 会話中に素早く翻訳する。ただし自動保存しない | conversation, persist:false | `AGENTS.md` |
| Phrase Library | 保存済みフレーズを検索・カテゴリ管理・言語ペア管理する | phrase, library, category, language_pair | `docs/mvp-next-iteration-spec.md`, `supabase/schema.sql` |
| Drill / SRS | ドリル対象、復習状態、次回レビュー、スコアを管理する | srs_item, status, next_review_at, last_score | `supabase/schema.sql` |
| Phrase Explanation | 使う場面、自然な言い方、ピンイン/読み、解説を扱う | usage, explanation, pinyin | `docs/translation-provider-evaluation.md` |
| Usage Analytics | provider、mode、画面、成功/失敗を記録・分析する | usage_event, provider, source_page, feature | `supabase/schema.sql` |
| User / Auth | ユーザーの所有データ、匿名/ログインを扱う | user, guest, auth | `docs/handoff-codex.md`, `supabase/schema.sql` |
| Feedback / Discovery | 実地検証、観察、フィードバック、インタビュー結果を扱う | observation, good signal, bad signal | `docs/phase2-runbook.md`, `docs/interview-playbook.md` |

推測:

- `ConversationSession` のような明確なDB集約は、資料と `schema.sql` では未確認です。現時点では、会話は「保存しない一時的なコンテキスト」と見るのが安全です。

## 主要集約候補

| 集約候補 | 役割 | 主要属性/関連 | 根拠 |
|----------|------|---------------|------|
| Phrase | フレーズ資産の中心 | source_text, target_text, reading, explanation, direction, category_id, should_drill | `supabase/schema.sql` |
| SrsItem | 復習状態の管理 | status, next_review_at, interval_days, ease_factor, last_score | `supabase/schema.sql` |
| PhraseCategory | ユーザー別の分類 | id, user_id, label, built_in | `supabase/schema.sql` |
| UserPhraseLibrary | ユーザーが所有するフレーズ集合 | user_id配下のPhrase群、検索、絞り込み | `supabase/schema.sql`, `docs/mvp-next-iteration-spec.md` |
| UsageEvent | 利用計測 | feature, provider, mode, source_page, success, direction | `supabase/schema.sql` |
| FeedbackEntry | ユーザーの要望・不具合・観察 | 内容、文脈、次アクション | `docs/feedback-and-ideas-log.md` |
| InterviewObservation | 顧客発見の観察単位 | 状況、進歩、障害、既存解、痛み、支払い意思 | `docs/interview-observation-sheet.md` |

推測:

- `UserPhraseLibrary` はDBテーブルとしては存在しません。`phrases` を `user_id` で束ねた概念的集約として扱います。
- `FeedbackEntry` と `InterviewObservation` は、プロダクトDBの中核集約というより Discovery コンテキスト側の集約です。

## 主要ドメインイベント候補

| イベント | 意味 | 現在の根拠 |
|----------|------|------------|
| PhraseTranslated | フレーズが翻訳された | `ai_usage_events` |
| ExplanationGenerated | 解説/使い方が生成された | `ai_usage_events`, explain API 方針 |
| PhraseSaved | フレーズがライブラリに保存された | `phrases` |
| PhraseAddedToDrill | フレーズがドリル対象になった | `should_drill`, `srs_items` |
| PhraseReviewed | ドリルで回答/評価された | `srs_items.last_score` |
| PhraseRevisited | 保存後に再訪された | D1/D7 検証仮説 |
| ConversationTranslated | 会話補助で翻訳された | conversation 画面、`persist:false` |
| UsageRecorded | AI/provider利用が記録された | `ai_usage_events` |
| FeedbackSubmitted | フィードバックが送信された | feedback 資料・API |

これは将来の設計言語候補であり、すべてが現実装のイベントとして明示されているわけではありません。

## DBとの対応

| DB要素 | ドメイン上の意味 |
|--------|------------------|
| `public.phrases` | 保存済みフレーズ |
| `public.srs_items` | 復習対象と復習状態 |
| `public.phrase_categories` | ユーザー別カテゴリ |
| `public.ai_usage_events` | 翻訳・解説・音声などの利用計測 |
| `weekly_ai_usage` / `monthly_ai_usage` | 利用集計ビュー |

根拠:

- `supabase/schema.sql`
- `supabase/migrations/*.sql`

## コンテキスト間の注意点

1. Conversation Assist と Phrase Library を混ぜない

   会話画面の翻訳は `persist:false` で、サーバーや localStorage に自動保存しない。保存はユーザーの明示的なドリル追加や保存操作で行う。

2. Translation Provider と Product Value を混ぜない

   Provider は価値提供の手段です。Phrabit のコア価値は翻訳精度そのものではなく、現場フレーズを保存・復習・再利用できる流れにあります。

3. Customer Discovery と Product DB を混ぜない

   インタビュー観察は重要ですが、顧客発見の文脈です。プロダクト内の `Phrase` や `SrsItem` と同一の集約として扱わないほうが安全です。

## ADR化・実装昇格の条件

この文書の DDD 整理は、実装指示ではなく設計仮説です。DB、API、集約境界、永続化方針に影響する変更へ進む前に、ADR またはそれに準じる短い設計メモを作ります。

### 昇格条件

次のいずれかに当てはまる場合、実装前に ADR 化します。

1. 新しい永続化単位が必要になる

   例: `ConversationSession` テーブル、イベントテーブル、ユーザー別辞書テーブルを追加する。

2. 既存集約の責務を変える

   例: `Phrase` に会話履歴、複数候補、業務機密フラグ、共有権限を持たせる。

3. ユーザーのデータ所有・保存・削除に影響する

   例: 会話履歴の保存、音声録音の保存、業務フレーズの扱い。

4. Provider や mode の選択がユーザー体験や課金に直結する

   例: 仕事モード、高精度モード、有料STT、専門用語辞書。

5. 検証指標に影響する

   例: 保存率、ドリル追加率、D1/D7再訪を測るイベント定義を変える。

### ADR候補

| 仮説/設計候補 | ADR化する条件 | まだ実装に上げない理由 |
|---------------|---------------|--------------------------|
| `ConversationSession` | 会話履歴を保存したい要望が複数出る、または会話単位でドリル化する設計に進む | 現方針は `persist:false` で自動保存しない |
| `UserPhraseLibrary` の明示集約 | ライブラリ単位の不変条件、共有、容量制限、同期方針が必要になる | 現状は `phrases.user_id` で概念的に束ねれば足りる |
| ドメインイベント永続化 | `ai_usage_events` では保存/ドリル/再訪の分析が不足する | まず既存ログとSRS状態で検証する |
| 専門用語辞書 | ポーカー語彙や業務語彙の保持が利用継続・課金に効く証拠が出る | まずプロンプト注入や小さな辞書PoCで足りる可能性がある |
| 仕事/高精度モード | 業務層で支払い意思、機密許容、品質要求が確認できる | 現在はポーカー現場の保存・ドリル検証が優先 |

### ADRに最低限書くこと

- 背景となるユーザー観察または利用指標
- 決定する集約・DB・API境界
- 保存するデータと保存しないデータ
- プライバシー/削除/ログ方針
- 代替案と見送る理由
- 既存指標への影響

## 現時点の結論

Phrabit の中心は翻訳APIではなく、`Phrase` を現場文脈、読み、使い方、保存先、復習状態と結びつける流れです。

コアフローは次の通りです。

```text
現場で言えない
  -> 翻訳する
  -> 使い方まで理解する
  -> 保存する
  -> ドリルする
  -> 次の現場で使う
```
