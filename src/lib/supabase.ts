import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Phrase, PhraseDirection, PhraseSource, Score, SrsItem, SrsStatus } from "./types";

type PhraseRow = {
  id: string;
  japanese: string;
  chinese: string;
  pinyin: string;
  explanation: string;
  audio_url: string | null;
  direction: PhraseDirection;
  category_id: string | null;
  should_drill: boolean;
  source: PhraseSource;
  used_at: string | null;
  created_at: string;
};

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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function isSupabaseConfigured(): boolean {
  return Boolean(url && anonKey);
}

export function getBrowserSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  return createClient(url!, anonKey!);
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

  const { error } = await supabase.from("phrases").upsert({
    id: input.id,
    user_id: userData.user.id,
    japanese: input.japanese,
    chinese: input.chinese,
    pinyin: input.pinyin,
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
  const supabase = getServerSupabase(accessToken);
  if (!supabase) return false;

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return false;

  const { data, error } = await supabase
    .from("phrases")
    .update({ explanation })
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
    phrases: ((phraseRows ?? []) as PhraseRow[]).map(rowToPhrase),
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
  return true;
}

function rowToPhrase(row: PhraseRow): Phrase {
  return {
    id: row.id,
    japanese: row.japanese,
    chinese: row.chinese,
    pinyin: row.pinyin,
    explanation: row.explanation,
    audioUrl: row.audio_url,
    createdAt: row.created_at,
    direction: row.direction,
    categoryId: row.category_id,
    shouldDrill: row.should_drill,
    source: row.source,
    usedAt: row.used_at,
  };
}

function rowToSrsItem(row: SrsRow): SrsItem {
  return {
    id: row.phrase_id,
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
