# Phrabit 引き継ぎ（2026-05）

Cursor での開発から Codex + VSCode への引き継ぎ用ドキュメント。  
**新しいセッションでは、まずこのファイルと `AGENTS.md` を読むこと。**

---

## 2026-09-09 承認済み最小リリースの内容と検証

- 本人の「よい」で8ファイルのcommit/push、Preview確認後の本番反映を承認。変更はpackage/lock（Next・eslint-config-next 16.3.4等の依存更新）、practice-scheduleとテスト（長期Good/Perfectの14→45→120→180日進行）、chinese-pinyin/explanation-formatと各テスト（返却还・只住/只需要の限定補正、日本語への誤ピンイン除外、テンプレの節別読みと箇条書き維持）。学習5テーブルの一括移行はしない。
- 独立候補は本番fd97b804…＋8ファイル。他の281ファイルのhash一致、domain79/infrastructure・lib90の計169テスト、lint/型検査/25ページbuild成功。保存18件を候補の実parserへ無料再生して本文/主訳/例文/和訳/項目数/冪等性を確認、追加API生成なし。
- Preview `https://poker-chinese-trainer-i78jam5mb-renponpons-projects.vercel.app`（`dpl_3exbfXv9TB7BE5SERbzDyE4yNMoQ`）がREADY、25ページbuild成功。既存の隔離Preview設定を使用し本番設定をコピーしていない。360/390px中国語・430px英語でニュアンス調整、失敗再試行、勝手な自動再生なし、明示保存、SRS作成、同期失敗時の端末保存、横はみ出しなし・pageerrorなしを検証。API/音声はテスト応答へ置換し、実際の有料生成・クラウド保存・実機音声・ログイン同期を再試験したものではない。CUAでもPreviewの翻訳/ドリル空状態/保存画面を確認。
- 直前退避は2026-09-09 00:56:55 JST、本番whuatcawoezfrvzplmriの学習5テーブル641行（166/145/166/164/0）。`.private-backups/learning-20260909-005655-owner.dpapi`、668614 bytes、復号内容SHA256 `C31AF962FA8AF53C3E972F1FBC5E80EFD0C603377CFE1B29DBA3735440C79E40`。平文ファイルなし、DPAPI本人ユーザー限定、PGliteメモリーDBで全行JSONB一致と所有関係を復元確認。本番書込みなし。Auth/Storage/未同期端末データは対象外。全体復元は退避後の他ユーザー更新も戻すため自動実行しない。
- 公開前の本番/GitHub mainはfd97b804c0517d57c7ebf78000466ef8130cfefbで一致。コード戻し先は `dpl_31enETULqZGgb8kKNMtvtRVTJxHS`（`poker-chinese-trainer-f8nmqiogf-renponpons-projects.vercel.app`）。コードrollbackは新たな学習回答データを巻き戻す操作ではない。
- モデル/プロンプト/Schema/予算ガード/DDL/通信中止UI/提供条件画面/営業資料の実験はこのcommitへ含めずローカルに保持。既存の実験Previewをpromoteしない。mainへpush後、本番用環境変数での自動build→READY/alias/SHA/画面を確認する。Preview DBを使うbuildの本番promoteは行わない。意味誤りや未知の多音字を全解決したリリースではない。

## 2026-09-07 ロードマップ第1段階完了（最新・本番公開）

- 本番c457ed6で隔離ゲスト英中の翻訳/明示追加/ドリルGood完了、英語は再生成まで実操作。ref付きtranslation_success/translation_drill_save/drill_answer各1件（英語refine_success1）を本番 `whuatcawoezfrvzplmri` の計測DB読取で確認。実利用・アカウント同期の成功人数には含めない。本人ログインのブラウザではQA page_viewだけで保存しなかった。DBの既存学習データや認証設定は変更なし。
- `src/lib/chinese-pinyin.ts` に限定的な読み補修。還の一律置換ではなく、単独還给、請求形、把/将構文など返却と判定できる形だけhuánへ補正し、「还给我买书」や不但〜还等のháiは維持。袋子→dài zi、说得再/很+慢/快/清楚の得→deも補修。本文、構造化例文、解説内マーカー、入れ替えテンプレで同じ処理を使う。旧保存済みの読みは移行しない。
- 本番で、主訳はhuánだが解説分解の単独還がhái、テンプレの一部ピンインが欠ける例を追加発見。`014ef17`で分解を修正し、`228a6d3`でテンプレの中国語節を追加AI呼出なしで補完。domain75/infrastructure+lib53件、対象ESLint、25ページbuild成功。本番品質翻訳で主訳・解説・返答・関連例のhuánとテンプレ語句のピンインを確認。全多音字・任意文の網羅は主張しない。
- `beachhead-outreach-templates.md` に英中各2先の個別全文を用意。トロピックス/SLI/Practical Mandarinは公開メール再確認。中天の公式窓口は不明、既存候補コラボの一般問い合わせフォームを公式サイトで確認し4先目に採用。無料体験申込は使わない。送信名義・返信先と宛先/本文承認は残り、外部送信0件。台湾・マカオの窓口探索は未実施。
- 実画面8枚と英語40秒スライドを `tmp/phrabit-responsive-shots/outreach-20260907/index.html` に保存。録画はffmpeg不足で失敗し動画はない。中国語画像は修正前の読みを含むため、外部送信前に最新版で撮り直す。外部公開・画像アップロードなし。
- Gemini APIがPhrabit専用であることを本人確認し、本人操作で前払いへ移行して￥800入金。AI Studioで前払い残高と自動チャージOFF、移行警告解消を読取確認。これはGeminiだけの残高で、DeepL/Azure/OpenAIを含む総API月額3,000円の強制停止ではない。
- GitHub mainは`228a6d3`。Production `dpl_GmyJKbdRzjVtMqKBjaXSHfDULMXb` / `poker-chinese-trainer-3gkqogu0i-renponpons-projects.vercel.app` がREADY、phrabit.comへのaliasを確認。公開後のブラウザconsole/page errorはなく、同Deploymentの直近errorログも0件。
- Driveの対象名/回答シート検索ではPhrabit問い合わせ回答表を特定できず、既存API受付成功に対する受信確認が残る。実スマホ同期・通信復帰、問い合わせ受信確認、紹介画像の撮り直し後に最初の紹介依頼を行う。送信者名・返信先と4先の宛先/本文は本人承認が必要。長期目標の利益額/期限は未回答でも作業を止めない。

## 2026-09-07 本番更新後のロードマップ整理（履歴）

- 直前ターンで `c457ed6` をcommit/pushし、Production `dpl_2ksFARBQmyLvM5XhUP2xgquCYzEf` / `poker-chinese-trainer-4g7ep2soa-renponpons-projects.vercel.app` がREADY、phrabit.comへのalias完了。保存なし本番1件でHTTP200、provider=gemini、model=gemini-3.5-flash-lite、解説ありを確認。直近1時間・main・productionのerrorログ検索は該当なし。全実機/全機能の無不具合を意味しない。
- ロードマップ依頼に対し、既存のビジョン・利益目的・海外生活者対象・基本無料/追加枠候補・英中同優先・月3,000円予算を再確認。`roadmap.md` 先頭に、限定確認→紹介→別日利用→購入→更新/利益→拡大の順序・分担・判定条件を追加した。目標月間利益/期限、1万人の累計/月間定義は未確定。古い資料の未公開状態や売上レンジは履歴として区別する。
- この依頼では文書のみ更新。新しい利用集計、営業送信、料金公開、予定済みタスク変更、commit/push/deployは行っていない。紹介候補のうちトロピックス/Practical Mandarinの公式対象案内を再確認したが、紹介同意や提携は未成立。

## 2026-09-07 速度廃止・Gemini/GPT比較（公開前の履歴）

- 2026-09-07、ユーザー判断により品質関連のGemini実行モデルを `gemini-3.5-flash-lite` へローカルで切替。対象は品質翻訳、解説補完、例文パック、パック解説、利用記録のモデル表示。通常のDeepL→Azure fallback、音声、プロンプト、保存データは変更なし。対象ESLint、domain75件、infrastructure23件、Next.js本番ビルド25ページが成功。本番デプロイ・commit/pushは未実施。

