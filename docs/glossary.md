# Glossary

最終更新: 2026-06-08

Phrabit のプロダクト、顧客理解、実装で使う用語をそろえるための用語集です。迷った場合は、古い `README.md` よりもこの文書、`docs/product-vision.md`、`docs/domain-map.md`、`AGENTS.md` を優先します。

## プロダクト用語

| 用語 | 定義 | 根拠 |
|------|------|------|
| Phrabit | 現場で調べた短いフレーズを、翻訳・保存・復習し、次に自分で言える言葉へ変えるアプリ | `docs/product-vision.md`, `docs/strategy-reset-2026.md` |
| 現場フレーズ | 実際の場面で言いたかった、聞いた、使った、または次に使いたい短い表現 | 画像資料, `docs/customer-understanding-synthesis.md` |
| 言えなかった一言 | その場で出せなかったが、次の似た場面で言えるようにしたい表現 | 画像資料, `docs/interview-playbook.md` |
| フレーズ | Phrabit で保存・検索・復習される基本単位 | `supabase/schema.sql` |
| ライブラリ | ユーザーが保存したフレーズの集合 | `docs/mvp-next-iteration-spec.md`, `supabase/schema.sql` |
| ドリル | 保存したフレーズを復習する活動または画面 | `docs/mvp-next-iteration-spec.md`, `supabase/schema.sql` |
| ドリル対象 | 復習に回すフレーズ。DB上は `should_drill` や `srs_items` と関係する | `supabase/schema.sql` |
| ライブラリのみ | 保存はするが、ドリル対象にはしない状態 | `docs/mvp-next-iteration-spec.md` |
| 保存 | フレーズをユーザーのライブラリに残すこと | `supabase/schema.sql` |
| 再訪 | 保存後に、D1/D7 などでライブラリやドリルへ戻ってくること | `docs/product-concept-validation-plan.md` |

## 言語・翻訳用語

| 用語 | 定義 | 根拠 |
|------|------|------|
| 翻訳方向 | 入力言語から出力言語への方向。例: `ja-to-zh`, `zh-to-ja` | `supabase/schema.sql` |
| 言語ペア | `source_language` と `target_language` の組み合わせ | `supabase/schema.sql` |
| source_text | ユーザーが入力した、または翻訳元になるテキスト | `supabase/schema.sql` |
| target_text | 翻訳後のテキスト | `supabase/schema.sql` |
| 読み | 発話補助のための読み情報。中国語では主にピンイン | `supabase/schema.sql` |
| ピンイン | 中国語の発音補助。`reading_type = pinyin` として扱われる | `supabase/schema.sql` |
| 使い方 | そのフレーズが自然に使える場面、ニュアンス、別表現の説明 | `docs/mvp-next-iteration-spec.md`, `docs/translation-provider-evaluation.md` |
| 解説 | 文法、語彙、使い方、自然な言い方などの補助説明 | `docs/translation-provider-evaluation.md`, `AGENTS.md` |
| Provider | 翻訳・解説・音声認識を担う外部サービス。例: Azure, DeepL, Gemini, OpenAI | `docs/translation-provider-evaluation.md` |
| speed mode | 速さ重視の翻訳モード。現行方針では Azure を使う | `AGENTS.md` |
| normal mode | 通常翻訳モード。現行方針では DeepL、失敗時 Azure | `AGENTS.md` |
| quality mode | 品質重視モード。現行方針では Gemini で翻訳・解説・ピンインを生成する | `AGENTS.md` |
| STT | Speech to Text。音声を文字起こしする処理 | `docs/translation-provider-evaluation.md` |

## 学習・復習用語

