import { parseDirection } from "../../lib/languages";
import type {
  LanguageCode,
  Phrase,
  PhraseDirection,
  PhraseSource,
  ReadingType,
  Score,
  SrsItem,
  SrsStatus,
} from "../../lib/types";

export type LegacyPhraseRow = {
  id: string;
  user_id?: string;
  japanese: string;
  chinese: string;
  pinyin: string;
  source_language?: LanguageCode | null;
  target_language?: LanguageCode | null;
  source_text?: string | null;
  target_text?: string | null;
  reading?: string | null;
  reading_type?: ReadingType | null;
  explanation: string;
  audio_url: string | null;
  direction: PhraseDirection;
  category_id: string | null;
  should_drill: boolean;
  source: PhraseSource;
  used_at: string | null;
  created_at: string;
};

export type SavedPhraseRow = Omit<LegacyPhraseRow, "should_drill">;

export type LegacySrsRow = {
  phrase_id: string;
  user_id?: string;
  status: SrsStatus;
  next_review_at: string | null;
  interval_days: number;
  ease_factor: number;
  consecutive_good: number;
  last_score: Score | null;
  last_reviewed_at: string | null;
};

export type DrillItemRow = Omit<LegacySrsRow, "phrase_id"> & {
  saved_phrase_id: string;
};

export type SavedPhraseUpsertRow = Omit<SavedPhraseRow, "created_at"> & {
  user_id: string;
  created_at?: string;
};

export type LegacyPhraseUpsertRow = Omit<LegacyPhraseRow, "created_at"> & {
  user_id: string;
  created_at?: string;
};

type PhraseWithOptionalCreatedAt = Omit<Phrase, "createdAt"> & {
  createdAt?: string;
};

export function phraseToSavedPhraseRow(
  userId: string,
  phrase: PhraseWithOptionalCreatedAt,
): SavedPhraseUpsertRow {
  return {
    id: phrase.id,
    user_id: userId,
    japanese: phrase.japanese,
    chinese: phrase.chinese,
    pinyin: phrase.pinyin,
    source_language: phrase.sourceLanguage,
    target_language: phrase.targetLanguage,
    source_text: phrase.sourceText,
    target_text: phrase.targetText,
    reading: phrase.reading,
    reading_type: phrase.readingType,
    explanation: phrase.explanation,
    audio_url: phrase.audioUrl,
    direction: phrase.direction,
    category_id: phrase.categoryId,
    source: phrase.source,
    used_at: phrase.usedAt,
    created_at: phrase.createdAt,
  };
}

export function phraseToLegacyPhraseRow(
  userId: string,
  phrase: PhraseWithOptionalCreatedAt,
): LegacyPhraseUpsertRow {
  return {
    ...phraseToSavedPhraseRow(userId, phrase),
    should_drill: phrase.shouldDrill,
  };
}

export function srsItemToLegacySrsRow(
  userId: string,
  srsItem: SrsItem,
): LegacySrsRow & { user_id: string } {
  return {
    phrase_id: srsItem.id,
    user_id: userId,
    status: srsItem.status,
    next_review_at: timestampToIsoOrNull(srsItem.nextReviewAt),
    interval_days: srsItem.intervalDays,
    ease_factor: srsItem.easeFactor,
    consecutive_good: srsItem.consecutiveGood,
    last_score: srsItem.lastScore,
    last_reviewed_at: timestampToIsoOrNull(srsItem.lastReviewedAt),
  };
}

export function srsItemToDrillItemRow(
  userId: string,
  phraseId: string,
  srsItem: SrsItem,
): DrillItemRow & { user_id: string } {
  return {
    saved_phrase_id: phraseId,
    user_id: userId,
    status: srsItem.status,
    next_review_at: timestampToIsoOrNull(srsItem.nextReviewAt),
    interval_days: srsItem.intervalDays,
    ease_factor: srsItem.easeFactor,
    consecutive_good: srsItem.consecutiveGood,
    last_score: srsItem.lastScore,
    last_reviewed_at: timestampToIsoOrNull(srsItem.lastReviewedAt),
  };
}

export function defaultDrillItemRow(
  userId: string,
  phraseId: string,
): DrillItemRow & { user_id: string } {
  return {
    saved_phrase_id: phraseId,
    user_id: userId,
    status: "new",
    next_review_at: null,
    interval_days: 0,
    ease_factor: 2.5,
    consecutive_good: 0,
    last_score: null,
    last_reviewed_at: null,
  };
}

export function rowToPhrase(
  row: LegacyPhraseRow | SavedPhraseRow,
  shouldDrill = "should_drill" in row ? row.should_drill : false,
): Phrase {
  const { sourceLanguage, targetLanguage } = parseDirection(row.direction);
  return {
    id: row.id,
    japanese: row.japanese,
    chinese: row.chinese,
    pinyin: row.pinyin,
    sourceLanguage: row.source_language ?? sourceLanguage,
    targetLanguage: row.target_language ?? targetLanguage,
    sourceText:
      row.source_text ??
      (sourceLanguage === "ja" ? row.japanese : row.chinese),
    targetText:
      row.target_text ??
      (targetLanguage === "ja" ? row.japanese : row.chinese),
    reading: row.reading ?? row.pinyin,
    readingType:
      row.reading_type ??
      (sourceLanguage === "zh" || targetLanguage === "zh" ? "pinyin" : "none"),
    explanation: row.explanation,
    audioUrl: row.audio_url,
    createdAt: row.created_at,
    direction: row.direction,
    categoryId: row.category_id,
    shouldDrill,
    source: row.source,
    usedAt: row.used_at,
  };
}

export function rowToSrsItem(row: LegacySrsRow | DrillItemRow): SrsItem {
  return {
    id: "phrase_id" in row ? row.phrase_id : row.saved_phrase_id,
    status: row.status,
    nextReviewAt: row.next_review_at ? new Date(row.next_review_at).getTime() : 0,
    intervalDays: row.interval_days,
    easeFactor: row.ease_factor,
    consecutiveGood: row.consecutive_good,
    lastScore: row.last_score,
    lastReviewedAt: row.last_reviewed_at
      ? new Date(row.last_reviewed_at).getTime()
      : null,
  };
}

function timestampToIsoOrNull(value: number | null): string | null {
  return value ? new Date(value).toISOString() : null;
}
