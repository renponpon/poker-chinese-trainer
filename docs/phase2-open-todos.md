# 第二フェーズ・未実施 Todo 一覧

`customer-discovery.md` の A〜D・補足と、会話で出ていた項目を **チェックリスト化** したもの。  
週次は引き続き [`phase2-runbook.md`](./phase2-runbook.md) をコピーして使い、**塊の進捗**はこのファイルで追う。

**更新ルール**: 完了したら `- [ ]` を `- [x]` にし、日付を括弧でメモしてもよい。

### 運用方針（2026-05 反映）

- **紹介依頼**: 30人への一括DMは**送らない**。各インタビューの **CLOSE で口頭**（紹介してほしい人1人）。対象はインタビューに応じてくれそうな母数に依存。
- **X公募**: **一旦しない**。ビーチヘッド候補は **既に30人以上**。母数が尽きる／断られ続けるなどのときだけ [`x-recruitment-draft.md`](./x-recruitment-draft.md) を使う。
- **マカオで会う人**: 渡航**前**に10〜14名を固めない。**現地入り後**に誰がいついるか確認して組む（在マカオ組は**だいたい1か月周期**で入れ替わりが大きい想定）。

---

## A. 初回の顧客訪問・母数づくり

### リスト・分類

- [ ] 候補顧客を **43〜58名** 規模で名簿化（セグメント列つき）[`customer-discovery.md`](./customer-discovery.md) A-1
- [ ] ポーカー知人 **30人** の **本業 / 副業 / 元職** を洗い出し（ビジネス層フィルタ用）A-2 戦術1
- [ ] **マカオ到着後**、会う相手・日程を現地で仮押さえ（対面 **10〜14件** 目標。事前の確定リストは不要）

### 接触・紹介

- [ ] ポーカー知人 **約30人** にインタビューし、**各回CLOSEで口頭紹介依頼**（一括DMは行わない）。転送用文が必要なら [`beachhead-outreach-templates.md`](./beachhead-outreach-templates.md)
- [ ] （**保留中・最終手段**）**X公募** — 上記母数で足りなくなったら実投稿
- [ ] **ご意見番** 候補から **5通程度** コールドDM（文面は個別最適化）[`opinion-leader-candidates.md`](./opinion-leader-candidates.md)
- [ ] 紹介経由の **アポ確定・インタビュー実施** を継続的に積む
- [ ] 中国ビジネス・中国語系 **発信者 5〜10人** ピックアップ → DM（戦術4）
- [ ] （任意）**クラウドワークス**で非ビーチヘッド向けインタビュー募集 → [`crowdworks-interview-recruitment.md`](./crowdworks-interview-recruitment.md)

### マカオ（滞在フェーズ）

- [ ] 対面インタビュー **10〜14件**（目標カデンス: 1日2件×数日）A-5 Month 2
- [ ] **卓上の反応** とインタビュー発言の突合メモ
- [ ] **イノベーター候補** の芋づる紹介の打診

---

## B. 課題インタビュー・仮説検証

### 本数・判定

- [x] 課題インタビュー **累計 5〜10件**（目安達成まで継続）（2026-05-19: `observation-001〜008` で暫定達成。5/21は補足サンプル）
- [x] **B-6 判定**（仮説「強い / 弱い / 再構築」）を1ページに書く [`customer-discovery.md`](./customer-discovery.md) B-6（2026-05-19: [`phase2-b6-hypothesis-decision.md`](./phase2-b6-hypothesis-decision.md)）
- [ ] （任意）課題プレゼン用 **Notion 5枚** — B-3 オプションB

### インタビュー運用

- [ ] 各回 **観察シート記入**（直後3分以内）→ [`interviews/`](./interviews/) に `observation-NNN-*.md`
- [ ] 各回 **CLOSE** で「同じ悩みの人 **1人だけ** 紹介」の打診（録画の有無に関わらず徹底）[`interview-playbook.md`](./interview-playbook.md)
- [ ] **プロトタイプ試用** を別枠で設計（課題インタビューと時間を分ける）A-4

---

## C. 顧客理解の深化

- [x] 観察シート **5〜10件分** の横断集計（痛みワード・タグ）C-2（2026-05-19: [`customer-understanding-synthesis.md`](./customer-understanding-synthesis.md)）
- [ ] [`persona-draft.md`](./persona-draft.md) の **テスター欄・未検証ペルソナ** の更新（インタビューごとに1行でも）
- [x] C-1 フレーム（ルーティン・接触頻度・挫折・痛みトップ3 等）を **セグメント別に埋める**（2026-05-19: [`customer-understanding-synthesis.md`](./customer-understanding-synthesis.md)）

### 第三フェーズへの接続

- [x] 製品コンセプト検証メモを作成（2026-05-19: [`product-concept-validation-plan.md`](./product-concept-validation-plan.md)）
- [x] 改修優先度ドキュメントを作成（2026-05-19: [`product-iteration-priority.md`](./product-iteration-priority.md)）
- [x] コンセプト確認用スクリプトを作成（2026-05-19: [`product-concept-test-script.md`](./product-concept-test-script.md)）
- [x] 次イテレーションの簡易仕様を作成（2026-05-19: [`mvp-next-iteration-spec.md`](./mvp-next-iteration-spec.md)）

---

## D. 市場知識・競合

- [ ] **中国への短期出張者数（日系）** の定義整理と一次ソース当たり [`customer-discovery.md`](./customer-discovery.md) 補足表・D系
- [ ] **マカオ訪問日本人** 等、必要なら一次確認を追加 [`market-sizing.md`](./market-sizing.md)
- [ ] **競合の実使用メモ**（Duolingo / ChatGPT 等を実際に触る）を継続 [`competitor-analysis.md`](./competitor-analysis.md)
- [ ] （優先度低）**HSK日本の公式年間受験者数** — 必要になったら取得 [`market-sizing.md`](./market-sizing.md)

---

## ログ・資産（将来ドキュメント）

[`customer-discovery.md`](./customer-discovery.md) 「将来追加予定」相当。

- [ ] **インタビュー記録（テスター別）** の置き場と命名を決め、転記開始
- [ ] **フィードバックフォーム** の回答集計（フォームがあれば）
- [ ] **候補顧客リスト（50人）** スプレッドシート or md
- [ ] **ファウンダーストーリー**（30秒・60秒・2分）
- [ ] （任意）ご意見番用 **`opinion-leader-log.md`**

---

## すでに着手済み（参照用・チェック不要）

- [x] インタビュープレイブック・観察シートテンプレ
- [x] ビーチヘッド依頼文テンプレ（Layer A/B/C）
- [x] X公募文案ドラフト
- [x] ご意見番候補リスト
- [x] 競合分析・市場規模の初版
- [x] 観察シート記入例: [`interviews/observation-001-tanaka-macau-poker.md`](./interviews/observation-001-tanaka-macau-poker.md)

---

## 関連

- [`phase2-runbook.md`](./phase2-runbook.md) — 週次の細かいチェック
- [`customer-discovery.md`](./customer-discovery.md) — A〜D の設計根拠

*作成: 第二フェーズの未実施洗い出しを1ファイルに集約。運用方針は随時 `phase2-open-todos.md` 冒頭を正とする。*
