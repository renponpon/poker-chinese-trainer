# Phrabit Product Vision

最終更新: 2026-06-08

この文書は、資料読み込みと統合整理を踏まえた Phrabit の現在定義をまとめる正本候補です。古い `README.md` や `SayItNext` 表記の残る資料よりも、現在のプロダクト定義を確認する用途で参照します。

## 一文定義

Phrabit は、海外現場で調べた短いフレーズを、翻訳・保存・復習し、次に自分で言える言葉へ変えるアプリです。

短いコピーとしては、以下が現在の訴求に最も近いです。

> 現地で訳したフレーズを、次は自分の言葉に。

根拠:

- `docs/strategy-reset-2026.md`
- `docs/handoff-codex.md`
- `docs/product-concept-validation-plan.md`
- `docs/mvp-next-iteration-spec.md`
- `public/launch/*.png`

## コア価値

1. 翻訳で終わらせない

   Google 翻訳や ChatGPT で調べた一言を、その場限りの理解で終わらせず、次に自分で言える状態へ近づける。

2. ユーザー固有の現場フレーズを残す

   一般教材の例文ではなく、ユーザー自身が現場で必要になった表現を、個人のライブラリとして蓄積する。

3. 翻訳・読み・使い方・保存・ドリルをつなぐ

   訳文だけでなく、ピンイン/読み、使う場面、自然な言い方、復習までを一連の流れにする。

4. 翻訳アプリと学習アプリの間の空白を埋める

   既存翻訳ツールは「調べる」には強く、Anki は「反復」には強い。Phrabit は、現場で調べた一言を反復対象へ変える部分に価値を置く。

根拠:

- `docs/positioning-map.md`
- `docs/competitor-analysis.md`
- `docs/market-competitor-refresh-2026.md`
- `docs/translation-provider-evaluation.md`

## 対象ユーザー

### 初期ビーチヘッド

海外ライブポーカー、特にマカオ・中国語圏でプレイする日本人。

この層では、卓上、フロア対応、レストラン、現地プレイヤーとのやり取りで「その場で言えなかった一言」が発生しやすい。中国語や英語が分かることが、損失回避、会話参加、関係構築につながる人を主対象とする。

根拠:

- `docs/customer-discovery.md`
- `docs/macao-field-test-log.md`
- `docs/strategy-reset-2026.md`
- `docs/interviews/observation-001-tanaka-macau-poker.md` から `docs/interviews/observation-006-kenta-guangzhou-macau-poker.md`

### 拡張候補

- 中国出張ビジネス層
- 駐在員
- 駐在帯同家族
- 海外生活者
- 高モチベーションの語学学習者

いずれも、日本語を主言語にしつつ、海外現場で聞き取り・発話・場の空気に詰まる人が対象です。

根拠:

- `docs/persona-draft.md`
- `docs/crowdworks-interview-recruitment.md`
- `docs/interviews/observation-007-mori-shanghai-accompanying-family.md`
- `docs/interviews/observation-008-furuya-shanghai-business-se.md`
- `docs/interviews/observation-009-urano-china-resident-business.md`

### 対象外または優先度低

- 中国語母語級、または準母語級で現場に困っていない人
- 翻訳アプリや ChatGPT で十分に完結している人
- 保存や復習に価値を感じない人
- 中国語や英語を「自分で言えるようになりたい」という進歩がない人

根拠:

- `docs/interview-playbook.md`
- `docs/interview-observation-sheet.md`
- `docs/crowdworks-interview-recruitment.md`

## 解決する課題

中心課題:

> 翻訳でその場は理解できるが、次の会話で自分の口から出てこない。

課題はセグメントごとに入口が違います。

| セグメント | 課題の入口 |
|------------|------------|
| ポーカー層 | 卓上、フロア、レストランで言い通せない。損失や疎外感につながる |
| 出張・業務層 | 会議、工場、現地スタッフへの指示でニュアンスや責任範囲がずれる |
| 駐在・生活層 | 日常会話、注文、問い合わせ、聞き取りで毎回詰まる |
| 学習高動機層 | 単語や文法は知っていても、会話速度で反射的に出ない |

根拠:

- `docs/customer-understanding-synthesis.md`
- `docs/jtbd-product-jobs-draft.md`
- `docs/interview-playbook.md`
- `docs/interviews/*.md`

## 現在のプロダクト範囲

| 範囲 | 状態 |
|------|------|
| 翻訳 | 中核機能。速度/通常/品質の provider 使い分けがある |
| 読み・ピンイン | 中国語では重要な補助情報 |
| 使い方・解説 | 品質モードやドリル追加時の価値 |
| 保存 | ライブラリ化の中心 |
| ドリル/SRS | 次に言える状態へつなぐ |
| 会話補助 | 会話中に翻訳する。ただし自動保存しない |
| 利用計測 | provider、mode、feature、source_page などで計測する |
| 多言語 | 中国語と英語に対応しうる構造がある |

根拠:

- `AGENTS.md`
- `docs/handoff-codex.md`
- `docs/translation-provider-evaluation.md`
- `supabase/schema.sql`
- `package.json`

## やらないこと

- 翻訳精度そのものだけで競争しない
- 中国語総合教材アプリとして広げすぎない
- 初期フェーズで大規模リファクタやスコープ外機能を優先しない
- 会話中の翻訳を自動でライブラリ保存しない
- 実地検証中に、ログや観察より機能追加を優先しない

根拠:

- `AGENTS.md`
- `docs/phase2-runbook.md`
- `docs/translation-provider-evaluation.md`

## 現在フェーズ

現在は、マカオ実地検証を中心に、保存・ドリル・再訪が本当に行動として成立するかを確認するフェーズです。

直近では、次の問いが重要です。

- Google 翻訳や ChatGPT ではなく Phrabit を開く理由があるか
- 翻訳後に保存するか
- 保存したフレーズをドリルに追加するか
- D1/D7 で再訪するか
- ポーカー以外の出張・駐在層にも同じ課題があるか

根拠:

- `docs/phase2-runbook.md`
- `docs/phase2-open-todos.md`
- `docs/product-concept-validation-plan.md`
- `docs/macao-field-test-log.md`

