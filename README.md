# Poker Chinese Trainer (MVP)

中国語圏でライブポーカーをする日本人プレイヤー向け、自分の「言いたかった日本語」を反射で出る中国語に変えるトレーナー。

## コンセプト

> 現場で言えなかった一言を、次の遠征で武器に変える。

## MVPの最小ループ

1. 日本語フレーズを入力する（例: 「私のコップはこっちです」）
2. Gemini が自然な普通話・ピンイン・短い解説を生成し、Notion に保存する
3. 「今日のドリル」で日本語 → 中国語の瞬間作文を行う
4. SRS（Bad / Good / Perfect）で復習間隔が変わる
5. 反射で出るようになったら卒業（メンテナンス枠へ移動）

---

## A. 14日検証ラン（最優先）

**目的**: 新機能より先に、「続いて使えるか」を測る（RA1: 入力習慣が成立するか）。

| Day | 最低ライン（目安） | メモに残すこと |
|-----|---------------------|----------------|
| 1〜3 | 1日あたり 1〜3 フレーズ追加 + ドリル 5分 | 「追加したかった瞬間」（卓上／ホテル等）を一行 |
| 4〜7 | 同上、週で合計15件を目標 | 現場で**言えた**／**また言えなかった**を各1つ |
| 8〜14 | 習慣が途切れた日があれば「理由」（疲労／忘れ／不便）を書く | サブスク払えるか級の体感（無理なら何が嫌か） |

**ルール**:

- Duolingo 的な枝豆学習はしない。増やすのは「昨日〜今日に本当に言いたかった一文」だけ。
- ドリルの Perfect は浮かんだら続けてよいが、**無理して Burnout しない**。
- **VercelURL** と **localhost** と **別PCのブラウザ** は **SRS（localStorage）が別**。普段メインで使う **URL は1つに固定** する。

**終わり見え**: 14日目に、(1) 追加の継続日数、(2) 総フレーズ数、(3) 現場での成功エピソード数、(4) 「明日も使う」と思えるか を振り返る。

---

## B. スマホから使う（同じWi‑Fi）

開発サーバーは **ポート `3010`**、`0.0.0.0` にバインド済みです。

### 手順（Windows）

1. PC で `npm run dev` を起動（または `start-dev.bat` をダブルクリック）。
2. PC で **IPv4 アドレス** を確認する（例: Wi‑Fi で `192.168.1.42`）。
   ```powershell
   ipconfig
   ```
3. **スマホを同じWi‑Fi** に繋ぐ。
4. スマホのブラウザのアドレス欄へ次を入力:
   ```txt
   http://（PCのIPv4）:3010
   ```
   例: `http://192.168.1.42:3010`

### 繋がらないとき

- Windows ファイアウォールで **Node.js** が **プライベートネットワーク** でブロックされていないか確認する。
- ゲストWi‑Fi / 端末 isolation だと LAN 通信が切られていることがある。その場合は **Vercel デプロイ** を使う。

---

## Vercel 無料デプロイ

サーバーレスで Next.js が動く。`/api/phrase/add` もそのまま使えます。**環境変数を Vercel 側で設定することが必須**です。

### 方法1: GitHub 連携（おすすめ）

