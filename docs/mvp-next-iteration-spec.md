# MVP 次イテレーション仕様

**作成日**: 2026-05-19  
**対象バージョン**: V0.2 Concept Validation Build  
**参照元**: `product-iteration-priority.md`、`product-concept-validation-plan.md`、`phase2-b6-hypothesis-decision.md`  
**目的**: 第三フェーズ「製品コンセプトの検証と洗練」で、顧客反応を取るための最小実装仕様。

---

## 0. 結論

次イテレーションでは、以下を実装対象にする。

1. **日→中 / 中→日 の方向切替**
2. **全件ライブラリとドリル対象の分離**
3. **保存時の「ライブラリのみ / ドリルにも追加」選択**
4. **状況別カテゴリの手動付与**
5. **ライブラリのカテゴリ絞り込み**
6. **自分用コード運用の廃止に向けた匿名利用＋任意ログイン設計**

また、保存先については以下の方針にする。

> Notionは当面の検証・管理用には使えるが、数千〜数万人規模の主データベースとしては使わない。  
> スケール前提では、ユーザー/フレーズ/SRS/カテゴリを通常のアプリDBに移す。

---

## 1. 保存先方針

### 1-1. Notionを主DBとして使い続けてよいか

結論:

> **数千人、数万人に使ってもらう前提なら、Notionをフレーズ蓄積の主DBにするのは避ける。**

理由:

- APIレート制限やレスポンス速度の制約を受けやすい
- 大量レコードの検索・絞り込み・ページング・集計に向かない
- ユーザー単位の権限管理、削除、エクスポート、監査ログを作りにくい
- SRSのように頻繁に更新されるデータと相性が悪い
- 将来の課金、プラン制限、利用量計測、分析に接続しづらい
- Notionは「運用者が見る管理画面」としては優秀だが、「ユーザー数万人の本番DB」としては責務が重い

### 1-2. 短期方針

V0.2では、以下でよい。

| データ | 保存先 | 理由 |
|---|---|---|
| ゲストの即時利用データ | localStorage | ログインなしですぐ使うため |
| ログイン済みユーザーの本データ | 将来DB想定。現時点ではNotionまたはlocalStorage併用 | まだ課金前・検証中 |
| インタビュー/分析用のサンプル保存 | Notion | 運用者が眺めるには便利 |
| SRS進捗 | localStorage優先 | 更新頻度が高くNotionと相性が悪い |

### 1-3. 中期方針

課金リリースまたはユーザー数が増える前に、以下へ移行する。

候補:

- Supabase Postgres
- Neon Postgres
- PlanetScale / MySQL系
- Firebase / Firestore

このプロダクトでは、以下の理由で **Postgres系** が第一候補。

- ユーザー、フレーズ、カテゴリ、SRS、利用ログを正規化しやすい
- 将来、検索・集計・課金・分析に接続しやすい
- フレーズ共有や匿名化データ活用にも発展しやすい

### 1-4. Notionの役割

Notionは捨てるのではなく、役割を変える。

| 役割 | Notion利用可否 |
|---|---|
| 初期検証ログ | 使う |
| 運営者向けの手動レビュー | 使う |
| 代表フレーズのキュレーション | 使う |
| 全ユーザーの本番フレーズDB | 使わない |
| SRS進捗の本番保存 | 使わない |
| 課金/権限/ユーザー管理 | 使わない |

---

## 2. 認証方針

### 2-1. 基本方針

> **ログインなしで即利用できる。右上にログインボタンを置き、ログインすると同期・復元・複数端末利用ができる。**

これは顧客発見の示唆に合う。

- 会話中に使うなら、ログイン強制は摩擦が大きい
- 現地で困った瞬間にすぐ開ける必要がある
- ただし、長期利用・端末変更・課金にはログインが必要
- 自分用コードは一般ユーザーには分かりづらく、今後廃止する

### 2-2. 画面上の扱い

全画面共通で右上に表示する。

未ログイン:

```text
[ログイン]
```

ログイン済み:

```text
[ユーザー名 or アイコン]
```

ログイン導線の説明:

```text
ログインすると、フレーズを別端末でも復元できます。
ログインしなくても、この端末ではそのまま使えます。
```

### 2-3. 自分用コードの扱い

現在の自分用コード運用は段階的に廃止する。

| 段階 | 方針 |
|---|---|
| V0.2 | UIからは目立たせない。既存ユーザー互換のため内部では残す |
| V0.3 | ログイン済みユーザーは ownerKey ではなく userId で同期 |
| 課金前 | 自分用コード入力UIを削除または「旧データ復元」扱いにする |

### 2-4. ゲスト利用

ログインしないユーザーは、匿名ゲストとして利用する。

保存先:

- localStorage

できること:

- フレーズ追加
- 中→日/日→中翻訳
- ライブラリ保存
- カテゴリ分け
- ドリル

できないこと:

- 端末間同期
- 端末紛失時の復元
- 有料プランの利用
- 共有フレーズへの投稿

### 2-5. ログイン時のデータ引き継ぎ

ゲスト状態で使った後、ログインした場合は以下を出す。

