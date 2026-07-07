# User Segments

最終更新: 2026-06-08

この文書は、Phrabit の対象ユーザーを、初期ビーチヘッド、拡張候補、対象外に分けて整理します。資料上の事実と仮説を混ぜないよう、検証状態も併記します。

## セグメント整理の前提

Phrabit は「中国語を勉強したい人全員」向けではありません。

中心に置くのは、日本語を主言語にしつつ、海外現場で短い言葉が出ず、翻訳した内容を次に自分で言える状態へ戻したい人です。

根拠:

- `docs/product-vision.md`
- `docs/strategy-reset-2026.md`
- `docs/customer-understanding-synthesis.md`
- `docs/interview-playbook.md`

## セグメント一覧

| セグメント | 優先度 | 検証状態 | 主な課題 |
|------------|--------|----------|----------|
| 海外ライブポーカー日本人 | A | 実地検証中 | 卓上・フロア・食事で言えない、損や疎外感がある |
| 中国出張ビジネス層 | B | 仮説/募集設計あり | 会議、工場、接待、移動で口頭表現が詰まる |
| 駐在員 | B | 一部観察あり | 業務と生活で翻訳依存、専門語やニュアンスが課題 |
| 駐在帯同家族 | B | 一部観察あり | 生活場面の聞き取り、注文、問い合わせで詰まる |
| 高モチベーション学習者 | C | 仮説 | 知識はあるが反射で出ない |
| 無関心/翻訳で十分な層 | 対象外寄り | Bad signal | 保存・復習への進歩がない |

## 初期ビーチヘッド: 海外ライブポーカー日本人

### 定義

マカオや中国語圏でライブポーカーをする日本人。特に、中国語や英語が分かる・言えることに、損失回避、会話参加、関係構築の価値を感じる人。

### 代表的な場面

- 卓上で席、順番、ルール、相手の発言を確認する
- フロアやスタッフに状況を説明する
- レストランや移動で短い会話をする
- 中国人プレイヤーの輪に入る
- 英語押し切りで通じない、または微妙な空気が残る

### Good signal

- 直近の具体的な困りごとが出る
- 金銭損失、機会損失、疎外感、悔しさが語られる
- 「次は自分で言いたい」が出る
- 翻訳した一言を保存・復習したいと言う

### Bad signal

- 「英語で十分」
- 「翻訳で困っていない」
- 「中国語になりたい自分がない」
- 具体的な場面が出ない

根拠:

- `docs/customer-discovery.md`
- `docs/macao-field-test-log.md`
- `docs/interviews/observation-001-tanaka-macau-poker.md`
- `docs/interviews/observation-002-daisuke-macau-poker.md`
- `docs/interviews/observation-003-aochan-macau-poker.md`
- `docs/interviews/observation-004-takumi-macau-poker.md`
- `docs/interviews/observation-005-mitochan-macau-poker.md`
- `docs/interviews/observation-006-kenta-guangzhou-macau-poker.md`

## 拡張候補: 中国出張ビジネス層

### 定義

日本在住または日本法人所属で、直近12か月以内に業務で中国語圏へ渡航し、現地で口頭コミュニケーションが発生した人。

### 代表的な場面

- 会議
- 工場・現場確認
- 現地スタッフへの指示
- 接待
- 税関・移動
- 仕様や条件の確認

### 想定課題

- 言いたいことは日本語で明確だが、中国語や英語で自然に出ない
- 翻訳文のニュアンスや責任範囲が不安
- 専門用語を保持したい
- その場限りでなく、次の出張でも使いたい

### 検証状態

仮説段階です。`docs/crowdworks-interview-recruitment.md` で募集条件と除外条件が整理されています。

根拠:

- `docs/crowdworks-interview-recruitment.md`
- `docs/persona-draft.md`
- `docs/interviews/observation-008-furuya-shanghai-business-se.md`
- `docs/interviews/observation-009-urano-china-resident-business.md`

## 拡張候補: 駐在員

### 定義

中国語圏に駐在または長期滞在し、業務や生活で中国語に触れる日本語話者。

### 代表的な場面

- 現地スタッフとの業務会話
- 資料やチャットの翻訳
- 生活手続き
- 店舗、病院、学校、管理会社などとのやり取り

### 想定課題

- 翻訳依存を減らしたい
- 業務表現を自分で言えるようにしたい
- 聞き取りと返答の想定が難しい
- 機密や保存への抵抗がある可能性

### 検証状態

一部観察がありますが、セグメントとしての強さは未確定です。

根拠:

- `docs/persona-draft.md`
- `docs/interviews/observation-009-urano-china-resident-business.md`
- `docs/interview-playbook.md`

## 拡張候補: 駐在帯同家族

### 定義

駐在員に帯同し、仕事ではなく生活場面で現地語に触れる家族。

### 代表的な場面

- 買い物
- 子ども関連のやり取り
- 病院
- 管理会社
- タクシー
- レストラン

### 想定課題

- 聞き取りが難しい
- 想定返答が分からない
- 翻訳履歴を後で見返したい
- 生活で繰り返す表現だけ覚えたい

### 検証状態

観察はありますが、課金意欲や継続利用は未確定です。

根拠:

- `docs/interviews/observation-007-mori-shanghai-accompanying-family.md`
- `docs/interview-observation-sheet.md`

## 拡張候補: 高モチベーション学習者

### 定義

中国語や英語を学んでいて、知識としては理解しているが、現場で反射的に使うことに課題を感じる人。

### 想定課題

- 教材の例文が自分の現場に合わない
- 単語や文法は分かるが口から出ない
- 自分が使う表現だけを練習したい

### 検証状態

仮説段階です。ご意見番候補へのヒアリングで、学習継続や教材設計の観点を補強する予定です。

根拠:

- `docs/opinion-leader-candidates.md`
- `docs/jtbd-product-jobs-draft.md`
- `docs/customer-understanding-synthesis.md`

## 対象外または優先度低

| 対象 | 理由 | 根拠 |
|------|------|------|
| 中国語母語級/準母語級 | 課題構造が違う | `docs/crowdworks-interview-recruitment.md` |
| 本業の日中通訳・翻訳者 | 一般ユーザーと品質基準が違う。別枠なら有用 | `docs/crowdworks-interview-recruitment.md` |
| 翻訳アプリで完全に満足している人 | 雇い替え理由が弱い | `docs/interview-playbook.md` |
| 中国語や英語を自分で言いたい進歩がない人 | 保存・復習価値が弱い | `docs/interview-playbook.md` |
| カジノ/ポーカーだけが目的だが言語課題がない人 | 初期ビーチヘッド内でも対象外になりうる | `docs/customer-discovery.md` |

## セグメント横断の見方

Phrabit が強く刺さるユーザーは、属性ではなく次の条件で見ます。

1. 直近の現場エピソードがある
2. 言えなかった一言が具体的にある
3. 既存解に不満がある
4. 次に自分で言えるようになりたい
5. 保存・復習・再訪の行動が起きる

根拠:

- `docs/interview-playbook.md`
- `docs/interview-observation-sheet.md`
- `docs/product-concept-validation-plan.md`

