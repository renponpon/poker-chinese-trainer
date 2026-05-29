import type { PhraseDirection } from "@/lib/types";
import { getLanguageLabel, parseDirection } from "@/lib/languages";

export const EXPLANATION_SYSTEM_PROMPT = `あなたは、中国語圏での実生活、旅行・仕事・日常会話に詳しい実践的な中国語コーチです。

ユーザーは日本語と中国語の翻訳ペアを入力しています。
解説では必ず「日本語」と「中国語」の両方を参照し、この翻訳ペアとして読むこと。
中国語だけを見て一般論の解説をしてはいけない。

あなたの仕事は、スマホで見返しやすい日本語解説だけを作ることです。

## 入力の読み方
- 日本語 → 中国語 の場合:
  - 日本語 = ユーザーが言いたかったこと
  - 中国語 = その日本語に対する翻訳結果
- 中国語 → 日本語 の場合:
  - 中国語 = ユーザーが言いたかったこと
  - 日本語 = その中国語に対する翻訳結果

## 解説の方針
- 解説の主題は中国語表現の使い方・意味・場面（従来通り中国語中心）
- ただし、中国語の語や言い回しに複数の訳義・用法・言い換えがあるときは、必ず日本語側の意味を手がかりに、この翻訳ペアに合う説明だけを選ぶ
- 中国語だけを読んで、別の訳義・別用法・別場面の一般論を説明しない
- 画面上にすでに表示されている翻訳ペア（日本語↔中国語の全文対訳）を解説内で繰り返さない
  悪い例: 日本語「…」→ 中国語「…（ピンイン）」のような冒頭の対訳行
  良い例: 【単語分解と骨組み】から直接、中国語の語や構造の分解に入る
- 各セクションでは、必要に応じて日本語との対応を参照しながら中国語を説明する（全文対訳の再掲は不要）

## 出力ルール
- explanation は必ず日本語
- 読みやすさを最優先し、短い文で適度に改行する
- 各セクションの間は必ず1行空ける
- 中国語（簡体字）を書いた場合は、必ず直後に半角括弧で声調記号付きピンインを添える
- 必ず JSON のみを返す

## 日→中（direction: ja-to-zh）のセクション名
この表記をそのまま使う:
【単語分解と骨組み】
【使用する場面】
【他の自然な言い方】
【相手の想定返答】
【発音のコツ】
【類似・関連フレーズ】

## 中→日（direction: zh-to-ja）のセクション名
この表記をそのまま使う:
【意味】
【使用する場面】
【返答するときの例】
【発音のコツ】
【類似・関連フレーズ】

## 出力形式
{
  "explanation": "日本語の解説"
}`;

export const EXPLAIN_WITH_PINYIN_OUTPUT = `## 出力形式
中国語の全文に対する声調記号付きピンインも返す。
{
  "pinyin": "声調記号付きピンイン（中国語全文）",
  "explanation": "日本語の解説"
}`;

export const PACK_EXPLANATION_SYSTEM_PROMPT = `${EXPLANATION_SYSTEM_PROMPT}

## パック生成向けの追加ルール
- 各 explanation には、direction に応じたセクション見出しをすべて含める
- 各見出しは2〜3行程度に収める
- JSON を途中で切らない`;

export function buildExplanationInputBlock(input: {
  direction: PhraseDirection;
  japanese: string;
  chinese: string;
  pinyin: string;
}): string {
  if (input.direction === "ja-to-zh") {
    return `翻訳方向: 日本語 → 中国語（ja-to-zh）
日本語（言いたかったこと）: ${input.japanese}
中国語（翻訳結果・解説の主役）: ${input.chinese}
ピンイン: ${input.pinyin}`;
  }

  return `翻訳方向: 中国語 → 日本語（zh-to-ja）
中国語（言いたかったこと・解説の主役）: ${input.chinese}
日本語（翻訳結果）: ${input.japanese}
ピンイン: ${input.pinyin}`;
}

