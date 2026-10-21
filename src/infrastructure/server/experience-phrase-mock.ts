import { buildDirection, buildGeneratedPhrase } from "../../lib/languages";
import { toMandarinPinyin } from "../../lib/chinese-pinyin";
import { EXPERIENCE_MOCK_EXAMPLES, validateExperiencePhraseOutput, type ExperiencePhraseRequest, type ExperiencePhraseResponse } from "../../lib/experience-phrase";

const fixtures = [
  { input: EXPERIENCE_MOCK_EXAMPLES[0].text, sourceText: "別のサイズに交換できますか？", en: "Could I exchange this for a different size?", zh: "可以换个尺码吗？" },
  { input: EXPERIENCE_MOCK_EXAMPLES[1].text, sourceText: "もう少しゆっくり話していただけますか？", en: "Could you speak a little more slowly?", zh: "可以说慢一点吗？" },
  { input: EXPERIENCE_MOCK_EXAMPLES[2].text, sourceText: "まだ返金を受け取っていません。状況を確認していただけますか？", en: "I haven't received the refund yet. Could you check its status?", zh: "我还没收到退款，可以帮我查一下进度吗？" },
];

export function isExperienceMockEnabled(environment: { NODE_ENV?: string; PHRABIT_EXPERIENCE_MOCK?: string }): boolean {
  return environment.NODE_ENV === "development" && environment.PHRABIT_EXPERIENCE_MOCK === "1";
}

export class ExperienceMockUnavailableError extends Error {
  readonly status = 422;
  constructor() {
    super("模擬応答は画面内の3つの例と「もっと丁寧に」「小さいサイズに」の調整でお試しください。");
    this.name = "ExperienceMockUnavailableError";
  }
}

export function createExperienceMockResponse(request: ExperiencePhraseRequest): ExperiencePhraseResponse {
  if (["今日は店で困った", "今日は店で困った。", "旅行しました", "旅行しました。"].includes(request.experienceText)) return { status: "insufficient_context", mock: true };
  const fixture = fixtures.find((item) => item.input === request.experienceText);
  if (!fixture) throw new ExperienceMockUnavailableError();
  let sourceText = fixture.sourceText;
  let targetText = fixture[request.targetLanguage];
  if (request.nuance) {
    if (fixture === fixtures[0] && (request.nuance.includes("丁寧") || request.nuance.includes("小さいサイズ"))) {
      const smaller = request.nuance.includes("小さいサイズ") || Boolean(request.previousPhrase?.sourceText.includes("小さいサイズ"));
      const polite = request.nuance.includes("丁寧") || Boolean(request.previousPhrase?.sourceText.includes("恐れ入りますが"));
      sourceText = polite ? `恐れ入りますが、${smaller ? "小さい" : "別の"}サイズに交換していただけますか？` : `${smaller ? "小さい" : "別の"}サイズに交換できますか？`;
      targetText = request.targetLanguage === "en"
        ? polite ? `Would it be possible to exchange this for a ${smaller ? "smaller" : "different"} size, please?` : `Could I exchange this for a ${smaller ? "smaller" : "different"} size?`
        : polite ? `不好意思，可以帮我${smaller ? "换小一码" : "换个尺码"}吗？` : `可以${smaller ? "换小一码" : "换个尺码"}吗？`;
    } else if (request.nuance.includes("丁寧")) {
      if (fixture === fixtures[1]) {
        sourceText = "恐れ入りますが、もう少しゆっくりお話しいただけますか？";
        targetText = request.targetLanguage === "en" ? "Would you mind speaking a little more slowly, please?" : "不好意思，您可以说慢一点吗？";
      } else {
        sourceText = "まだ返金を受け取っておりません。恐れ入りますが、状況をご確認いただけますか？";
        targetText = request.targetLanguage === "en" ? "I haven't received the refund yet. Would you mind checking its status, please?" : "我还没收到退款，麻烦您帮我查一下进度，可以吗？";
      }
    } else throw new ExperienceMockUnavailableError();
  }
  const output = validateExperiencePhraseOutput({ status: "ready", sourceText, targetText });
  return {
    status: "ready", mock: true,
    phrase: buildGeneratedPhrase({ direction: buildDirection("ja", request.targetLanguage), sourceText: output.sourceText, targetText: output.targetText, reading: request.targetLanguage === "zh" ? toMandarinPinyin(output.targetText) : "", explanation: "" }),
  };
}