- 前回未比較だったGPT-5.6 Lunaを追加し、Gemini 3.5/3.8/Lunaを同一20例×英中で計60件実API生成。全件成功。中央値は2.451秒/2.862秒/7.826秒、p90は2.883秒/3.280秒/9.722秒。token原価は20件で$0.04701/$0.08633/$0.02703（1ドル150円仮定で1,000件約353/647/203円）。主訳の内部意味保持判定は15/20、16/20、18/20、重大ずれは1/20、0/20、0/20。小標本・盲検なしであり、Lunaの遅さを考慮して本番モデルは変更しない。詳細は `translation-provider-evaluation.md` の同日最新節。
- ユーザーが保護付きPreview比較と「速度はなくそう」を承認。`generation-mode.ts` を通常/品質の2択にし、旧speedはparseで通常へ移行。翻訳画面の復元値もparseし、会話初期値を通常へ変更。直接のspeed→Azure分岐を削除、通常DeepL→障害時Azureは維持。品質はまだGemini3.1Flash-Lite。既存の未コミット案内/計測修正を壊さず、Previewスナップショットへ含めた。DB/キー/本番変更、commit/pushなし。
- 新Preview `https://poker-chinese-trainer-gdesmlbxl-renponpons-projects.vercel.app` / `dpl_49fxUHusddVKGM9nK1rkvZFTYSC5` はREADY、target Preview、aliasなし。未認証取得はVercelログインへの転送を確認。本番phrabit.comは `dpl_Ce7sCubB6mh1VWdzQE4ZaUYWovz8` / `5677d98` を維持。Googleの新URL許可追加/実機ログインは今回行っていない。Previewを本番へpromoteしない。
- ビルド内でPreviewの既存キーを使い、同一20例×Gemini3.1/3.5/3.8/GPT5.4nano/miniの100件を実生成、全件成功・再生成0回。キーのローカル取得/表示/再発行なし。DB・保存・ドリル・音声は呼ばず、創作例だけを送信。中央値は順に3.054/2.499/2.812/4.859/3.139秒。token×公式単価の合計$0.25704（150円仮定で約39円、請求実額ではない）。評価用ガード$0.80は月3,000円の強制停止設定ではない。
- 結論：3.5が3.1より20/20件で速く次の第一候補だが、biweeklyの曖昧性・施錠状況の補完・不適切テンプレ/和訳が残る。GPT nanoは遅くマーカー漏れ、miniは返す→渡すの意味脱落などがあり、今回の条件では切替根拠が弱い。返還の还=háiは共通後処理の未修正問題。100件の主訳、重点25件の解説全文と追加抜粋を確認し、全解説の全面精査/母語話者盲検/一般正答率の確認とはしない。
- 全訳/読み/解説はPreviewの `/provider-comparison/index.html`、取得済みJSONは `tmp/phrabit-responsive-shots/model-evaluation-results-20260907/results.json`。比較方法/料金/問題例/参照元は `translation-provider-evaluation.md` 先頭。`scripts/provider-evaluation.vercel.json` とビルドラッパーはこのPreviewにだけ明示指定した評価設定。通常buildへ組み込んでおらず、再デプロイ時の有料評価再実行に注意。公開生成テストAPIは作っていない。
- domain75/infrastructure23件、対象ESLint、ローカル/クラウド25ページビルド、英中360/390/430pxの翻訳/通常⇔品質/明示追加/調整/再生成後自動再生なし、個人フレーズ/会話/通常ドリル、保存API/疑似同期の回帰テスト成功。既存.nextや.envを触らず、Git除外の `tmp/phrabit-responsive-shots/model-evaluation-preview-20260907` にスナップショットを作り検証した。
- 次は同一呼出内の意味保持/テンプレ指示と共通ピンイン/マーカー処理を限定改善して3.5を再評価し、承認後にモデル切替/本番公開。追加の直列AIレビューを本番に入れない。以下の未実装/キー取得不可は初回比較時点の履歴。

## 2026-09-07 予算回答後の実地検証準備（履歴）

- 翻訳provider実比較を追加（`translation-provider-evaluation.md`先頭）。日本語10文×中国語/英語×現行3モード=本番API60回、全件成功、保存/ドリル/音声なし（使用量ログには入る）。中央値: 速度Azure0.926秒/通常DeepL0.613秒/品質Gemini3.1Flash-Lite3.205秒。通常が同一入力20件中15件で速かった。速度UI廃止・通常/品質2択、Azurefallback維持を提案するが未実装。品質の解説にも否定反転などの問題があり最善とは未判定。中国語还の誤読は3モード共通の後処理で再現。
- `scripts/compare-translation-providers.mjs`を追加、構文/対象ESLint成功。全生データはGit除外の `tmp/phrabit-responsive-shots/provider-comparison-2026-09-06T16-35-49-718Z/`。新Gemini/DeepL model_type比較は未実行。Previewキーは存在するがsensitiveでCLI読出値が空。全環境復号の試行は安全審査で拒否され実行せず、Preview限定確認へ縮小しても値は取得できなかった。既存キーを変更せず使う検証専用Previewを明示承認後に準備するか、安全な手動キー設定が必要。本番設定・アプリコード・既存.env・学習データ変更、commit/push/deployなし。今回実費はtoken非公開のため未確定。APIの実行を「無課金」「予算上限設定済み」と扱わない。

- 月3,000円（翻訳・解説・音声API）、中国/マカオ/香港/台湾などで中国語・英語圏で英語、両言語を同じ優先度とする回答を正本資料へ反映。優先する1地域を選び直してもらう必要はない。
- `roadmap.md` 先頭へ費用設定案、担当別の残件、地域/言語の実装差、3操作のスマホ検証、紹介後7日の手順、10入力の意味保持チェックを追加。1,500/2,100/2,400円の運用目安と600円の予備は設定案で、当月実費・共有課金・固定料金は未確認。Google/OpenAIの停止用上限とAzureの通知のみを最新公式資料で区別した。アカウント設定は未実施。
- 既存の紹介候補へ、シンガポールのトロピックス/SLI（英語）と香港Practical Mandarin（普通話）を追加。公式サイトと公開メールを確認し、宛先・個別冒頭・共通本文・QA/紹介用ref・初回案内・7日後確認を既存資料へ用意。上海中天の対象適合は再確認、窓口は今回未確認。台湾/マカオの窓口探索は未実施。営業送信は0件。
- この回は文書のみ更新。生成API追加利用、アプリコード変更、DB/課金設定、commit/push/deployは行っていない。前回の未公開案内/計測修正と既知の返却还の解説ピンイン誤りは維持。次は費用管理画面の照合、ピンイン補修、既存修正の公開、実機と問い合わせ受信の残件を進め、宛先・文面の承認後に紹介依頼を送信する。

## 2026-09-07 海外生活者への紹介前チェック（ローカル変更・未公開）