1. このフォルダを Git リポジトリにする（GitHub に push）。
2. [Vercel](https://vercel.com) にログイン → **New Project** → GitHub のリポジトリを選択。
3. Framework: **Next.js**（自動検出のままで可）。
4. **Environment Variables** に次を設定（値は自分のもの）:

   | Name | Environment |
   |------|--------------|
   | `GEMINI_API_KEY` | Production, Preview, Development（すべて） |
   | `NOTION_API_KEY` | 同上 |
   | `NOTION_DATABASE_ID` | 同上 |

5. Deploy。完了後の URL（例 `https://xxx.vercel.app`）をブックマークする。

### 方法2: Vercel CLI

```bash
npm i -g vercel
cd c:\Users\owner\Cursor作業フォルダ\ChineseStudy
vercel login
vercel           # Preview
vercel --prod    # Production
```

初回ウィザードで環境変数を聞かれたら入力。後から Dashboard の **Project → Settings → Environment Variables** で追加入力して **Redeploy** でも可。

### 方法3: 同梱スクリプト（Git 不要・すぐ試す）

プロジェクト直下の **`deploy-vercel.bat`** をダブルクリックするか、PowerShell で:

```powershell
cd "c:\Users\owner\Cursor作業フォルダ\ChineseStudy"
.\deploy-vercel.ps1
```

流れ: `npm run build` → `npx vercel@latest deploy --prod`。初回はブラウザで Vercel にログインする案内が出ます。

**デプロイ直後の必須作業（毎回）**

1. [Vercel Dashboard](https://vercel.com/dashboard) → 作成された **Project** → **Settings** → **Environment Variables**
2. 次を **Production**（必要なら Preview も）に追加:
   - `GEMINI_API_KEY`
   - `NOTION_API_KEY`
   - `NOTION_DATABASE_ID`
3. **Deployments** → 最新デプロイの **⋯** → **Redeploy**（環境変数を読み込ませる）

※ Cursor のエージェントからは、お使いの環境の都合でターミナルがブロックされることがあり、こちら側で `vercel` コマンドを代行実行できない場合があります。そのときは上記スクリプトか、手元の **コマンドプロンプト / PowerShell** で同じコマンドを実行してください。

### デプロイ前の自分で確認（任意）

```bash
npm run build
npm start
```

`npm run build` が通れば Vercel でも通ることが多いです。

### SRS（進捗）について

復習の進み方はブラウザの **localStorage** に保存されています。**URL（オリジン）が変わると進捗は別**になります。**普段つかう環境は1つに統一**するとよいです。

---

## 技術構成

- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS v4
- Gemini API（フレーズ生成）
- Notion（フレーズマスター保存）
- localStorage（SRS進捗保存）
- Web Speech API（中国語TTS）

## セットアップ（ローカル）

```bash
npm install
copy .env.local.example .env.local
REM .env.local に GEMINI / NOTION を記入（実値）
npm run dev
```

ブラウザ: **http://localhost:3010**

（ポート `3000` は他アプリが使っていることがあるため、このプロジェクトは **3010** 固定）

手早く起動: エクスプローラで **`start-dev.bat`** をダブルクリック（ブラウザが開きます）

## 環境変数

| 変数 | 用途 |
|------|------|
| `GEMINI_API_KEY` | フレーズ生成 |
| `NOTION_API_KEY` | Notion API |
| `NOTION_DATABASE_ID` | フレーズ保存先データベース |

ローカルの `.env.local` と、Vercel の Environment Variables で **同名・同値** にする。

---

## Notion側の準備（初回）

インテグレーションに、対象データベースへのアクセスを付与済みであること。また DB に少なくとも次のプロパティがあること（voice-memo-app と同等）:

- `Japanese` (Title)
- `Chinese (Natural)` (Text)
- `Pinyin` (Text)
- `Grammar`（解説テキスト用・Text）

（`Chinese (Literal)` はあればフォールバック読み込みに使います）

## ディレクトリ構成

```
src/
├── app/
│   ├── page.tsx                # ホーム
│   ├── add/page.tsx            # フレーズ追加
│   ├── drill/page.tsx          # 今日のドリル
│   ├── library/page.tsx        # ライブラリ
│   ├── api/phrase/add/route.ts # Gemini + Notion 保存
│   └── layout.tsx
├── components/
│   └── Flashcard.tsx
└── lib/
    ├── notion.ts
    ├── srs.ts
    ├── speech.ts
    └── types.ts
```

## 開発メモ（よくある罠）

- **別プロジェクト**（例: LivePokerMemo）が `:3000` を使っている。このアプリは **3010**。
- 「Npm task detection: failed to parse package.json」のような **Cursor の NPM Scripts 自動検出**の警告が出ても、`npm run dev` 自体とは無関係なことがある（`npm run dev` と **Terminal** で直接実行）。
- Node の `DEP0169 url.parse()` 警告は **依存パッケージ／Next側の deprecation**。アプリ動作とは無関係なことが多い。
