import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Phrase, SrsItem } from "../../lib/types";
import {
  defaultDrillItemRow,
  phraseToLegacyPhraseRow,
  phraseToSavedPhraseRow,
  rowToPhrase,
  rowToSrsItem,
  srsItemToDrillItemRow,
  srsItemToLegacySrsRow,
  type DrillItemRow,
  type LegacyPhraseRow,
  type LegacySrsRow,
  type SavedPhraseRow,
} from "./supabase-phrase-mapper";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function isSupabaseConfigured(): boolean {
  return Boolean(url && anonKey);
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
    .upsert(phraseToLegacyPhraseRow(userData.user.id, input));
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
    phrases: ((phraseRows ?? []) as LegacyPhraseRow[]).map((row) =>
      rowToPhrase(row),
    ),
    srsItems: ((srsRows ?? []) as LegacySrsRow[]).map(rowToSrsItem),
  };
}

export async function upsertSupabaseSrsItem(
  accessToken: string,
  phrase: Phrase,
  srsItem: SrsItem,
): Promise<boolean> {
  if (!isSupabasePersistableSchedule(phrase, srsItem)) return false;

  const supabase = getServerSupabase(accessToken);
  if (!supabase) return false;

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return false;

  await upsertSupabaseSavedPhraseRow(supabase, userData.user.id, phrase);
  await upsertSupabaseDrillItemRow(supabase, userData.user.id, phrase.id, srsItem);

  const { error } = await supabase
    .from("srs_items")
    .upsert(srsItemToLegacySrsRow(userData.user.id, srsItem));
  if (error) throw error;

  const { error: phraseError } = await supabase
    .from("phrases")
    .update({ should_drill: true })
    .eq("id", phrase.id)
    .eq("user_id", userData.user.id);
  if (phraseError) throw phraseError;

  return true;
}

export function isSupabasePersistableSchedule(
  phrase: Pick<Phrase, "id">,
  srsItem: Pick<SrsItem, "id">,
): boolean {
  return isPostgresUuid(phrase.id) && isPostgresUuid(srsItem.id);
}

function isPostgresUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

async function upsertSupabaseSavedPhraseRow(
  supabase: SupabaseClient,
  userId: string,
  input: Omit<Phrase, "createdAt"> & { createdAt?: string },
): Promise<void> {
  const { error } = await supabase
    .from("saved_phrases")
    .upsert(phraseToSavedPhraseRow(userId, input));

  if (error && !isMissingRelationError(error)) throw error;
}

async function insertSupabaseDefaultDrillItemRow(
  supabase: SupabaseClient,
  userId: string,
  phraseId: string,
): Promise<void> {
  const { error } = await supabase
    .from("drill_items")
    .upsert(defaultDrillItemRow(userId, phraseId), {
      onConflict: "saved_phrase_id",
      ignoreDuplicates: true,
    });

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
    .upsert(srsItemToDrillItemRow(userId, phraseId, srsItem));

  if (error && !isMissingRelationError(error)) throw error;
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