- 「進めて」を受け、案内・計測の補修と公開前検証を実施。本番は引き続き `5677d98`。今回のcommit/push/Preview/本番デプロイやDB変更はしていない。営業送信・Auth設定・料金/上限設定も変更なし。
- 案内：DataHandlingNoticeを明示追加、タブ内の直前結果一時保持、ゲストはブラウザ内保存、ログイン同期、未同期/データ削除の注意、外部翻訳/音声サービスへの送信、操作計測、誤訳の可能性に合わせて修正。固有名詞を伏せるだけで安全とは言わず、個人情報/機密を入力しない案内にした。AddTutorialも翻訳→任意調整→明示追加→復習、共通言語、ゲストと同期の違いへ更新。自動表示や必須確認は増やさず、長い文が小画面で切れないよう任意チュートリアルの固定高さを可変/最大高さ付きにした。
- 計測の実不具合：3件のUUIDを含むドリルURLでは末尾refがAPIの120文字制限で切れることを再現。`product-analytics-route.ts` をクライアント/API共通で使い、pathnameと検証済みrefだけを記録。refは英数字/ハイフン/アンダースコア1〜80文字。フレーズID、任意のquery本文やtoken、hashは記録せず、URLを長くしてもrefを先に確保する。ユーザーの実URLや画面遷移は変えない。`translation_drill_save.success` は端末への追加成功とし、同期だけ失敗した場合はsuccess=true/errorCode=sync_failed、本当の追加失敗はfalse/save_failedに分ける。過去のsave_failedは遡及修正しない。
- 計測検証：`smoke-product-analytics-flow.mjs` で実クライアント→実APIハンドラ→メモリ内Postgresを通し、流入・翻訳・調整・追加・別日ドリル・再追加を合成入力で確認。紹介元保持、同一ブラウザ識別、失敗した追加の集計除外、任意queryの非収集を確認。翌日はテスト時計であり実D1再訪ではない。ゲストは端末単位、異なる端末の同一人物や「自発的だった」という意図まで計測だけで分かるわけではない。匿名本番ブラウザ→実DBでの新しい導線一巡は公開後の残件。
- 実API品質確認：`check-live-readiness-translations.mjs` で本番のゲストAPIに保存なしで10件（中6/英4、品質5/通常3/速度2）を生成し、必要な後続解説5回も取得。全15リクエストHTTP成功。主訳では今回の主客・否定・数量・期限の明確な逆転は見つからなかったが、これは10件の目視確認で品質保証ではない。生成全文/解説/時間は `tmp/phrabit-responsive-shots/readiness-20260907/translations.json` と `.txt`。学習フレーズの保存/削除/回答なし、AI使用量には検証分が含まれる。通常の主訳0.381〜0.771秒、速度0.967〜1.094秒、品質3.054〜3.674秒、通常/速度の後続解説2.090〜3.171秒。全て日本側の実行環境からの少数回測定で、海外回線や今回の修正前後比較ではない。生成プロンプト/AI呼出回数は変更なし。
- 品質残件：2番「彼に渡すのではなく、私に返してください。」の主訳/pinyinは適切だったが、解説の还给と関連例で返却を意味する还がháiになった（この意味ではhuán）。現行pinyin-proの変換でも再現する。参考辞書 https://www.zdic.net/hans/%E8%BF%98 。一方「他还给我买了礼物。」の还は「さらに」のháiなので、一律huánへの置換は採用しない。3番の経験の过や物の东西でも軽声の扱いが主表示/解説で不統一。参考 https://zdic.net/hans/%E8%BF%87 。返却と追加の意味を区別する回帰例を揃えてから、追加生成なしの補正方法を検討する。このターンでピンイン変換や既存の学習データは書き換えていない。
- 問い合わせ：本番 `/api/feedback` に「Codex動作確認」「【動作確認・回答不要】」「readiness-20260907-feedback-01」を含むテストを1件送信、HTTP200/ok:trueを確認。受信側のGoogleフォーム/回答表は接続DriveでPhrabit・要望を検索した範囲では見つからず、実受信・運営通知は未確認。API成功だけを受信確認としない。実利用者のフィードバックに数えない。
- 費用/対象の残件：翻訳・解説は意図的に日次制限の対象外で、プロセス内の短時間大量利用ブロックのみ。音声の一部は日次制限を使う。厳密な月額予算上限・全体停止スイッチを整備済みとは扱わない。月額API予算と最初の対象国/言語をユーザーへ質問済み。生成時間を増やす同期DBチェックを勝手に追加せず、金額決定後にprovider別の設定/通知/停止手順を具体化する。費用異常時は新たな配信拡大を止め、利用記録とprovider請求を確認して本人へ報告する。キーの失効・上限変更は明示承認後。
- 回帰確認：domain74/infrastructure23、同期/認証再取得/計測schema/計測flow、対象ESLint、25ページのビルドが成功。固定APIの360/390/430px翻訳で案内全文、チュートリアル、小画面内のボタン、任意調整、手動音声、保存、同期失敗時の正しい計測を確認。390/430px端末バックアップ/復旧停止、英中個人フレーズ導線・会話・通常ドリル・共通言語も成功。360pxチュートリアル画像を目視確認。別distDirでビルドし、テストサーバー停止後にnext.config/tsconfigの一時変更を取り消した。既存の.next ReparsePointやマーケティング差分は維持。
- 実スマホの残る確認（本番5677d98の同期修正は反映済み）：スマホとPCを一度再読込し同じアカウント/言語で、(1)スマホで自分の一言を翻訳して明示追加→PCの保存画面を表示したまま30秒程度で出る、(2)スマホでその一言に回答→PCの次回復習日/学習状態も変わる、(3)スマホを通信断にして追加済みの一言に回答→オンライン復帰後に回答履歴が反映され、消失/重複がない、を確認する。通信断中に新しい翻訳の生成ができると案内しない。確認中はログアウト/ブラウザデータ削除をしない。Codexの疑似通信断テストと実スマホ確認を区別する。

## 2026-09-06 本番保留・データ保護の準備

### 承認後の進捗（2026-09-06）