| 用語 | 定義 | 根拠 |
|------|------|------|
| 反射定着 | 意味を理解するだけでなく、会話速度で口から出せる状態に近づくこと | `docs/positioning-map.md` |
| SRS | Spaced Repetition System。間隔反復の仕組み | `supabase/schema.sql` |
| SrsItem | フレーズに紐づく復習状態。`status`, `next_review_at`, `interval_days` などを持つ | `supabase/schema.sql` |
| Good / Perfect | ドリル時の回答評価。復習間隔に影響する想定 | `docs/mvp-next-iteration-spec.md`, `supabase/schema.sql` |
| 復習状態 | `new`, `learning`, `review`, `maintenance`, `mastered` などの状態 | `supabase/schema.sql` |

## 顧客発見・JTBD用語

| 用語 | 定義 | 根拠 |
|------|------|------|
| 状況 | いつ、どこで、誰と、何をしているときに課題が発生するか | `docs/interview-playbook.md` |
| 進歩 | その状況で本当に成し遂げたかったこと | `docs/interview-playbook.md` |
| 障害 | 進歩を阻んでいるもの。言葉、知識、場の空気、道具など | `docs/interview-playbook.md` |
| 既存解 | 今使っている解決策。Google翻訳、ChatGPT、英語押し切り、笑顔、諦めなど | `docs/interview-playbook.md` |
| 無消費 | 解決策を使わず、諦める、避ける、流すこと | `docs/interview-playbook.md` |
| 避けたい体験 | 現状や既存解の中で嫌だと感じる体験。待たせる、恥ずかしい、調べ直すなど | `docs/interview-observation-sheet.md` |
| 品質定義 | ユーザーが「これなら解決した」と言える条件 | `docs/interview-playbook.md` |
| 引き換え | より良い解決のために払えるお金、時間、手間、プライバシーなど | `docs/interview-playbook.md` |
| Good signal | 強い課題や利用可能性を示す発言・行動 | `docs/interview-playbook.md` |
| Bad signal | 対象外または仮説を弱める発言・行動 | `docs/interview-playbook.md` |

## セグメント用語

| 用語 | 定義 | 根拠 |
|------|------|------|
| 初期ビーチヘッド | 最初に深く検証する狭い市場。現在は海外ライブポーカー日本人 | `docs/customer-discovery.md`, `docs/strategy-reset-2026.md` |
| ポーカー層 | マカオ・中国語圏などでライブポーカーをする日本人 | `docs/macao-field-test-log.md`, `docs/interviews/*.md` |
| 出張ビジネス層 | 業務で中国語圏へ渡航し、現地で口頭コミュニケーションが発生する人 | `docs/crowdworks-interview-recruitment.md` |
| 駐在員 | 中国語圏に一定期間滞在し、仕事や生活で中国語に触れる人 | `docs/persona-draft.md`, `docs/interviews/*.md` |
| 駐在帯同家族 | 駐在員に帯同し、生活場面で現地語に触れる家族 | `docs/interviews/observation-007-mori-shanghai-accompanying-family.md` |
| 無関心層 | 翻訳や英語で十分で、自分で言えるようになりたい進歩がない人 | `docs/interview-playbook.md` |

## 実装・計測用語

| 用語 | 定義 | 根拠 |
|------|------|------|
| UsageEvent | AI/翻訳/STTなどの利用を記録するイベント | `supabase/schema.sql` |
| feature | 利用イベントの機能種別。translation, explanation, speech_to_text など | `supabase/schema.sql` |
| source_page | 利用が発生した画面。add, conversation, library, drill など | `supabase/schema.sql` |
| actor_type | guest または user | `supabase/schema.sql` |
| Conversation Assist | 会話中の翻訳補助。自動保存はしない | `AGENTS.md` |
| persist:false | 翻訳APIで保存しないことを示す方針 | `AGENTS.md` |

## 旧語・注意語

| 用語 | 扱い |
|------|------|
| SayItNext | 旧名。現在は Phrabit に読み替える |
| Poker Chinese Trainer | 旧MVP名/旧説明。現在の全体定義としては使わない |
| Notion主DB | 古い可能性が高い。現在は Supabase/Postgres を主に扱う |
| 自分用コード | 古い認証運用。現在は匿名利用と任意ログインを前提にする |

