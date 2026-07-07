import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  LanguageCode,
  Phrase,
  PhraseDirection,
  PhraseSource,
  ReadingType,
  Score,
  SrsItem,
  SrsStatus,
} from "./types";
import { parseDirection } from "./languages";

type PhraseRow = {
  id: string;
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

type SavedPhraseRow = Omit<PhraseRow, "should_drill">;

type SrsRow = {
  phrase_id: string;
  status: SrsStatus;
  next_review_at: string | null;
  interval_days: number;
  ease_factor: number;
  consecutive_good: number;
  last_score: Score | null;
  last_reviewed_at: string | null;
};

type DrillItemRow = Omit<SrsRow, "phrase_id"> & {
  saved_phrase_id: string;
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let browserClient: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(url && anonKey);
}

export function getBrowserSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured() || typeof window === "undefined") return null;
  if (!browserClient) {
    browserClient = createClient(url!, anonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        flowType: "pkce",
      },
    });
  }
  return browserClient;
}

export function getAuthCallbackUrl(): string {
  if (typeof window !== "undefined") {
    return `${window.location.origin}/auth/callback`;
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "");
  return appUrl ? `${appUrl}/auth/callback` : "/auth/callback";
}

function getServerSupabase(accessToken?: string): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  return createClient(url!, anonKey!, {
    global: accessToken
      ? {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      : undefined,
  });
}

export function getBearerToken(req: Request): string {
  const header = req.headers.get("authorization") ?? "";
  return header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
}

export async function createSupabasePhrase(
  accessToken: string,
  input: Omit<Phrase, "createdAt"> & { createdAt?: string },
): Promise<{ id: string } | null> {
  const supabase = getServerSupabase(accessToken);
  if (!supabase) return null;

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return null;

  await upsertSupabaseSavedPhraseRow(supabase, userData.user.id, input);
  if (input.shouldDrill) {
    await insertSupabaseDefaultDrillItemRow(supabase, userData.user.id, input.id);
  }

  const { error } = await supabase
    .from("phrases")
    .upsert({
      id: input.id,
      user_id: userData.user.id,
      japanese: input.japanese,
      chinese: input.chinese,
      pinyin: input.pinyin,
      source_language: input.sourceLanguage,
      target_language: input.targetLanguage,
      source_text: input.sourceText,
      target_text: input.targetText,
      reading: input.reading,
      reading_type: input.readingType,
      explanation: input.explanation,
      audio_url: input.audioUrl,
      direction: input.direction,
      category_id: input.categoryId,
      should_drill: input.shouldDrill,
      source: input.source,
      used_at: input.usedAt,
      created_at: input.createdAt,
    });
  if (error) throw error;
  return { id: input.id };
}

export async function updateSupabasePhraseExplanation(
  accessToken: string,
  phraseId: string,
  explanation: string,
): Promise<boolean> {
  return updateSupabasePhraseFollowUp(accessToken, phraseId, { explanation });
}

export async function updateSupabasePhraseFollowUp(
  accessToken: string,
  phraseId: string,
  updates: { explanation: string; pinyin?: string },
): Promise<boolean> {
  const supabase = getServerSupabase(accessToken);
  if (!supabase) return false;

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return false;

  const payload: { explanation: string; pinyin?: string } = {
    explanation: updates.explanation,
  };
  if (updates.pinyin) {
    payload.pinyin = updates.pinyin;
  }

  const { error: savedError } = await supabase
    .from("saved_phrases")
    .update(payload)
    .eq("id", phraseId)
    .eq("user_id", userData.user.id);
  if (savedError && !isMissingRelationError(savedError)) throw savedError;

  const { data, error } = await supabase
    .from("phrases")
    .update(payload)
    .eq("id", phraseId)
    .eq("user_id", userData.user.id)
    .select("id");
  if (error) throw error;
  return Boolean(data?.length);
}

export async function getSupabasePhrasesByUser(accessToken: string): Promise<{
  phrases: Phrase[];
  srsItems: SrsItem[];
} | null> {
  const supabase = getServerSupabase(accessToken);
  if (!supabase) return null;

  const { data: savedRows, error: savedError } = await supabase
    .from("saved_phrases")
    .select("*")
    .order("created_at", { ascending: false });
  if (savedError) {
    if (!isMissingRelationError(savedError)) throw savedError;
    return getSupabasePhrasesByUserFromLegacy(supabase);
  }

  const { data: drillRows, error: drillError } = await supabase
    .from("drill_items")
    .select("*");
  if (drillError) {
    if (!isMissingRelationError(drillError)) throw drillError;
    return getSupabasePhrasesByUserFromLegacy(supabase);
  }

  if ((savedRows ?? []).length > 0) {
    const drillItems = ((drillRows ?? []) as DrillItemRow[]).map(rowToSrsItem);
    const drillItemIds = new Set(drillItems.map((item) => item.id));

    return {
      phrases: ((savedRows ?? []) as SavedPhraseRow[]).map((row) =>
        rowToPhrase(row, drillItemIds.has(row.id)),
      ),
      srsItems: drillItems,
    };
  }

  return getSupabasePhrasesByUserFromLegacy(supabase);
}