- 計測修正のcommit/push・連携公開完了（23:47 JST）：`5677d98d326d8c5a8cb0175d2d45deb45db7f7c6` / `Allow analytics for translation refinement and drill saves`。対象はAGENTS/handoff/schema/新migration/スモークテストの5ファイルのみ。local HEADとorigin/mainが一致。Production `dpl_Ce7sCubB6mh1VWdzQE4ZaUYWovz8` / `poker-chinese-trainer-d0rtguqn5-renponpons-projects.vercel.app` がREADY、phrabit.comからの取得でも同ID・SHA・productionを確認した。新Deploymentの確認時error/warningログなし。新しい実翻訳・保存・スマホ同期を今回再テストしたわけではなく、アプリコード/依存関係は前版のまま。前版Productionは `dpl_4EdbxKKczdHmuisDftAVbGobYjij` / 5278045。DBの拡張CHECKは旧アプリとも互換。この公開後記録だけローカルに追記し、追加の文書だけのデプロイは行わない。
- 計測DBの適用完了（23:43 JST）：「よい」で本番DB適用とcommit/pushの承認を取得。同一SQLを隔離Preview `ozhmqkcajgumifthntne`（migration version `20260906144143`）→本番 `whuatcawoezfrvzplmri`（`20260906144252`）の順に `apply_migration` で適用し成功。本番のMCP生成versionへローカルファイルを `20260906144252_expand_product_analytics_translation_events.sql` として揃え、テスト参照も更新した。CLI生成時の142656名は準備時の履歴。Previewは独立履歴のためversionが異なる。両環境のmigration一覧で同名の適用を照合した。
- DB上の検証：両DBでトランザクション内の `SET LOCAL ROLE service_role` による4種類のINSERT成功、未知イベントのcheck_violationを確認してROLLBACK。request_idを `codex-analytics-schema-smoke-` で区別し、終了後のテスト行0件。本番は前後914件、Previewは0件を維持。新12項目のCHECKがvalidated、RLS=true、ACLと拒否policyが前後一致。本番の学習テーブル/Auth/Storage/生成/API/UIは変更しない。実利用による4イベントの発生・アプリ経由の成功を今回の合成SQLテストと混同せず、過去に拒否されたイベントは復元されない。
- 診断：Previewと本番のsecurity advisorsに `auth_leaked_password_protection`（漏洩済みパスワード保護OFF）警告が1件。今回の本番適用前にも同じ警告があり、DDLに伴う新規指摘ではない。Auth設定は承認範囲外のため変更なし。案内は https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection 。以降は修正SQL/新規schema/テスト/AGENTS/handoffのみ選択してcommit/pushする。営業資料・Xログ・告知画像・tsconfigの既存差分を混ぜない。
- 次段階の計測修復準備：「次に進んで」を受け、紹介前の計測欠落を優先してローカル修正した。本番 `whuatcawoezfrvzplmri` のCHECKは旧8項目のみ、RLS有効、クライアント権限なしを読取で確認。Supabase CLI 2.116.0の `migration new` で `20260906142656_expand_product_analytics_translation_events.sql` を作成し、ニュアンス調整submit/success/failureとtranslation_drill_saveの4項目だけ追加する。新規DB用schemaも同じ12項目へ更新。旧migrationは変更しない。トランザクション内の単一ALTERで置換し、lock_timeout=2s / statement_timeout=15s。学習行、Auth、RLS、GRANT、生成/API/UIには変更なし。
- 検証：`node scripts/smoke-product-analytics-schema.mjs` 成功。既存の `tmp/backup-restore-runtime` のPGliteを使用し、合成データだけで旧4項目の23514を再現、修正後の全12項目受理、既存8件の全列維持、RLS/ACL/policy不変、未知イベント/NULL/不正actor/負の文字数の拒否、anon/authenticatedの読取・挿入拒否、service_roleの4項目挿入、新規schema/再適用を確認。API・クライアントのイベント名一覧とも照合。対象ESLint・diff check成功。アプリコード未変更のため今回新しいアプリビルドや実API生成は実行していない。
- 承認待ち：本番DBへの4項目許可追加の具体的内容をユーザーに提示済み。本番/Previewへのmigration適用、commit/push/deployはまだ行っていない。承認後は制約/権限を再確認→同じSQLをまず隔離Previewへ適用・ROLLBACKする合成データで確認→本番へ適用→制約と権限を照合する。実利用からの計測成功とテスト挿入は区別し、過去の拒否イベントを復元できたとしない。ロック/タイムアウトなら強行せず停止。適用失敗時はトランザクションで旧制約へ戻る。適用後にアプリだけrollbackしても拡張CHECKは旧イベントも許可するため後方互換。営業はこの後、9月方針の海外生活者向け紹介先/文面準備へ進め、具体的な宛先承認までは送信しない。今回の「次に進んで」は実スマホの同期テスト成功報告とは扱わない。
- 最新公開完了（23:15 JST）：同期修正 `5278045cfa1dc639201e04943464929f118e7dbd` をcommit/pushし、local HEADとorigin/mainの一致を確認。Production `dpl_4EdbxKKczdHmuisDftAVbGobYjij` / `poker-chinese-trainer-3t7d7ycdb-renponpons-projects.vercel.app` がREADY、phrabit.comを指定した取得でも同ID・同SHA・productionを確認した。今回は自動で本番ドメインへ反映され、手動promote不要。Preview昇格/DBスキーマ/RLS/計測の変更なし。直前の戻し先は `dpl_CbzbCL7VgEdNX2MS4KvQmWeUMFZU` / a11e6dc。
- 公開後の確認：PC本番libraryを一度再読込し、本人ログイン名、「同期済み」、スマホで追加した「頑張るぞ」「いい感じの雰囲気だね」を確認。以降ブラウザ操作なしで、新Deploymentの `/api/phrases` GET 200が14:14:08 UTCと14:14:38 UTCに記録され、30秒定期取得を実環境で確認した。同Deploymentの直近10分のerror/warningログは0件。新しいテストフレーズの作成や既存行の編集/削除は行っていない。スマホそのものの新コード再読込・新規追加からPCへの反映は本人の再確認が必要。以下の未公開/承認前の記述は各時点の履歴。この公開後記録は追加のアプリ再デプロイを起こさないようローカル文書へ追記した。
- 同期修正版の公開承認：「おけ」に基づきcommit/push/deployを実行する。23:06:39 JSTに本番学習5テーブルを再取得、`.private-backups/learning-20260906-autosync-owner.dpapi` へ本人Windows DPAPI CurrentUserで暗号化。saved_phrases166 / drill_items164 / phrases166 / srs_items145 / categories0、1,072,678bytes、SHA-256 `A207509CF828FD6700D480BA78C45C86B30F2A9AE2BF4DC56796D213900C0C1D`。PGlite一時DBで全件復元・JSONB一致を確認した。Auth/Storage/未同期端末は含まない。直前の戻し先は `dpl_CbzbCL7VgEdNX2MS4KvQmWeUMFZU` / a11e6dc。本番DBスキーマやRLSは変更せず、利用計測4項目の追加はこの承認の対象外。同期/自動再取得テストと対象ESLintを再実行して成功。下記の未承認は承認前の履歴。
- 最新報告への対応（ローカル修正・未公開）：「スマホで入力したフレーズがPCに反映されない。1分は待った」。本人の本番保存行として「いい感じの雰囲気だね」`d556226b-19e7-4b61-868e-ae583debbda7`（13:36:50 UTC）、「頑張るぞ」`55f40f36-1f97-4a7b-a17a-cbb4f34b0c01`（13:37:46 UTC）、ドリル対象を確認。PC本番タブで保存画面を開くと両方と「同期済み」を確認した。以前のAuthSessionKeeperは初回/認証変更/focus/online/visibilitychangeだけで、開いた画面を待つだけの定期取得がなかった。
- 同時刻の本番ログはPATCH `/api/phrases` 500・42501（saved_phrasesのRLS USING制約）を複数回、GETではJWT expiredを1回記録。固定starter UUID16件が本人とは別の所有者に属することをIDと所有者一致真偽だけで照合した。実際に失敗したPATCHのIDはログに出ておらず、全てがstarter由来だったとは断定しない。権限緩和や本番データ書換えはしていない。
- ローカル修正：AuthSessionKeeperに可視/オンライン/ログイン中だけの30秒再取得を追加し、古い保持JWTではなくgetSessionで再取得したセッションを使う。並行取得・ログアウト後/アンマウント後の遅延応答を抑止。同期は書込失敗後も再取得できれば他端末の追加/回答を反映し、失敗と未実行のIDについて元のbaselineと最新localを保持して再試行する。失敗した削除も勝手に元へ戻さない。警告は「通信回復すれば解決」と断定しない文面へ変更。
- 旧サンプル対策：既に端末にある固定starterだけ、本人クラウド/直前baselineに同じIDがなければstarter UUIDを名前空間、userIdを名前とするUUIDv5へ移す。新規利用者へサンプルを追加する処理ではない。同一アカウントの複数端末は同じID、別アカウントは別ID。本人のクラウド既存IDと既知の削除は移さない。移行待機後にlocalを再読し、既存ローカルの対応IDと統合、より新しい回答履歴を維持。元の更新前退避は変更しない。
- 検証：smoke-account-syncで共通starterへの書込拒否を再現しアカウント別IDでの回避、重複なし、新しい回答保持、部分成功後の拒否/削除失敗、別端末の追加/回答取り込み、拒否解除後の再試行、アカウント切替と復旧停止を確認。smoke-auth-session-refreshは実コンポーネント＋偽タイマー/認証で30秒指定、JWT更新、非表示/オフライン停止、重複抑止、ログアウト/破棄後の応答無効を確認。domain74件・infrastructure23件、保存API、対象ESLint、別distDirで25ページビルド成功。既存ブラウザテストで390/430px端末退避/復元停止、英中の明示保存/解説補完/専用ドリル、会話、通常ドリルの同期中進捗維持が成功。実スマホの新修正版は未検証。本番はa11e6dcのまま、追加承認前につきcommit/push/deployなし。計測4項目のDB許可追加も引き続き未承認・未変更。
- 最新の本番公開：同期修正 `a11e6dc14b2d33f632d865ca1300e6fa346fd384` をcommit/push、GitHub main一致。Production `dpl_CbzbCL7VgEdNX2MS4KvQmWeUMFZU` / `poker-chinese-trainer-gryh5nh3p-renponpons-projects.vercel.app` がREADY。ロールバック後は独自ドメインが自動で移らなかったため、このProductionビルドをCLI promoteし、phrabit.comを指定した取得で同IDへ切り替わったことを確認した。Previewを昇格していない。戻し先は引き続き `dpl_FhLM4NM8W1Zcm6qapFKZhEkBBKPQ`。
- 本番実操作：Google再ログイン後、既存ライブラリの「同期済み」を確認。「明日の朝、このカフェで待ち合わせましょう。」を通常モードで中国語に訳し、調整モーダルで友人向けに再生成して「明早在这家咖啡店见吧。」へ更新。ピンイン、解説初期展開、メタ情報バッジ非表示、再生チェック未選択を確認。明示追加→追加した一言だけのドリル→Good→1件完了→ライブラリ同期済みまで成功。確認用フレーズ `0d7fc41e-ee36-4c5a-8e65-f61fc811ca0d` は本人アカウントに1件残している（既存フレーズを編集/削除していない）。本番DBで保存行1件、解説あり、drill_items/srs_items双方last_score=2、last_reviewed_at=`2026-09-06T13:05:17.291Z`、次回翌日を照合。実スマホの通信断/音声を今回Codexが確認したわけではない。
- 残件：`translation_refine_submit/success/failure` と `translation_drill_save` が本番product_analytics_eventsのCHECK許可リストに含まれず、計測だけ失敗する。学習保存/回答同期は成功。4項目の許可リスト追加（学習データ/RLSは変更しない）をユーザーへ質問済み、未承認につきDB変更なし。依存ライブラリのurl.parse非推奨警告もある。生成解説の関連例「明早在这儿等我。」に対し日本語「明日の朝、ここで待ってるね。」という主客の誤りを1件確認（正しくは待っていて/待っていてね）。主訳・UI・同期とは別の生成品質課題として残し、このリリースでプロンプト変更はしていない。
- 公開試行と一時復帰：アプリ関連56ファイルを `2a62bd7` にcommit/push。Production `dpl_9ni3RHU4mKUyFPRBcKD6ABaMumJJ` がREADYになったが、既存ログイン端末の同期でPATCH `/api/phrases` が401（12:42:49 UTC）、未同期警告を確認した。CLI rollbackで旧 `dpl_FhLM4NM8W1Zcm6qapFKZhEkBBKPQ` / 17c333dへ復帰し、phrabit.comの向き先を照合済み。GitHubは2a62bd7のまま。データ復元やDBスキーマ変更はしていない。旧版でGoogle再ログインは成功。
- 切り分け：同期が端末JSONを直接読んで既存starter ID移行を迂回する不具合を疑似クラウドで再現した。`loadLocalPhrases` / `loadLocalSrsItems` を使い、既知の旧IDとSRSを既存の安定UUIDへ移行してから同期するよう修正。初回バックアップは旧ID/回答履歴を保持、クラウド既存フレーズは重複しないことを検証。未知の不正IDは削除せず同期を停止し、サーバーは401と区別して400を返す。本番401がこの原因だったかはまだ確定していない。97件のテスト、同期/保存APIスモーク、対象ESLint、別distDirでの25ページビルド成功。再公開後の実アカウント確認が完了するまで公開成功と扱わない。
- 本番反映承認：最終確認後の「よい」に基づき、2026-09-06 21:37:22 JSTに本番学習5テーブルを単一SELECTで再取得し、`.private-backups/learning-20260906-prerelease-owner.dpapi` へ新規暗号化保存した。Windows DPAPI CurrentUser（本人renre）、633,670 bytes、SHA-256 `A5C1B226965A1384A3F8B5B3B1C8BA8C2094123484EE574ACF3C6334FDE0BA35`。saved_phrases 163 / drill_items 161 / phrases 158 / srs_items 96 / phrase_categories 0。メモリ内PGliteで5テーブル全件を復元してJSONB完全一致・所有者/外部キー整合を確認。秘密値/本文の表示・平文ファイル化・外部サービスへの転送なし。Auth/Storage/他端末の未同期データは含まない。GitHub fetch後、ローカルmainとorigin/mainは17c333dで一致。本番公開前の戻し先は `dpl_FhLM4NM8W1Zcm6qapFKZhEkBBKPQ`。この時点では公開前で、次にアプリ関連差分だけをcommit/pushする。以下の本番承認待ちは承認前の履歴。