```text
この端末に保存されているフレーズをアカウントに同期しますか？

[同期する] [あとで]
```

同期する場合:

- localStorageのPhraseをDBへアップロード
- ローカルIDとサーバーIDの対応を保存
- 重複は `clientId` または内容ハッシュで回避

### 2-6. 認証方式の候補

V0.2では、仕様だけ決めて実装はP0必須ではない。

候補:

- Supabase Auth
- Clerk
- NextAuth/Auth.js

推奨:

> DBをSupabase/Postgresに寄せるなら、Supabase Authが自然。

ただし、現時点ではログイン実装そのものより、**ログインなし即利用を壊さないデータ設計**が重要。

---

## 3. データモデル

### 3-1. V0.2ローカルモデル

```ts
export type PhraseDirection = "ja-to-zh" | "zh-to-ja";

export type PhraseSource = "manual" | "conversation" | "prototype";

export type Phrase = {
  id: string;
  japanese: string;
  chinese: string;
  pinyin: string;
  explanation: string;
  audioUrl: string | null;
  createdAt: string;

  direction: PhraseDirection;
  categoryId: string | null;
  shouldDrill: boolean;
  source: PhraseSource;
  usedAt: string | null;
};
```

既存データの補完:

```ts
direction: "ja-to-zh"
categoryId: null
shouldDrill: true
source: "manual"
usedAt: null
```

### 3-2. カテゴリモデル

```ts
export type PhraseCategory = {
  id: string;
  label: string;
  builtIn: boolean;
  createdAt: string;
};
```

初期カテゴリ:

```ts
[
  { id: "poker-table", label: "ポーカー卓", builtIn: true },
  { id: "floor", label: "フロア/手続き", builtIn: true },
  { id: "restaurant", label: "レストラン", builtIn: true },
  { id: "transport", label: "移動", builtIn: true },
  { id: "hotel", label: "ホテル", builtIn: true },
  { id: "shopping", label: "買い物", builtIn: true },
  { id: "work", label: "仕事", builtIn: true },
  { id: "hospital", label: "病院", builtIn: true },
  { id: "other", label: "その他", builtIn: true }
]
```

V0.2では自由カテゴリ作成は任意。  
まずは初期カテゴリで検証する。

### 3-3. 将来DBモデル案

Postgres想定。

```text
users
- id
- email
- display_name
- created_at

phrases
- id
- user_id
- client_id
- direction
- japanese
- chinese
- pinyin
- explanation
- category_id
- should_drill
- source
- used_at
- created_at
- updated_at

phrase_categories
- id
- user_id
- label
- built_in
- created_at

srs_items
- id
- phrase_id
- user_id
- status
- next_review_at
- interval_days
- ease_factor
- consecutive_good
- last_score
- last_reviewed_at

usage_events
- id
- user_id
- phrase_id
- event_type
- created_at
```

Notionには必要に応じて代表データだけ同期する。

---

## 4. 画面仕様

### 4-1. 共通ヘッダー

全画面に簡易ヘッダーを置く。

左:

- アプリ名
- ホーム導線

右:

- 未ログイン: `ログイン`
- ログイン済み: ユーザー名/アイコン

V0.2ではログインボタンを押した時に、未実装ならモーダル/説明だけでもよい。

表示例:

```text
ログインすると、フレーズを別端末でも復元できます。
今はログインなしでこのまま使えます。
```

---

### 4-2. 追加/翻訳画面

現在の `/add` を拡張する。

#### UI要素

1. 方向切替
   - `日本語 → 中国語`
   - `中国語 → 日本語`

2. 入力欄
   - 方向に応じてラベルを変更
   - 日→中: `言いたかった日本語`
   - 中→日: `聞き取った/見かけた中国語`

3. 音声入力
   - 日→中: `ja-JP`
   - 中→日: `zh-CN`
   - V0.2では中→日音声はP1扱い。実装できる場合のみ

4. 生成ボタン
   - 日→中: `中国語にする`
   - 中→日: `意味を確認する`

5. 結果表示
   - 日本語
   - 中国語
   - ピンイン
   - 解説
   - 音声再生

6. 保存オプション
   - カテゴリ選択
   - `ドリルにも追加する` チェック

7. 保存ボタン
   - `ライブラリに保存`

#### 初期値

- 方向: `日本語 → 中国語`
- カテゴリ: `その他`
- ドリル追加: `true`

ただし、中→日の場合は `ドリル追加: false` でもよい。  
顧客反応を見たいなら、方向にかかわらずユーザーに選ばせる。

---

### 4-3. ライブラリ画面

現在の `/library` を拡張する。

#### UI要素

1. 検索
   - 日本語
   - 中国語
   - ピンイン

2. カテゴリフィルタ
   - 全て
   - ポーカー卓
   - フロア/手続き
   - レストラン
   - 移動
   - ホテル
   - 買い物
   - 仕事
   - 病院
   - その他

3. ドリル対象フィルタ
   - 全て
   - ドリル対象
   - ライブラリのみ

4. 方向表示
   - `日→中`
   - `中→日`

5. カード内表示
   - 日本語
   - 中国語
   - カテゴリ
   - ドリル対象バッジ
   - SRSステータス

