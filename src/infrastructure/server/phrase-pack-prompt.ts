import { buildDirection, getLanguageLabel } from "@/lib/languages";
import {
  getPhrasePackLevelLabel,
  getPhrasePackSceneLabel,
  getPhrasePackToneLabel,
  getSceneCategoryHint,
} from "@/lib/personal-phrase-pack";
import type { LanguageCode, PhrasePackProfile } from "@/lib/types";

export function buildPhrasePackPrompt(
  profile: PhrasePackProfile,
  seenTargets: string[],
  targetLanguage: LanguageCode,
  attempt: number,
  targetCount: number,
): string {
  const isAutoScene = profile.scenes.includes("auto");
  const sceneLabels = profile.scenes.map(getPhrasePackSceneLabel);
  const categoryHints = isAutoScene
    ? "お任せ: 食事・買い物・移動・ホテル・日常会話など、汎用的で使いやすい表現をバランスよく"
    : profile.scenes.map((scene) => getSceneCategoryHint(scene)).join("\n- ");
  const levelGuide = getLevelGuide(profile.level);
  const retryNote =
    attempt > 1
      ? `\n重要: 前回は件数不足でした。不足分を含めて必ず phrases 配列に${targetCount}件入れてください。`
      : "";
  const targetLabel = getLanguageLabel(targetLanguage);
  const direction = buildDirection("ja", targetLanguage);
  const isChineseTarget = targetLanguage === "zh";
  const readingRule = isChineseTarget
    ? "- 中国語は簡体字、pinyin は声調記号付き"
    : `- ${targetLabel}は自然で実際に口に出せる表現にする。pinyin は空文字 "" にする`;
  const outputFields = isChineseTarget
    ? `"chinese": "中国語（簡体字）",
      "pinyin": "ピンイン（声調記号付き）",`
    : `"targetText": "${targetLabel}の翻訳結果",
      "chinese": "${targetLabel}の翻訳結果（互換用に同じ値）",
      "pinyin": "",`;

  return `あなたは、海外の実生活・旅行・仕事・ライブポーカーの現場で使う表現に詳しい実践的な語学コーチです。

目的:
日本人ユーザーが近い将来そのまま口に出せる、${targetLabel}フレーズ${targetCount}件を作る。
一般教材ではなく、ユーザー回答に合う具体的なパックにする。
瞬間作文・口頭練習用なので、中級・上級でも長すぎる文は禁止。
市販の瞬間英作文に出てくる例文程度の長さに収める。
explanation はこの段階では不要。フレーズ本体だけ返す。
${retryNote}

ユーザー回答:
- 使う場面: ${sceneLabels.join("、")}
- ${targetLabel}レベル: ${getPhrasePackLevelLabel(profile.level)}（${levelGuide}）
- 言い方の希望: ${getPhrasePackToneLabel(profile.tone)}
- 具体状況: ${profile.details || "未入力"}

カテゴリ対応:
- ${categoryHints}

既にユーザーが持つ${targetLabel}表現（重複して出さない）:
${seenTargets.length ? seenTargets.map((item) => `- ${item}`).join("\n") : "- なし"}

生成ルール:
- 必ず${targetCount}件作る
- direction は全件 "${direction}"
${readingRule}
- 日本語は自然な日本語で、ユーザーが言いたい内容にする
- フレーズは原則として日本人ユーザー本人が相手に言う表現にする。相手側のセリフは混ぜない
- 原則1文。必要な場合のみ短い2文まで。長い説明、複雑な従属節、複数条件を詰め込んだ文は避ける
- ${targetLabel}はユーザーのレベルに合わせる。ただしレベル差は文の長さではなく、語彙・熟語・自然さ・丁寧さ・場面への合い方で出す
- 言い方の希望を優先する。短く通じる/自然/丁寧/詳しく説明/おまかせを反映する
- 多くは、日常で使う可能性が高い便利フレーズにする。ただし選択された場面・具体状況から大きく外れない
- 具体状況が入力されている場合は、その状況で直接使えるフレーズと、その周辺で起こりやすい高頻度フレーズを混ぜる
- ${targetCount}件の意味を被らせない。言い換えだけで数を増やさない
- 場面が複数ある場合は、選ばれた場面にバランスよく配分する
- categoryId は上のカテゴリ対応から選ぶ。迷う場合は "other"
- 過度に乱暴・失礼・性的・差別的・政治的な表現は禁止
- JSONを途中で切らない。phrases 配列は必ず ${targetCount} 件完結させる

必ずJSONのみを返す。Markdownコードブロックは禁止。
{
  "phrases": [
    {
      "direction": "${direction}",
      "japanese": "日本語",
      ${outputFields}
      "categoryId": "restaurant"
    }
  ]
}`;
}

function getLevelGuide(level: PhrasePackProfile["level"]): string {
  switch (level) {
    case "entry":
      return "単語や定型句中心";
    case "basic":
      return "日常で使う基本文。覚えやすく口に出しやすい長さ";
    case "intermediate":
      return "自然な言い回しや便利な熟語を含めてよい。ただし文は短く保つ";
    case "advanced":
      return "より自然・丁寧・場面に合う表現。語彙は少し高度でもよいが長文は禁止";
    default:
      return "日常で使う基本文。覚えやすく口に出しやすい長さ";
  }
}