- 本番前の最終確認：「それはOK、次に進んで」を受け、スマホ確認はユーザー報告として記録。Codexは最新Previewの同一アカウントで「同期済み」と既存中国語2件を再確認した。新たな回答のID/時刻を突合したわけではなく、実スマホの通信断復帰を確認済みとは扱わない。
- 最新検証：domain 74件/infrastructure 23件、同期コーディネータ、保存APIの自動テスト成功。同期テストを追加し、fetch自体の失敗中に新規フレーズと回答が端末/アカウント別キャッシュへ残り、読込失敗でも消えず、復帰後の複数回同期でも同じIDのフレーズ/SRSが1件だけになることを確認した。実装コード・DB・翻訳APIには変更なし。対象ESLint成功。既存.nextのReparsePointを避け、一時distDirでビルド/25ページ生成後、同ビルドに対する端末退避/復元/容量不足、共通言語、360/390/430px翻訳、個人フレーズ、会話、通常ドリルの固定APIブラウザテストも全て成功。一時設定とtsconfig追加を戻し、next-envが通常パスへ戻ったことも確認。
- 既存 `learning-20260906-065353Z-owner.dpapi` を本人のWindowsアカウントでVerifyDatabaseし、2026-09-06 15:53:53 JST取得の学習5テーブルをメモリ内Postgresへ全件復元してJSONB完全一致を再確認。新しいバックアップの取得ではない。Auth/Storage/他端末の未同期データは対象外。復元用ランタイムがGit未除外だったため `.gitignore` に `/tmp/backup-restore-runtime/` を追加し、暗号化バックアップ・テスト出力とともに除外を確認。既存ファイルの削除なし。
- 次の本番手順（明示承認待ち）：直前の学習5テーブルを新しい名前で暗号化退避・復元照合→アプリ関連差分と検証/引継ぎだけを選択してcommit/push→Production環境変数でビルド/デプロイ→本番ログイン/同期/翻訳/保存/ドリルを限定確認。営業資料・Xログ・告知画像・秘密ファイル・tmpを一括ステージしない。Previewは検証DB用なのでpromoteしない。本番の戻し先 `dpl_FhLM4NM8W1Zcm6qapFKZhEkBBKPQ` とaliasは今回も変更なし。コードを戻してもDBの変更は戻らない点を維持する。今回はcommit/push/deploy/本番データ更新は未実施。

- 最新Google設定：ユーザーの「承認する」に従い、既存「ウェブ クライアント 1」へ `https://poker-chinese-trainer-8hph9spq2-renponpons-projects.vercel.app` と同origin + `/auth/google/callback` を追加。保存後にabout:blankへ遷移したため、設定ページを再度開き、生成元9件・リダイレクト10件、既存8件・9件の完全維持と追加2URLの永続化を確認した。秘密値の取得/再発行や既存URLの削除/置換なし。最新Previewで本人のGoogleアカウントを選択し、`renren19951225` とライブラリの「同期済み」、「お水をください」「少しゆっくり話してもらえますか？」を確認。フレーズの追加・削除・回答は行っていない。再デプロイ・commit/push・本番アプリ変更なし。以下のGoogle承認待ちは設定前の履歴。実スマホでの回答同期・通信断復帰は引き続き未確認。

- 最新Preview公開：メタ情報バッジ削除の反映をユーザーが「よい」で承認したため、`https://poker-chinese-trainer-8hph9spq2-renponpons-projects.vercel.app` へPreviewデプロイした。ID `dpl_6G1FAe3qPQZ9HGZ1Wqr3MHmpvkv8`、READY、target null/Preview、aliasなし、クラウドビルド約38秒。本番 `phrabit.com` は前後とも `dpl_FhLM4NM8W1Zcm6qapFKZhEkBBKPQ` で既存alias不変。commit/pushなし。ゲストの実APIで「ここで少し待ってください」→「请在这里稍等片刻」を生成し、方向/未追加/生成元バッジが出ないこと、「調整」「再生」・解説初期展開・調整モーダルの開閉を確認した。ドリル追加やクラウド保存はしていない。新URLのGoogle生成元と `/auth/google/callback` の追加は具体的URLを提示して承認待ち（旧Preview許可先は変更なし）。23時間限定共有リンクのトークンは文書に残さない。以下のバッジ削除未反映は公開前の履歴。

- 最新ローカル表示変更：ユーザーが「日本語→中国語 未追加 Gemini品質」などの非表示を希望したため、翻訳結果上部のメタ情報バッジと表示専用importを削除。「調整」「再生」は右寄せで維持し、入力側の言語/モード選択、訳文の言語見出し、保存後の完了案内と同期エラーは変更しない。API・生成内容・保存データは変更なし。既存の翻訳スモークテストに、初回/ニュアンス再生成/保存後のバッジ非表示と保存完了案内の維持を追加。360/390px中国語・430px英語で全フロー成功、390px画像を目視確認、対象ESLint成功。既存.nextのReparsePointには触らず、一時distDir `tmp/phrabit-responsive-shots/translation-label-build-20260906` でビルド・25ページ生成成功。同出力をローカル起動して検証し、終了後に一時distDirとtsconfig追加を取り消し、next-envも通常の開発用パスに戻ったことを確認。Preview/本番未反映、commit/pushなし。

- 最新のログイン設定：「次にすべきは？」への回答で提示したGoogle許可先追加を、ユーザーの「よい」で実行。既存「ウェブ クライアント 1」に `https://poker-chinese-trainer-pwpfzstm1-renponpons-projects.vercel.app` と同origin + `/auth/google/callback` を追加した。保存クリック後にタブがabout:blankになったため、設定ページを再度開いて永続化を照合。生成元8件・リダイレクト9件で、既存7件・8件を全て維持。秘密値の取得/再発行や既存URLの削除/置換なし。最新Previewで本人のGoogleアカウントを選び、ヘッダー `renren19951225` とライブラリの「同期済み」、「お水をください」「少しゆっくり話してもらえますか？」を確認した。フレーズ追加・削除・回答はしていない。再デプロイ・commit/push・本番アプリ変更なし。実スマホでのポップアップ/キーボード操作、スマホ回答のPC同期、通信断復帰が残る。以下のGoogle承認待ちは設定前の履歴。

- 最新：ユーザーの「反映してよい」に従い、モーダル化とニュアンス再生成の自動読み上げ撤回をPreviewだけへ公開。URL `https://poker-chinese-trainer-pwpfzstm1-renponpons-projects.vercel.app`、ID `dpl_4VF49z1ZLErjsGmUpAF4oDAoK26K`、READY、target null/Preview、aliasなし。クラウドビルド約39秒で完了。本番 `phrabit.com` のID `dpl_FhLM4NM8W1Zcm6qapFKZhEkBBKPQ` と全aliasが前後で不変。commit/pushなし。`.env*`・`.private-backups/`・`tmp/` は送信対象外。
- 最新Previewの実ブラウザ/実APIで「ここで少し待ってください」→「请在这里稍等一下」を生成。「調整」と「再生」、解説初期展開、常設入力欄の非表示を確認。モーダルで友人向けの補足を入力し、閉じる/再表示で保持、再生成後「在这儿等一下」へ更新して自動で閉じることと、再生チェック未選択を確認。音声呼出なしの検証は直前の固定API/音声スタブテストによる。ゲスト・未追加のままで学習データへ保存していない。新URLのGoogle生成元/リダイレクト追加は具体的URLを提示して承認待ち。検証保護は維持し、23時間限定共有リンクのトークンは文書に残さない。以下の「Preview未反映」はこの公開前の履歴。

- 以下の音声撤回後、常設ニュアンス入力を再生横の「調整」から開くnative dialogへ移動した。入力フォーカス・Tab循環・背景スクロール停止・閉じる/Escape・フォーカス復帰に対応。閉じても補足文を保持し、再生成成功時は閉じ、失敗時は入力とエラーを残す。生成中に開き直しても二重送信しない。自動再生なし・解説初期展開・明示保存の仕様を維持。360/390px中国語、430px英語、480px高さで固定API/音声スタブの動作と画面を確認済み。個人フレーズ/会話/ドリルの回帰テストと対象ESLint成功。実機キーボード表示時は未確認。Preview/本番未反映、commit/pushなし。
- このモーダル変更の最終ビルドは既存 `.next/static/AbxwhyAC9GZZfCFtduB61` のEPERMで停止した。対象がReparsePointのため再帰削除は安全確認に拒否され、削除していない。代わりに未使用の `tmp/phrabit-responsive-shots/nuance-popup-build-20260906` を一時distDirとして `npm run build` を実行し、型検査・25ページ生成まで成功。検証後はdistDirとtsconfigへの追加を取り消し、next-envも開発サーバーが通常の `.next/dev/types/routes.d.ts` に再生成したことを確認済み。一時出力は既存のGit/Vercel除外内で、公開設定に一時パスを残していない。