async function getSupabasePhrasesByUserFromLegacy(
  supabase: SupabaseClient,
): Promise<{
  phrases: Phrase[];
  srsItems: SrsItem[];
}> {
  const { data: phraseRows, error: phraseError } = await supabase
    .from("phrases")
    .select("*")
    .order("created_at", { ascending: false });
  if (phraseError) throw phraseError;

  const { data: srsRows, error: srsError } = await supabase
    .from("srs_items")
    .select("*");
  if (srsError) throw srsError;

  return {
    phrases: ((phraseRows ?? []) as PhraseRow[]).map((row) => rowToPhrase(row)),
    srsItems: ((srsRows ?? []) as SrsRow[]).map(rowToSrsItem),
  };
}

export async function upsertSupabaseSrsItem(
  accessToken: string,
  phrase: Phrase,
  srsItem: SrsItem,
): Promise<boolean> {
  const supabase = getServerSupabase(accessToken);
  if (!supabase) return false;

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return false;

  await upsertSupabaseSavedPhraseRow(supabase, userData.user.id, phrase);
  await upsertSupabaseDrillItemRow(supabase, userData.user.id, phrase.id, srsItem);

  const { error } = await supabase.from("srs_items").upsert({
    phrase_id: phrase.id,
    user_id: userData.user.id,
    status: srsItem.status,
    next_review_at: srsItem.nextReviewAt
      ? new Date(srsItem.nextReviewAt).toISOString()
      : null,
    interval_days: srsItem.intervalDays,
    ease_factor: srsItem.easeFactor,
    consecutive_good: srsItem.consecutiveGood,
    last_score: srsItem.lastScore,
    last_reviewed_at: srsItem.lastReviewedAt
      ? new Date(srsItem.lastReviewedAt).toISOString()
      : null,
  });
  if (error) throw error;

  const { error: phraseError } = await supabase
    .from("phrases")
    .update({ should_drill: true })
    .eq("id", phrase.id)
    .eq("user_id", userData.user.id);
  if (phraseError) throw phraseError;

  return true;
}

async function upsertSupabaseSavedPhraseRow(
  supabase: SupabaseClient,
  userId: string,
  input: Omit<Phrase, "createdAt"> & { createdAt?: string },
): Promise<void> {
  const { error } = await supabase
    .from("saved_phrases")
    .upsert({
      id: input.id,
      user_id: userId,
      japanese: input.japanese,
      chinese: input.chinese,
      pinyin: input.pinyin,
      source_language: input.sourceLanguage,
      target_language: input.targetLanguage,
      source_text: input.sourceText,
      target_text: input.targetText,
      reading: input.reading,
      reading_type: input.readingType,
      explanation: input.explanation,
      audio_url: input.audioUrl,
      direction: input.direction,
      category_id: input.categoryId,
      source: input.source,
      used_at: input.usedAt,
      created_at: input.createdAt,
    });

  if (error && !isMissingRelationError(error)) throw error;
}

async function insertSupabaseDefaultDrillItemRow(
  supabase: SupabaseClient,
  userId: string,
  phraseId: string,
): Promise<void> {
  const { error } = await supabase
    .from("drill_items")
    .upsert(
      {
        saved_phrase_id: phraseId,
        user_id: userId,
        status: "new",
        next_review_at: null,
        interval_days: 0,
        ease_factor: 2.5,
        consecutive_good: 0,
        last_score: null,
        last_reviewed_at: null,
      },
      {
        onConflict: "saved_phrase_id",
        ignoreDuplicates: true,
      },
    );

  if (error && !isMissingRelationError(error)) throw error;
}

async function upsertSupabaseDrillItemRow(
  supabase: SupabaseClient,
  userId: string,
  phraseId: string,
  srsItem: SrsItem,
): Promise<void> {
  const { error } = await supabase
    .from("drill_items")
    .upsert({
      saved_phrase_id: phraseId,
      user_id: userId,
      status: srsItem.status,
      next_review_at: srsItem.nextReviewAt
        ? new Date(srsItem.nextReviewAt).toISOString()
        : null,
      interval_days: srsItem.intervalDays,
      ease_factor: srsItem.easeFactor,
      consecutive_good: srsItem.consecutiveGood,
      last_score: srsItem.lastScore,
      last_reviewed_at: srsItem.lastReviewedAt
        ? new Date(srsItem.lastReviewedAt).toISOString()
        : null,
    });

  if (error && !isMissingRelationError(error)) throw error;
}

function rowToPhrase(
  row: PhraseRow | SavedPhraseRow,
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

function rowToSrsItem(row: SrsRow | DrillItemRow): SrsItem {
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

function isMissingRelationError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybeError = error as { code?: string; message?: string };
  const message = maybeError.message ?? "";
  return (
    maybeError.code === "42P01" ||
    maybeError.code === "PGRST205" ||
    message.includes("Could not find the table") ||
    (message.includes("relation") && message.includes("does not exist"))
  );
}