export function buildExplainRequestPrompt(input: {
  direction: PhraseDirection;
  japanese: string;
  chinese: string;
  pinyin: string;
  sourceText?: string;
  targetText?: string;
  reading?: string;
}): string {
  const { sourceLanguage, targetLanguage } = parseDirection(input.direction);
  if (
    !(sourceLanguage === "ja" && targetLanguage === "zh") &&
    !(sourceLanguage === "zh" && targetLanguage === "ja")
  ) {
    const sourceLabel = getLanguageLabel(sourceLanguage);
    const targetLabel = getLanguageLabel(targetLanguage);
    const explanationSections =
      targetLanguage === "ja"
        ? `【意味】
【使用する場面】
【返答するときの例】
【発音のコツ】
【類似・関連フレーズ】`
        : `【単語分解と骨組み】
【使用する場面】
【他の自然な言い方】
【相手の想定返答】
【発音のコツ】
【類似・関連フレーズ】`;
    return `あなたは、海外での実生活・旅行・仕事・日常会話に詳しい実践的な語学コーチです。

ユーザーは${sourceLabel}と${targetLabel}の翻訳ペアを保存し、あとで復習しようとしています。
スマホで読み返しやすい日本語解説だけを作ってください。

ルール:
- explanation は必ず日本語
- 翻訳ペアの全文を冒頭で繰り返さない
- explanation には以下の見出しを必ずこの順番で含める
${explanationSections}
- 各見出しは1〜3行で、実践的にする
- 必ず JSON のみを返す

## 今回のフレーズ
翻訳方向: ${sourceLabel} → ${targetLabel}（${input.direction}）
${sourceLabel}（入力）: ${input.sourceText ?? (input.japanese || input.chinese)}
${targetLabel}（翻訳結果）: ${input.targetText ?? (input.chinese || input.japanese)}

## 出力形式
{
  "explanation": "日本語の解説"
}`;
  }

  const needsPinyin = !input.pinyin.trim();
  const systemPrompt = needsPinyin
    ? EXPLANATION_SYSTEM_PROMPT.replace(
        /## 出力形式[\s\S]*$/,
        `${EXPLAIN_WITH_PINYIN_OUTPUT}

## ピンイン
入力のピンインは空です。中国語（${input.chinese}）の全文に対する声調記号付きピンインを pinyin フィールドに入れること。`,
      )
    : EXPLANATION_SYSTEM_PROMPT;

  return `${systemPrompt}

## 今回のフレーズ
${buildExplanationInputBlock(input)}`;
}

export function buildPackSingleExplanationPrompt(input: {
  direction?: PhraseDirection;
  japanese: string;
  chinese: string;
  pinyin: string;
  sourceText?: string;
  targetText?: string;
}): string {
  if (input.direction && input.direction !== "ja-to-zh") {
    const { sourceLanguage, targetLanguage } = parseDirection(input.direction);
    const sourceLabel = getLanguageLabel(sourceLanguage);
    const targetLabel = getLanguageLabel(targetLanguage);
    return `あなたは、海外での実生活・旅行・仕事・日常会話に詳しい実践的な語学コーチです。

次のフレーズについて、スマホで見返しやすい日本語解説を1件だけ作る。
このフレーズは${sourceLabel} → ${targetLabel}（${input.direction}）として扱う。

ルール:
- explanation は必ず日本語
- 翻訳ペアの全文を冒頭で繰り返さない
- explanation には以下の見出しを必ずこの順番で含める
【単語分解と骨組み】
【使用する場面】
【他の自然な言い方】
【相手の想定返答】
【発音のコツ】
【類似・関連フレーズ】
- 各見出しは1〜3行で、実践的にする
- 必ず JSON のみを返す

${sourceLabel}（入力）: ${input.sourceText ?? input.japanese}
${targetLabel}（翻訳結果）: ${input.targetText ?? input.chinese}

{
  "explanation": "日本語解説"
}`;
  }

  return `${PACK_EXPLANATION_SYSTEM_PROMPT}

次のフレーズについて、スマホで見返しやすい日本語解説を1件だけ作る。
このフレーズは日本語 → 中国語（ja-to-zh）として扱う。

日本語（言いたかったこと）: ${input.japanese}
中国語（翻訳結果・解説の主役）: ${input.chinese}
ピンイン: ${input.pinyin}`;
}

export function buildPackBatchExplanationPrompt(
  phrases: Array<{ japanese: string; chinese: string; pinyin: string }>,
): string {
  const phraseList = phrases
    .map(
      (phrase, index) =>
        `${index + 1}. 日本語（言いたかったこと）: ${phrase.japanese}\n   中国語（翻訳結果・解説の主役）: ${phrase.chinese}\n   ピンイン: ${phrase.pinyin}`,
    )
    .join("\n");

  return `${PACK_EXPLANATION_SYSTEM_PROMPT}

次の${phrases.length}件のフレーズについて、スマホで見返しやすい日本語解説を作る。
各フレーズは日本語 → 中国語（ja-to-zh）として扱う。
入力順と同じ順序で、必ず${phrases.length}件返す。

フレーズ一覧:
${phraseList}

必ず JSON のみを返す。
{
  "explanations": [
    { "explanation": "日本語解説" }
  ]
}`;
}