- 最新：ユーザーが「このニュアンスで作り直す」の再生成後の自動読み上げを撤回したため、その追加実装だけをローカルで取り消した。再生成成功時の音声呼出と専用refを除き、`SpeechPlayButton` は従来の手動再生/停止へ戻した。「使い方・想定返答」の初期展開、翻訳画面の定型コピー/同期済み非表示、未同期警告の維持は変えていない。390px中国語/430px英語の固定API・音声スタブテストで、自動再生なし、手動で新しい訳を正しい言語で再生/停止、再生成失敗・画面復帰・保存時に追加再生なしを確認。対象ESLint・ビルド成功。撤回の変更はPreview/本番未反映、commit/pushなし。実スマホの自動読み上げ確認依頼は不要になった。
- 直前のPreview公開：表示/音声変更後の「次に進んで」に従い、Previewだけを再デプロイした。現在の検証URLは `https://poker-chinese-trainer-6o0j2cs2t-renponpons-projects.vercel.app`、ID `dpl_9NGWiJUFT3WgXecVB1qRPTXpwmvF`、READY、target null/Preview、aliasなし。ビルド約38秒で完了。本番 `phrabit.com` は引き続き `dpl_FhLM4NM8W1Zcm6qapFKZhEkBBKPQ` で、commit/push/本番デプロイなし。`.env*`・`.private-backups/`・`tmp/` はVercel送信対象外。
- 新Previewの実ブラウザ/実APIで、キャッチコピーなし、通常中国語訳「ここで少し待ってください」→「请在这里稍等一下」、解説の初期展開、友人向けのニュアンス再生成「在这儿等一下」と解説の展開維持を確認した。未追加のままでクラウド学習データへ保存していない。自動音声の呼出/停止/重複防止は直前の自動テスト済みだが、実スマホの音声出力は未確認。
- 新URLは旧Previewと別originのため、ログイン状態・端末内データは自動共有されない。検証DBは同じものを使用する。ユーザーの「よい」の承認後、Google Cloud `phrabit` の既存「ウェブ クライアント 1」へ新Preview originと同URLの `/auth/google/callback` を追加した。「OAuth クライアントを保存しました」を確認し、再度編集画面を開いて生成元7件・リダイレクト8件と、既存6件/7件の維持を照合した。秘密値・既存URL・本番設定の置換/削除なし。23時間限定共有リンクのトークンは文書へ残さない。
- 新PreviewのGoogleログインで本人アカウントを選択後、ヘッダー `renren19951225` を確認。保存画面に「同期済み」と「お水をください」「少しゆっくり話してもらえますか？」が表示され、翻訳へ戻ると同期成功文言が非表示になることも実ブラウザで確認した。追加生成や学習フレーズの変更はしていない。再デプロイ・commit/pushなし。実スマホでのニュアンス再生成後の音声出力が次の本人確認事項。

- ユーザーから全利用者のクラウド学習データをこのPCへ暗号化退避すること、検証DBを `renponpon's Org` に作ることの承認を取得済み。以下は直後の「未作成・承認待ち」時点の記録に優先する。
- 本番の5学習テーブルを単一SELECTのスナップショットとして取得し、`.private-backups/learning-20260906-065353Z-owner.dpapi` へ保存。取得時刻は2026-09-06 15:53:53 JST。保存フレーズ163行、ドリル161行、旧フレーズ158行、旧SRS96行、カテゴリ0行。旧新テーブルに同じフレーズがあるため、合計をユニークフレーズ数としない。
- Windows DPAPI CurrentUserで暗号化。実Windowsアカウント `RENのPC\renre`（SID末尾1001）で暗号化・別プロセスからの復号照合を確認した。初回のCodexサンドボックス用アカウントで生成した中間コピーは、実利用者用コピーの照合後に削除済み。平文データファイルは作っていない。Git・Vercel送信対象外。
- 復号後のSHA-256は `0550190AC5E94C499FB33ADFEF57B93DA7C58DC41F48120DC56AF82669E3968C`。ファイルサイズ1,023,270bytes。`scripts/protect-learning-backup.ps1 -Mode Verify -Name learning-20260906-065353Z-owner.dpapi` を実Windows利用者のPowerShell 7で実行すると、本文を出力せず件数・ハッシュ・実行アカウントを確認できる。Codexからは昇格実行が必要。
- この形式はこのWindowsユーザープロファイルに依存する。PC紛失・Windows再インストール後も別PCで復旧できる可搬バックアップではない。Authの認証情報・Storage実ファイル・アクセス計測・端末未同期データは含まない。下記のローカルPostgres復元照合は完了したが、Supabase全体やAuthを含む災害復旧の検証ではなく、「完全バックアップ・復元済み」と表現しない。
- 検証用Supabase `phrabit-preview-20260906` / `ozhmqkcajgumifthntne` を作成した。組織 `ghjzrphhesftzusxpwwd`、リージョン `ap-southeast-1`。作成時の費用照会は月額0ドル。課金プラン変更・有料アドオンの追加はしていない。
- 検証DBへ `supabase/schema.sql` の構造と、旧テーブル・カテゴリ用の明示的なauthenticated CRUD権限を適用した。migration名は `initialize_isolated_phrabit_preview`。本番にはスキーマ変更なし。全公開テーブルのRLS有効・Supabase security advisors指摘0件を確認。
- 合成ユーザー・フレーズだけを使い、本人の読取/更新成功、別アカウントの読取/更新/新規作成拒否、匿名読取拒否を `scripts/smoke-preview-rls.sql` で検証した。最後にROLLBACKし、テスト後の学習5テーブル・Authユーザーが全て0件であることを確認。本番の利用者データはPreviewへコピーしていない。
- Vercel `poker-chinese-trainer` のPreview全ブランチへ `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `PHRABIT_PREVIEW_SUPABASE_REF` の3項目を登録・一覧照合済み。ANON_KEY変数には新しいpublishable keyを使用。Production/Developmentの変数は変更していない。
- CLI v53.3.1では `env add NAME preview --value ... --yes` がブランチ省略時に矛盾したaction_requiredを返した。`node vercel/dist/vc.js` を `spawnSync` し、previewの直後に明示的な空文字引数を渡すと全Preview向け登録に成功。`vercel api --input` のJSON配列POSTは400だったが、オブジェクトPATCHは成功した。`.cmd` ではURLの `&` や空引数が壊れるためNodeから直接CLIを起動する。秘密値の取得・表示はしない。
- 追加承認「既存APIキーをPreviewでも使う」に従い、既存8設定のtargetだけを `[production, preview]` に変更し一覧照合した。Gemini/DeepL/Azure/OpenAIキー、DeepL plan、Azure region、OpenAI transcription model、公開Google client IDが対象。値・sensitive型・production対象を維持。DB service role、Notion、Resendは共有しない。検証API使用量は本番と同じAPI契約へ加算される。
- Previewを `https://poker-chinese-trainer-bzj1smtem-renponpons-projects.vercel.app` へデプロイした（`dpl_LGniVr4TgaFuAFg6my3rz3QyL8xF`、READY、target null/Preview）。クラウドの `npm run build` 成功。本番targetは引き続き `dpl_FhLM4NM8W1Zcm6qapFKZhEkBBKPQ`。commit/push/本番デプロイなし。以降のバックアップ検証スクリプト・文書更新はこのPreviewには未送信だが、アプリコードは変えていない。
- Vercel認証保護は維持し、接続ツール発行の23時間限定共有リンクでブラウザ確認した。共有トークンをこの文書へ保存しない。再訪時にVercelログインが必要なら接続ツールで新しい一時リンクを発行する。
- 実ブラウザ・実APIでDeepL通常の中国語訳、Geminiのニュアンス調整、解説の後続生成、端末への明示追加、追加フレーズのドリル回答/完了、翻訳画面へ戻った際の結果維持、Azure速度の英語訳を確認。Google未設定のためゲスト利用であり、クラウド同期・複数端末・実マイクの合格を意味しない。中国語の `说得慢` に `shuō dé màn` と出る既存の軽声誤りを発見。キー設定とは別の品質課題として残し、この作業で翻訳処理は変更していない。
- 暗号化ファイルを本人のWindowsアカウントでメモリへ復号し、PGlite 0.5.8の一時Postgresへ学習5テーブル全件を復元した。リポジトリのテーブル定義、列一致、制約・外部キー、件数、JSONB内容の完全一致を確認。実データの外部送信・平文ファイル化なし。Authは参照先IDだけの仮テーブルで、認証情報の復元ではない。
- 復元照合コマンドは `pwsh -NoProfile -File scripts/protect-learning-backup.ps1 -Mode VerifyDatabase -Name learning-20260906-065353Z-owner.dpapi`。事前に `npm install --prefix tmp/backup-restore-runtime --no-audit --no-fund --ignore-scripts @electric-sql/pglite@0.5.8` が必要。アプリのpackage.json/lockfileは変更していない。`scripts/smoke-backup-restore.mjs` のESLint成功。tmpはGit・Vercel送信対象外。
- Google設定は実行直前の「はい」の承認後に完了した。Google Cloud `phrabit` の「ウェブ クライアント 1」（Vercelの公開Google client IDと一致）の既存生成元5件・リダイレクト6件を維持し、今回のPreview originと同URL + `/auth/google/callback` を1件ずつ追加した。「OAuth クライアントを保存しました」を確認。本番URL・secretの削除/置換/再発行なし。
- 検証Supabase `ozhmqkcajgumifthntne` のGoogle providerへ同じ公開client IDを設定し、有効化・保存後のEnabled表示を確認した。既存のアプリは `response_type=id_token` → `signInWithIdToken` を使うため、OAuth用client secret空欄のまま設定が受理された。秘密値の取得・入力・再発行はしていない。Skip nonce checksとAllow users without an emailはOFFを維持。本番Supabaseの認証設定は変更していない。
- GoogleのiPhone本人確認をユーザーが承認後、Previewのヘッダーに `renren19951225` と「同期済み」が表示された。検証DBのAuthユーザー1件と、ゲスト時に作成した中国語テストフレーズ1件のクラウド移行を確認。Google secretなしの既存IDトークン方式でSupabaseセッション発行まで成功した。ワンタイム番号・認証URL・トークンを文書へ保存しない。
- ログイン後に「予約を明日に変更できますか？」を通常モードで英訳。結果表示時は未追加で、DBも中国語1件・英語0件のまま。「ドリルに追加」を押した後に英語1件が保存され、解説生成と指定ドリルのGood回答/1件完了を確認した。実DB上で英中2件とも解説あり、last_score=2、learning、次回復習日あり、所有者一致、旧SRSの回答/次回日一致を確認。検証データだけで本番の学習データを編集していない。
- ユーザーがスマホで既存フレーズを「見えた・追加した」と確認。スマホ追加の「お水をください」→「请给我点水」（ID `84897560-5bd2-4348-ae1f-98a922c61537`）が検証DBへ解説付きで保存され、PCの中国語ライブラリにも表示された。PC側のVercel検証用アクセスが切れて未同期表示だったため、承認済みの一時共有リンクを再発行して開き直し、「同期済み」と追加フレーズを確認した。別タブを独立端末の実証として扱っていない。スマホでの回答同期・通信断/復帰・別アカウント分離・実マイクの実環境テストは未完了。短期共有URLはVercel認証保護を維持したまま接続ツールで発行する。
- 続く表示/音声の依頼はローカル実装のみ。翻訳の「使い方・想定返答」を初期展開し、訳が変われば再展開する。ニュアンス再生成の成功時に新しい訳を対象言語で一度読み上げ、既存の再生ボタンで停止できる。初回翻訳の音声仕様は変えず、失敗・画面復帰・保存・解説更新では自動再生しない。翻訳画面から定型コピーと通常の「同期済み」を除き、未同期/失敗/競合の警告と他画面の同期表示は維持する。保存形式・同期/API処理は変更しない。
- この表示/音声変更の確認：ビルド・対象ESLint・同期コーディネータと通知のテスト成功。固定APIと音声スタブによる390px中国語/430px英語で、解説初期表示、調整後の訳/言語での一度の再生と停止、画面復帰/失敗/保存時の重複再生なしを確認。共通言語・端末退避の回帰テスト成功。個人フレーズ導線テストは初回に英語ライブラリの「削除」クリック待ちがタイムアウトし、単独再実行で英中・会話の該当導線が通った。実スマホの自動音声再生はこの変更をPreviewへ反映後に確認が必要。commit/push・Preview再デプロイ・本番反映はしていない。

