import type { GeneratedPhrase } from "./types";

export type TranslationInputKind = "translation" | "experience";
export type ExperienceTargetLanguage = "en" | "zh";
export type ExperiencePhraseRequest = {
  experienceText: string;
  targetLanguage: ExperienceTargetLanguage;
  nuance: string;
  previousPhrase: { sourceText: string; targetText: string } | null;
};
export type ExperiencePhraseResponse =
  | { status: "ready"; phrase: GeneratedPhrase; mock: boolean }
  | { status: "insufficient_context"; mock: boolean };

export const EXPERIENCE_INPUT_MAX_CHARS = 500;
export const EXPERIENCE_CONTEXT_HINT = "言いたかったことを一言足すと、表現を作れます。例：別のサイズに交換したかった";
export const EXPERIENCE_MOCK_EXAMPLES = [
  { label: "サイズ交換", text: "服を買ったけどサイズが合わなくて、別のサイズに交換したかった。" },
  { label: "電話が早口", text: "電話で相手が早口で、もう少しゆっくり話してほしかった。" },
  { label: "返金の確認", text: "まだ返金が届かなくて、相手を責めずに状況を確認したい。" },
] as const;

export class ExperiencePhraseValidationError extends Error {
  readonly status = 400;
  constructor(message = "出来事の入力を確認してください。") {
    super(message);
    this.name = "ExperiencePhraseValidationError";
  }
}

function readObject(value: unknown, fields: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).some((key) => !fields.includes(key))) throw new ExperiencePhraseValidationError();
  return value as Record<string, unknown>;
}

function readText(value: unknown, maximum: number): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maximum) throw new ExperiencePhraseValidationError();
  return value.trim();
}

export function validateExperiencePhraseRequest(value: unknown): ExperiencePhraseRequest {
  const raw = readObject(value, ["experienceText", "targetLanguage", "nuance", "previousPhrase"]);
  if (raw.targetLanguage !== "en" && raw.targetLanguage !== "zh") throw new ExperiencePhraseValidationError("英語または中国語を選んでください。");
  const experienceText = readText(raw.experienceText, EXPERIENCE_INPUT_MAX_CHARS);
  const nuance = raw.nuance === undefined || raw.nuance === "" ? "" : readText(raw.nuance, 300);
  let previousPhrase: ExperiencePhraseRequest["previousPhrase"] = null;
  if (raw.previousPhrase !== undefined && raw.previousPhrase !== null) {
    const previous = readObject(raw.previousPhrase, ["sourceText", "targetText"]);
    previousPhrase = { sourceText: readText(previous.sourceText, 160), targetText: readText(previous.targetText, 500) };
  }
  if (Boolean(nuance) !== Boolean(previousPhrase)) throw new ExperiencePhraseValidationError("調整する一言と補足を確認してください。");
  return { experienceText, targetLanguage: raw.targetLanguage, nuance, previousPhrase };
}

export function validateExperiencePhraseOutput(value: unknown): { status: "ready" | "insufficient_context"; sourceText: string; targetText: string } {
  const raw = readObject(value, ["status", "sourceText", "targetText"]);
  if (raw.status === "insufficient_context" && raw.sourceText === "" && raw.targetText === "") return { status: raw.status, sourceText: "", targetText: "" };
  if (raw.status !== "ready") throw new ExperiencePhraseValidationError("一言の形式を読み取れませんでした。");
  return { status: "ready", sourceText: readText(raw.sourceText, 160), targetText: readText(raw.targetText, 500) };
}

export function readExperiencePhraseResponse(value: unknown, targetLanguage: string): ExperiencePhraseResponse {
  const raw = readObject(value, ["status", "phrase", "mock"]);
  if (typeof raw.mock !== "boolean") throw new ExperiencePhraseValidationError("一言の形式を読み取れませんでした。");
  if (raw.status === "insufficient_context" && raw.phrase === undefined) return { status: raw.status, mock: raw.mock };
  if (raw.status !== "ready" || !raw.phrase || typeof raw.phrase !== "object" || Array.isArray(raw.phrase)) throw new ExperiencePhraseValidationError("一言の形式を読み取れませんでした。");
  const phrase = raw.phrase as GeneratedPhrase;
  validateExperiencePhraseOutput({ status: "ready", sourceText: phrase.sourceText, targetText: phrase.targetText });
  if (phrase.sourceLanguage !== "ja" || phrase.targetLanguage !== targetLanguage || phrase.direction !== `ja-to-${targetLanguage}`
    || phrase.japanese !== phrase.sourceText || phrase.chinese !== phrase.targetText || typeof phrase.reading !== "string"
    || phrase.pinyin !== phrase.reading || phrase.readingType !== (targetLanguage === "zh" ? "pinyin" : "none") || typeof phrase.explanation !== "string") throw new ExperiencePhraseValidationError("一言の形式を読み取れませんでした。");
  return { status: "ready", phrase, mock: raw.mock };
}
