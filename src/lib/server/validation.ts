import { createId } from "@/lib/id";
import type { PhraseDirection, PhraseSource } from "@/lib/types";

export type ValidatedPhraseAddRequest = {
  direction: PhraseDirection;
  inputText: string;
  ownerKey?: string;
  nickname?: string;
  phraseId: string;
  categoryId: string | null;
  shouldDrill: boolean;
  source: PhraseSource;
};

export class RequestValidationError extends Error {
  status = 400;
  code = "validation_error";

  constructor(message: string) {
    super(message);
    this.name = "RequestValidationError";
  }
}

const DEFAULT_MAX_INPUT_CHARS = 500;
const CONVERSATION_MAX_INPUT_CHARS = 300;
const MAX_OWNER_KEY_CHARS = 80;
const MAX_NICKNAME_CHARS = 80;
const CATEGORY_ID_PATTERN = /^[a-z0-9_-]{1,64}$/i;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RawPhraseAddRequest = {
  direction?: unknown;
  text?: unknown;
  japanese?: unknown;
  ownerKey?: unknown;
  nickname?: unknown;
  phraseId?: unknown;
  categoryId?: unknown;
  shouldDrill?: unknown;
  source?: unknown;
};

export function parseJsonObject(value: unknown): RawPhraseAddRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestValidationError("リクエスト形式が正しくありません");
  }
  return value as RawPhraseAddRequest;
}

export function validatePhraseAddRequest(
  raw: RawPhraseAddRequest,
): ValidatedPhraseAddRequest {
  const direction = normalizeDirection(raw.direction);
  const source = normalizeSource(raw.source);
  const inputText = normalizeInputText(raw, source);
  const categoryId = normalizeCategoryId(raw.categoryId);
  const phraseId = normalizePhraseId(raw.phraseId);

  return {
    direction,
    inputText,
    ownerKey: normalizeOptionalText(raw.ownerKey, MAX_OWNER_KEY_CHARS),
    nickname: normalizeOptionalText(raw.nickname, MAX_NICKNAME_CHARS),
    phraseId,
    categoryId,
    shouldDrill:
      typeof raw.shouldDrill === "boolean" ? raw.shouldDrill : direction === "ja-to-zh",
    source,
  };
}

export function getInputMaxChars(source: PhraseSource): number {
  const configured = Number.parseInt(process.env.AI_INPUT_MAX_CHARS ?? "", 10);
  const defaultLimit =
    source === "conversation" ? CONVERSATION_MAX_INPUT_CHARS : DEFAULT_MAX_INPUT_CHARS;
  return Number.isFinite(configured) && configured > 0
    ? Math.min(configured, defaultLimit)
    : defaultLimit;
}

function normalizeDirection(value: unknown): PhraseDirection {
  if (value === undefined || value === null || value === "") return "ja-to-zh";
  if (value === "ja-to-zh" || value === "zh-to-ja") return value;
  throw new RequestValidationError("翻訳方向が正しくありません");
}

function normalizeSource(value: unknown): PhraseSource {
  if (value === undefined || value === null || value === "") return "manual";
  if (value === "manual" || value === "conversation" || value === "prototype") {
    return value;
  }
  throw new RequestValidationError("保存元の指定が正しくありません");
}

function normalizeInputText(raw: RawPhraseAddRequest, source: PhraseSource): string {
  const value = typeof raw.text === "string" ? raw.text : raw.japanese;
  if (typeof value !== "string") {
    throw new RequestValidationError("入力テキストが空です");
  }

  const inputText = value.trim();
  if (!inputText) {
    throw new RequestValidationError("入力テキストが空です");
  }

  const maxChars = getInputMaxChars(source);
  if (inputText.length > maxChars) {
    throw new RequestValidationError(`入力は${maxChars}文字以内にしてください`);
  }

  return inputText;
}

function normalizeCategoryId(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new RequestValidationError("カテゴリ指定が正しくありません");
  }
  const categoryId = value.trim();
  if (!categoryId || categoryId === "uncategorized") return null;
  if (!CATEGORY_ID_PATTERN.test(categoryId)) {
    throw new RequestValidationError("カテゴリ指定が正しくありません");
  }
  return categoryId;
}

function normalizePhraseId(value: unknown): string {
  if (typeof value !== "string") return createId();
  const phraseId = value.trim();
  return UUID_PATTERN.test(phraseId) ? phraseId : createId();
}

function normalizeOptionalText(value: unknown, maxChars: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (!normalized) return undefined;
  return normalized.slice(0, maxChars);
}