- 本番へ反映せず、端末の更新前退避と独立Previewの安全チェックをローカル実装。コミット・push・デプロイは未実施。
- `DeviceSafetyGate` が初期表示時にフレーズ・SRS・カテゴリ・学習言語・端末のアカウント別キャッシュ等を生の文字列で一度だけ退避する。認証トークン・APIキーは対象外。容量不足・退避データ破損の場合は通常画面・初期同期を開始しない。既存の退避を自動上書きしない。
- `/data-safety` は自動同期を起動せず、現在の端末データ・更新前データをJSONでダウンロードできる。端末復元は同じorigin・データ所有者のみ。復元直前のデータを別退避し、同期停止マーカーを確認してから戻す。途中失敗・再読み込み後も同期停止を維持する。復元前退避もダウンロード可能。
- 復元後に利用者が安易に同期を再開しない設計。通常利用再開・クラウドとの照合は運営による個別確認が必要。JSONアップロードからの一般的なインポートUIは未実装。
- これは同じブラウザ内の退避であり、ブラウザデータ削除・端末紛失への独立バックアップではない。任意のJSONダウンロードを併用する。未訪問・オフラインの他利用者端末から運営が一括取得することはできない。保護コードが届く以前の古いタブを遠隔停止することもできない。
- 初期確認時はVercel Previewの環境変数0件、独立Supabase未作成だった。承認後に検証DBと接続3設定を準備済み。本番の `translation-app` と混用しない。`preview-environment.ts` はPreviewの本番DB参照、不一致URL、3モードのキー不足、Notion/Resend接続を検出して起動・ビルドを停止する。ローカル・本番環境の設定は変更しない。
- 初回の全利用者学習データ取得は自動安全チェックに拒否された。具体的な範囲と暗号化保管先を示し、追加承認後に取得・暗号化・復号照合を完了した。拒否された操作を迂回して取得しない。
- `.private-backups/` はGit・Vercel送信対象から除外した。除外設定だけでは暗号化にならない。クラウドバックアップ取得時は暗号化・復号照合・隔離先復元まで確認し、完了前に「バックアップ済み」としない。学習テーブルだけの退避はAuth・Storageを含む完全DBバックアップではない。
- 検証：domain 74件 / infrastructure 23件、lint・本番向けビルド、同期・保存APIの疑似クラウドテスト成功。`scripts/smoke-device-safety.mjs` で390/430px、更新前の生データ保持、JSONダウンロード、復元前退避、復元後・再読込後のAPI非送信、容量不足時の停止を確認。共通言語・翻訳・個人フレーズ導線の既存3種ブラウザテストも成功。実翻訳API・実アカウント同期・クラウド復元は未検証。

### 利用者向け手順と公開判定

1. 今は本番 `phrabit.com` を変更しない。NotePCの `http://localhost:3010/data-safety` で「現在の端末データをダウンロード」は確認できるが、ここには本番スマホのデータは入っていない。「復元」は通常テストで押さない。
2. 全利用者のクラウド学習データは、追加承認後に暗号化退避・復号照合まで完了した。クラウドに未送信の他利用者の端末データはこの退避には入らない。実DBへの復元検証は未完了。
3. テスト用Supabaseは `renponpon's Org` に月額0ドルの照会結果で作成済み。スキーマ/RLS設定、合成データでの権限テストまで完了。本番利用者のデータはコピーしていない。
4. 翻訳キーはチャットに貼らず、Vercelの `poker-chinese-trainer` → Settings → Environment Variables → Previewのみを選択して登録する。`GEMINI_API_KEY`（品質/解説）、`DEEPL_API_KEY`（通常）、`AZURE_TRANSLATOR_KEY` と必要に応じ `AZURE_TRANSLATOR_REGION`（速度/フォールバック）。本番用Sensitive値が読めなければ提供元で確認または検証用キーを発行し、本番のキーを削除・再発行しない。
5. テストDBのURL・公開キー・参照IDのPreview設定は完了。Googleログインでは `NEXT_PUBLIC_GOOGLE_CLIENT_ID` とテストDB側のGoogleプロバイダを設定し、発行されたPreview URLの `/auth/google/callback` をGoogle側の許可済みリダイレクトURIに追加する。現実装はGoogleからアプリへid_tokenを返す方式（`AuthButton.tsx`）であり、Supabaseの標準OAuthコールバックだけを追加しても足りない。本番のリダイレクト設定は消さない。Notion/ResendはPreviewで空にする。
6. Codexが設定値を表示せず確認し、既存VercelプロジェクトへPreviewだけをデプロイする。mainへpushしない。スマホではlocalhostでなく発行されたHTTPSのPreview URLを開く。テスト用アカウントでログインするため、本番のフレーズが出ないことは正常。
7. PC/スマホを同じテストアカウントで開き、両言語の翻訳→ニュアンス調整→明示追加→ドリルを確認する。片方で追加・編集・ドリル回答・削除し、他方を開き直して一致を確認する。通信を切った状態での追加と回答が残り、復帰後に重複なく反映することも確認する。別アカウントへ切り替え、データが混ざらないことを確認する。
8. 更新前からデータがあるテストブラウザを新バージョンへ切り替え、元データと退避が一致することを確認する。クラウドの復元も隔離先で確認する。公開時は保護だけの先行リリースを別途切り出すか検討し、バックアップと変更コードの両方の戻し方が整った後、ユーザーの明示承認で本番へ反映する。コードのロールバックだけでは変更されたデータは戻らない。

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