6. 展開時アクション
   - 音声再生
   - ドリルに追加/外す
   - カテゴリ変更
   - 削除

#### 重要

ライブラリは全件表示する。  
SRSステータスがないものも表示する。

---

### 4-4. ドリル画面

現在の `/drill` を修正する。

#### 変更点

- `shouldDrill === true` のフレーズだけ対象
- `shouldDrill === false` のフレーズは出題しない
- SRSデータ生成もドリル対象に限定する

#### 空状態

```text
今日のドリル対象はありません。
ライブラリから覚えたいフレーズを「ドリルに追加」できます。
```

---

## 5. API仕様

### 5-1. `/api/phrase/add`

既存APIを拡張する。

#### Request

```ts
type AddPhraseRequest = {
  direction: "ja-to-zh" | "zh-to-ja";
  text: string;
  ownerKey?: string; // 旧互換
  nickname?: string; // 旧互換
  phraseId?: string;
};
```

既存の `japanese` は後方互換で受け付ける。

#### Response

```ts
type AddPhraseResponse = {
  id: string | null;
  direction: "ja-to-zh" | "zh-to-ja";
  japanese: string;
  chinese: string;
  pinyin: string;
  explanation: string;
  audioUrl: string | null;
};
```

### 5-2. プロンプト方針

#### 日→中

現行プロンプトを維持しつつ、保存/カテゴリとは分離する。

#### 中→日

目的:

- 相手の発話や見かけた中国語を理解する
- ピンインと自然な日本語訳を出す
- 必要なら「この返答にどう返せばよいか」まで短く示す

出力形式は同じ。

```json
{
  "japanese": "自然な日本語訳",
  "chinese": "入力された中国語を整えたもの",
  "pinyin": "ピンイン",
  "explanation": "日本語の短い解説"
}
```

---

## 6. localStorage仕様

### 6-1. フレーズ

既存:

```text
poker-chinese-local-phrases-v1
```

V0.2ではキーは維持してよい。  
読み込み時に不足フィールドを補完する。

### 6-2. カテゴリ

新規:

```text
poker-chinese-phrase-categories-v1
```

初回ロード時に初期カテゴリを返す。

### 6-3. ログイン状態

V0.2ではログイン未実装なら不要。  
将来:

```text
poker-chinese-auth-session-v1
```

ただし認証ライブラリ導入後は、そのライブラリに任せる。

---

## 7. Notion連携仕様

### 7-1. V0.2での扱い

Notion保存は残してよいが、本番主DB扱いにはしない。

Notionへ保存する場合は、以下のプロパティを追加できるとよい。

- Direction
- Category
- Should Drill
- Source
- Used At

ただし、第三フェーズの検証には必須ではない。  
最優先はローカル体験。

### 7-2. 注意点

現状APIは生成直後に `after()` でNotion保存している。  
V0.2では「保存する」前の生成もあり得るため、理想は以下に分ける。

1. 生成API
   - 翻訳/生成だけ
2. 保存API
   - ユーザーが保存したものだけ永続化

ただし短期では、既存APIのままでも検証は可能。  
実装負荷を下げるなら、V0.2では「生成＝保存」としつつ、UIで保存済みとして扱う。

推奨:

> V0.2では、生成APIと保存APIの分離までは必須にしない。  
> ただしV0.3以降、DB移行時に分離する。

---

## 8. 実装順

### Step 1. 型とローカル保存

- `PhraseDirection`
- `PhraseSource`
- `PhraseCategory`
- `Phrase` 拡張
- `loadLocalPhrases()` で既存データ補完
- カテゴリのlocalStorage関数追加

### Step 2. SRS対象の分離

- `ensureSrsItems()` を `shouldDrill` 対象に限定
- ライブラリから「ドリルに追加/外す」
- ドリル画面の空状態修正

### Step 3. API拡張

- `/api/phrase/add` に `direction` と `text` を追加
- 既存 `japanese` も受ける
- 中→日プロンプト追加

### Step 4. 追加画面

- 方向切替
- ラベル切替
- カテゴリ選択
- ドリル追加チェック
- 保存後結果表示

### Step 5. ライブラリ

- カテゴリフィルタ
- ドリル対象フィルタ
- カテゴリバッジ
- ドリル追加/外すボタン

### Step 6. 共通ヘッダー/ログイン導線

- 右上ログインボタン
- 未ログインでも使える説明
- 自分用コードUIを目立たせない

---

## 9. 今回は実装しないもの

- 本格ログイン
- DB移行
- 課金
- 画像翻訳
- 共有フレーズ
- 自動カテゴリ分類
- ビジネス長文/複数候補
- 通知/予定化
- 広東語対応

---

## 10. 実装後に確認すること

既存テスター/インタビュー対象者に以下を確認する。

1. 中→日があることで、会話中に開く理由が増えたか
2. Google翻訳ではなくこちらを使う理由があるか
3. 全件ライブラリは価値があるか
4. 状況別カテゴリは自然か
5. ドリル対象を選べることは良いか、面倒か
6. ログインなし即利用は安心か
7. 右上ログイン導線は自然か
8. 有料ならいくらまで許容か

