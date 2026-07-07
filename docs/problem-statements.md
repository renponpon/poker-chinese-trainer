# Problem Statements

最終更新: 2026-06-08

この文書は、Phrabit が解く課題をセグメント別に整理します。課題ではないもの、まだ仮説のものも分けて扱います。

## 共通課題

中心課題:

> 翻訳でその場は理解できるが、次の会話で自分の口から出てこない。

この課題は、単なる翻訳精度不足ではありません。既存の翻訳アプリや ChatGPT で意味は分かっても、次の似た場面で自分の言葉として使えないことが問題です。

根拠:

- `docs/product-vision.md`
- `docs/customer-understanding-synthesis.md`
- `docs/jtbd-product-jobs-draft.md`
- `public/launch/*.png`

## 課題の構造

```text
現場で言いたいことがある
  -> 外国語で出ない
  -> 翻訳アプリやAIで調べる
  -> その場は理解する
  -> 履歴や文脈が流れる
  -> 次の会話でまた出ない
```

Phrabit は、この流れを次のように変えることを狙います。

```text
現場で言いたいことがある
  -> 翻訳する
  -> 読み・使い方まで確認する
  -> 保存する
  -> ドリルする
  -> 次の現場で使う
```

根拠:

- `docs/domain-map.md`
- `docs/mvp-next-iteration-spec.md`
- `docs/product-concept-validation-plan.md`

## ポーカー層の課題

### 課題文

海外ライブポーカーの現場で、卓上・フロア・レストランなどの短いやり取りを英語や翻訳で押し切っているが、言い通せない、輪に入れない、損をする、悔しさが残る。

### 代表場面

- この席は空いていますか
- 順番やルールを確認したい
- フロアに状況を説明したい
- 中国人プレイヤー同士の会話が分からない
- レストランやカジノ内で短い注文・確認をしたい

### 既存解

- 英語で押し切る
- Google 翻訳
- ChatGPT
- 笑顔やジェスチャー
- 諦める/流す

### 既存解の不満

- 会話中に翻訳を開くタイミングが難しい
- 相手を待たせる
- 翻訳した表現が次に残らない
- 中国語の輪に入れない
- 損失や悔しさにつながる

根拠:

- `docs/macao-field-test-log.md`
- `docs/customer-discovery.md`
- `docs/interviews/observation-001-tanaka-macau-poker.md` から `docs/interviews/observation-006-kenta-guangzhou-macau-poker.md`

## 中国出張ビジネス層の課題

### 課題文

業務で中国語圏へ渡航したとき、会議・工場・接待・移動などで言いたいことはあるが、現地語で自然に出せず、翻訳の自然さ、専門用語、責任範囲に不安が残る。

### 代表場面

- 現地スタッフへの指示
- 工場や現場での確認
- 会議中の短い発言
- 接待や移動中の会話
- 仕様・納期・条件の確認

### 既存解

- 通訳者
- Google 翻訳
- DeepL
- ChatGPT
- 現地スタッフに聞く
- 英語で押し切る

### 既存解の不満

- 専門用語が崩れる
- 翻訳候補が現場のニュアンスに合っているか不安
- 機密や履歴保存が気になる
- 次の出張で同じ表現をまた調べる

根拠:

- `docs/crowdworks-interview-recruitment.md`
- `docs/persona-draft.md`
- `docs/interviews/observation-008-furuya-shanghai-business-se.md`
- `docs/interviews/observation-009-urano-china-resident-business.md`

## 駐在・生活層の課題

### 課題文

生活場面で繰り返し中国語に触れるが、聞き取り・返答・注文・問い合わせで詰まり、翻訳に頼っても次に自分で言える状態になりにくい。

### 代表場面

- 買い物
- 病院
- 学校や子ども関連
- 管理会社
- タクシー
- レストラン

### 既存解

- 翻訳アプリ
- WeChat翻訳
- 現地の知人に聞く
- 家族や通訳者に頼る
- 諦める

### 既存解の不満

- 聞き取りが追いつかない
- 想定返答が分からない
- 翻訳履歴が復習につながらない
- 同じ場面でまた詰まる

根拠:

- `docs/interviews/observation-007-mori-shanghai-accompanying-family.md`
- `docs/interview-observation-sheet.md`
- `docs/persona-draft.md`

## 学習高動機層の課題

### 課題文

教材や単語アプリで知識は増えるが、自分が現場で使いたい表現に結びつかず、会話速度で口から出ない。

### 既存解

- Duolingo
- 中国語教室
- オンラインレッスン
- YouTube
- Anki
- 単語帳

### 既存解の不満

- 自分に関係ない単語を覚える
- 教材の例文が現場とずれる
- カード作成が面倒
- 会話現場で反射的に使えない

根拠:

- `docs/customer-understanding-synthesis.md`
- `docs/jtbd-product-jobs-draft.md`
- `docs/opinion-leader-candidates.md`
- `docs/positioning-map.md`

## 課題ではないもの

| 課題ではないもの | 理由 |
|------------------|------|
| 最高精度の翻訳エンジンを作ること | Phrabit の価値は provider そのものではなく、保存・復習・再利用の流れにある |
| 中国語総合教材を作ること | 現場フレーズ中心であり、教材網羅性は主目的ではない |
| すべての会話を自動保存すること | 会話画面は `persist:false` 方針。保存は明示的操作に寄せる |
| 中国語母語級ユーザーの翻訳品質評価に最適化すること | 一般ユーザーの課題構造と異なる |

根拠:

- `AGENTS.md`
- `docs/translation-provider-evaluation.md`
- `docs/crowdworks-interview-recruitment.md`

## 検証すべき課題仮説

| 仮説 | 判定に必要な観察 |
|------|------------------|
| 翻訳後に保存したいフレーズがある | 保存率、保存理由の発話 |
| 後で覚えたい場面と会話成立場面が重なる | インタビューで同じ場面か別場面かを確認 |
| ドリルが「次に言える」感覚につながる | D1/D7再訪、ドリル後の主観評価 |
| ポーカー外にも同じ課題がある | 出張/駐在/帯同層の直近エピソード |
| 支払い意思がある | 自発的な金額言及、価格提示への反応 |

根拠:

- `docs/open-questions.md`
- `docs/product-concept-validation-plan.md`
- `docs/interview-playbook.md`