## 2026-09-06 コア導線・保存信頼性（ローカル実装・未公開）

- 合意済みAstraレビューの最小セットA1〜C1を実装。無料枠・価格・生成モデル・音声の自動フォールバックは今回変更していない。コミット・push・デプロイ・DB変更は未実施。
- 翻訳／会話の明示追加は、解説完了を待たずフレーズとSRSを端末保存する。`saved-phrase-explanation.ts` で同じIDへ読み・解説を後から補完する。古い本文・削除済みID・別アカウントへの反映を防ぎ、学習履歴を上書きしない。失敗時は保存画面から解説生成を再試行できる。
- 未選択会話の自動履歴保存を停止。従来の保存済みフレーズと既存履歴は削除しない。翻訳画面の直前の入力・結果・ニュアンスは、アカウント別・同一タブのメモリで画面移動時に復元する。再読み込み・タブ終了後の復元や会話全文の履歴機能ではない。
- 新規利用者へのサンプル自動追加を停止し、「自分の一言を追加」を主導線にする。「サンプルで試す」は保存/SRS/回答計測なしの任意モード。既存サンプルは維持。場面別生成は「例文」の補助導線として残す。
- 翻訳と保存画面の主要操作を解説より前に配置し、長い解説は内容を維持した開閉式にする。追加直後・保存一覧から `/drill?phrases=ID` でその一言を練習できる。回答は通常SRSへ記録する。解説更新・同期によって通常/指定フレーズ練習の進捗やBad再出題をリセットしない。
- アカウント同期を、直前同期状態・端末・クラウドの差分比較へ変更。`phrabit-account-checkpoint-v1:USER_ID` に同期基準と端末状態を保持し、未同期追加・更新・削除をログアウト後も当該アカウントへ復元/再試行する。初回の旧データは従来方式で一度統合する。
- 別端末で削除された既知IDへの未同期編集は、自動復活させず端末に保持して通知する。`PATCH /api/phrases` の `existingOnly` は存在する本人の行だけ更新し、削除済みは409。認証付きGETが失敗した場合は空一覧ではなく401。`save-pack` は保存完了後に応答し、一部失敗は503。
- 同期中の追加・変更を再比較し、アカウント変更後の応答は適用しない。認証更新・通信復帰・フォーカス復帰でも再試行し、ヘッダーに同期状態を表示する。サーバーの原子的な複数テーブル更新や削除tombstoneは導入しておらず、完全同時編集の全競合や初回統合前の削除履歴まで解決したわけではない。
- `npm run lint`、`npm run build`、ドメイン74件・インフラ13件の単体テスト、5本のスモークが成功。`smoke-save-api.mjs` は実ルート/リポジトリを疑似ストレージで実行し、保存待機・失敗応答・認証・本人行限定・削除済み更新停止を検証する。`smoke-account-sync.mjs` は実同期コードを疑似クラウドで実行し、失敗再試行・削除・競合保持・処理中編集・ログアウト復元・アカウント切替を検証する。
- `smoke-learning-language.mjs`、`smoke-translation-flow.mjs`、`smoke-personal-phrase-flow.mjs` は3010の開発サーバーを使い、外部通信を遮断した独立ブラウザで中国語390px/英語430pxを検証する。後者は解説待ち中の即時保存・画面復元・生成重複なし・指定練習・解説後のSRS維持・会話選択保存・解説失敗・異なる言語の一覧から練習・削除後の追加状態・通常ドリル同期を含む。
- 実翻訳品質、実測の生成秒数、実マイク、海外回線、実Supabaseの複数端末同期は未検証。ローカルの翻訳APIキーは未設定。生成回数を増やすレビュー段階は追加していない。解説処理は画面移動中も継続するが、ブラウザ終了後の自動再開は保証しない。

## 2026-09-06 共通の学習言語（ローカル実装・未公開）

- メニューの「学習言語（全画面共通）」で英語／中国語を選択できる。翻訳・ドリル・保存・会話は一つの設定を参照し、各画面での言語切り替えもこの設定を更新する。
- `learning-language-storage.ts` と `use-learning-language.ts` で保存・購読を共通化。`phrabit-learning-language-v1` にブラウザ単位で保持し、再読み込み・再訪・同一オリジンの別タブへ反映する。未設定・不正値は従来の中国語。アカウント経由の別端末同期は未対応。
- 保存画面は選んだ言語を初期表示し、「全て（一時表示）」は共通設定を変更しない。言語変更時には検索・選択状態をリセットする。保存済みフレーズや学習履歴の内容は変更しない。
- 翻訳方向は共通言語と入力側から導出し、逆方向でもAPI・音声認識の言語を一致させる。ドリルの初期キューと `drill_open` 計測の中国語固定も解消する。
- 言語設定のための追加API・生成処理はない。ブラウザ保存が拒否された場合は画面遷移中のみメモリで保持できるが、再読み込み後の保持は保証しない。
- `node scripts/smoke-learning-language.mjs` で4画面、再読み込み、保存状態からの再起動、別タブ、逆方向API・音声認識設定、不正値・保存失敗、既存フレーズ非変更、390/430pxを確認する。外部通信は遮断しAPI・音声認識はテスト応答。実翻訳品質・実マイク・クラウド同期の検証ではない。
- 共通言語設定の後、同日中にAstra提案の最小セットもローカル実装した。詳細と検証の限界は直前のコア導線・保存信頼性節を参照。コミット・本番反映は別途明示指示後に行う。

## 2026-09-05 ローカル検証・事業方針

- 主対象は海外生活者。基本の翻訳・ニュアンス調整・保存・ドリル・ログイン同期は無料を維持する方針。有料生成枠・価格は未決定で、課金や無料枠変更は未実装。
- ニュアンス調整・確認後ドリル追加は未公開。再調整中または追加中に別の送信を開始できる不備を修正し、ハンドラとボタンの両方で多重処理を防ぐ。
- `npm run dev` 起動後に `node scripts/smoke-translation-flow.mjs` で画面回帰テストを実行できる。既存PlaywrightのChromiumまたはインストール済みChrome/Edgeを使う。
- このテストは全API応答を固定し、外部通信を遮断した独立ブラウザで動く。中国語390px・英語430pxで、未追加時の非保存、補足と元文の送信、再調整失敗時の直前訳維持、明示追加、SRS、同期失敗時のローカル保持を確認する。
- API応答固定テストの成功は、実翻訳品質・実クラウド保存・ログイン同期・中国本土接続の検証結果ではない。ローカルの翻訳APIキーは未設定。
- スクリーンショットは `tmp/phrabit-responsive-shots/translation-flow/` に生成する。テスト用の訳・解説・ピンインであり、宣伝画像には転用しない。
- 9月5日時点では未追加結果の一時保存は未実装（9月6日に同一タブのメモリ保持を実装）。営業送信・提携・価格公開は未実施。正本の実行計画は `docs/roadmap.md` の9月節を参照。

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

### 翻訳画面（`/`, `/add`）

- 翻訳 API は `persist: false` とし、翻訳結果を未保存の候補として表示する
- 結果が意図と違う場合は「ニュアンスを調整」へ補足し、Gemini品質モードで元文と前回訳を踏まえて作り直す
- 翻訳結果は自動でドリルへ追加しない
- 結果カードの「ドリルに追加」を押した時だけ、ライブラリ保存・SRS作成・クラウド保存を行う

### 会話画面（`/conversation`）

- 翻訳中は **ライブラリに保存しない**（`persist: false`）
- **ドリルに追加** で初めて localStorage + クラウド保存
- 右上「ドリルに追加」→ フレーズ選択 → 端末保存・`shouldDrill: true` → ピンイン・解説を後から補完（2026-09-06ローカル改修）
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
| タブ自動反映（`PHRASE_UPDATED_EVENT`） | 2026-09-06にドリルと保存一覧の解説更新反映を対応 |
| 会話ログの sessionStorage 永続化 | 今は不要 |
| 会話カテゴリ | 未分類で OK |
| 「会話を消去」ボタン | 削除済み。代わりにドリルに追加 |
| ゲスト→ログイン同期 UI | 中期 |

---

## 既知の制限

- ニュアンス調整はGemini品質モードを使うため、通常翻訳より生成時間が長い
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
