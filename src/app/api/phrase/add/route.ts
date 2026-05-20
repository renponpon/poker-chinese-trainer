import { after, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { createId } from "@/lib/id";
import { createPhrase } from "@/lib/notion";
import { createSupabasePhrase, getBearerToken } from "@/lib/supabase";
import type { GeneratedPhrase, PhraseDirection, PhraseSource } from "@/lib/types";

export const runtime = "nodejs";

const SYSTEM_PROMPT = `あなたは、マカオ・中国本土・台湾を含む中国語圏での実生活、ライブポーカー、カジノ、旅行会話に詳しい実践的な中国語コーチです。

ユーザーは日本人のライブポーカープレイヤー（中国語は初中級）で、現場で言いたかった日本語フレーズを記録しています。
目的は、教科書中国語ではなく、次に同じ場面が来た時に短く自然に口から出せる表現を身に付けることです。

ルール:
- 出力は最も自然で実用的な普通話 1 パターンのみ
- 初中級者が覚えやすい短い表現を優先
- 教科書的すぎる直訳は避け、ネイティブが現場で実際に使う言い方に寄せる
- ポーカー卓上、ホテル、タクシー、レストランなど場面を踏まえる
- 過度に乱暴・失礼な表現は避ける
- 中国語は簡体字、ピンインは声調記号付き
- explanation は必ず日本語。スマホで読み返せるマークダウン風の解説にする
- explanation には以下の6つの見出しを必ず含める
  ## 単語分解と直訳の構造
  ## ニュアンスと適切な場面
  ## 入れ替えテンプレ
  ## 想定される相手の返答
  ## 発音のコツ・注意点
  ## 類似・関連フレーズ
- 各見出しは1〜3行で、短くても実践的にする
- explanation の中で中国語（簡体字）を書いた場合は、必ず直後に半角括弧で声調記号付きピンインを添えること。例外なし
  良い例: 「再来一杯(zài lái yī bēi)」「好的，马上来(hǎo de, mǎshàng lái)」
  悪い例: 「再来一杯」だけでピンインを省略する
  これは入れ替えテンプレ・想定される相手の返答・類似/関連フレーズなど、すべての見出しに適用する
- 単語分解で個々の漢字や語を示すときも、後ろに(ピンイン)を必ず付ける

必ず以下の JSON 形式のみを返答してください。前後の文章や Markdown コードブロックは禁止。

{
  "direction": "ja-to-zh",
  "japanese": "ユーザー入力の日本語",
  "chinese": "中国語（簡体字）",
  "pinyin": "ピンイン（声調記号付き）",
  "explanation": "日本語の短い解説"
}`;

const ZH_TO_JA_PROMPT = `あなたは、中国語圏で実生活・ライブポーカー・カジノ・旅行・仕事の会話に困っている日本人を助ける実践的な中国語コーチです。

ユーザーは、聞き取った中国語や見かけた中国語の意味を確認し、それを後で見返せる形で保存しようとしています。

ルール:
- 入力された中国語を自然な日本語に訳す
- 中国語は簡体字で整える。繁体字や誤字があれば自然な普通話として補正してよい
- ピンインは声調記号付き
- explanation は必ず日本語
- explanation には以下の見出しを含める
  ## 意味
  ## ニュアンスと使われる場面
  ## 返答するときの例
  ## 発音のコツ・注意点
  ## 類似・関連フレーズ
- explanation の中で中国語（簡体字）を書いた場合は、必ず直後に半角括弧で声調記号付きピンインを添えること

必ず以下の JSON 形式のみを返答してください。前後の文章や Markdown コードブロックは禁止。

{
  "direction": "zh-to-ja",
  "japanese": "自然な日本語訳",
  "chinese": "入力中国語を自然に整えたもの",
  "pinyin": "ピンイン（声調記号付き）",
  "explanation": "日本語の短い解説"
}`;

function extractJson(text: string): GeneratedPhrase {
  const trimmed = text.trim();
  const jsonStart = trimmed.indexOf("{");
  const jsonEnd = trimmed.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd < 0) {
    throw new Error("Gemini からの応答に JSON が見つかりません");
  }
  const slice = trimmed.slice(jsonStart, jsonEnd + 1);
  const parsed = JSON.parse(slice) as Partial<GeneratedPhrase>;
  if (!parsed.chinese || !parsed.pinyin) {
    throw new Error("生成結果に必須フィールドが含まれていません");
  }
  return {
    direction: parsed.direction === "zh-to-ja" ? "zh-to-ja" : "ja-to-zh",
    japanese: parsed.japanese ?? "",
    chinese: parsed.chinese,
    pinyin: parsed.pinyin,
    explanation: parsed.explanation ?? "",
  };
}

