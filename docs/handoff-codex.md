# Phrabit 引き継ぎ（2026-05）

Cursor での開発から Codex + VSCode への引き継ぎ用ドキュメント。  
**新しいセッションでは、まずこのファイルと `AGENTS.md` を読むこと。**

---

## 2026-09-06 本番保留・データ保護の準備

### 承認後の進捗（2026-09-06）

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