export async function POST(req: Request) {
  try {
    const accessToken = getBearerToken(req);
    const body = (await req.json()) as {
      direction?: PhraseDirection;
      text?: string;
      japanese?: string;
      ownerKey?: string;
      nickname?: string;
      phraseId?: string;
      categoryId?: string | null;
      shouldDrill?: boolean;
      source?: PhraseSource;
    };
    const direction: PhraseDirection =
      body.direction === "zh-to-ja" ? "zh-to-ja" : "ja-to-zh";
    const inputText = (body.text ?? body.japanese ?? "").trim();
    if (!inputText) {
      return NextResponse.json(
        { error: direction === "zh-to-ja" ? "中国語フレーズが空です" : "日本語フレーズが空です" },
        { status: 400 },
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY が設定されていません" },
        { status: 500 },
      );
    }

    const ai = new GoogleGenAI({ apiKey });
    const prompt = direction === "zh-to-ja" ? ZH_TO_JA_PROMPT : SYSTEM_PROMPT;

    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: `${prompt}\n\n入力:\n「${inputText}」`,
      config: {
        responseMimeType: "application/json",
      },
    });

    const text = response.text;
    if (!text) {
      return NextResponse.json(
        { error: "Gemini から空の応答が返りました" },
        { status: 500 },
      );
    }

    const generated = extractJson(text);
    generated.direction = direction;
    if (!generated.japanese) generated.japanese = direction === "ja-to-zh" ? inputText : "";
    if (!generated.chinese && direction === "zh-to-ja") generated.chinese = inputText;

    after(async () => {
      try {
        const phrase = {
          id: body.phraseId?.trim() || createId(),
          japanese: generated.japanese,
          chinese: generated.chinese,
          pinyin: generated.pinyin,
          explanation: generated.explanation,
          audioUrl: null,
          direction,
          categoryId: body.categoryId ?? null,
          shouldDrill: body.shouldDrill ?? direction === "ja-to-zh",
          source: body.source === "conversation" ? "conversation" as const : "manual" as const,
          usedAt: body.source === "conversation" ? new Date().toISOString() : null,
        };
        if (accessToken) {
          await createSupabasePhrase(accessToken, phrase);
        }
        await createPhrase({
          phraseId: body.phraseId?.trim(),
          japanese: generated.japanese,
          chinese: generated.chinese,
          pinyin: generated.pinyin,
          explanation: generated.explanation,
          ownerKey: body.ownerKey?.trim(),
          nickname: body.nickname?.trim(),
          direction,
          categoryId: body.categoryId ?? null,
          shouldDrill: body.shouldDrill ?? direction === "ja-to-zh",
          source: body.source === "conversation" ? "conversation" : "manual",
        });
      } catch (saveError) {
        console.error("[/api/phrase/add] Notion save error", saveError);
      }
    });

    return NextResponse.json({
      id: null,
      ...generated,
      audioUrl: null,
    });
  } catch (error) {
    console.error("[/api/phrase/add] error", error);
    const message =
      error instanceof Error ? error.message : "サーバーエラーが発生しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
