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

export async function mergeSupabasePhraseSnapshot(
  accessToken: string,
  input: { phrases: Phrase[]; srsItems: SrsItem[] },
): Promise<{ phrases: Phrase[]; srsItems: SrsItem[] } | null> {
  const authenticated = await getAuthenticatedSupabase(accessToken);
  if (!authenticated) return null;
  const { supabase, userId } = authenticated;
  const phrases = input.phrases.filter((phrase) => isPostgresUuid(phrase.id));
  const itemById = new Map(input.srsItems.map((item) => [item.id, item]));

  if (phrases.length > 0) {
    const { error: savedError } = await supabase
      .from("saved_phrases")
      .upsert(phrases.map((phrase) => phraseToSavedPhraseRow(userId, phrase)));
    if (savedError && !isMissingRelationError(savedError)) throw savedError;

    const { error: legacyPhraseError } = await supabase
      .from("phrases")
      .upsert(phrases.map((phrase) => phraseToLegacyPhraseRow(userId, phrase)));
    if (legacyPhraseError) throw legacyPhraseError;
  }

  const scheduledPhrases = phrases.filter((phrase) => phrase.shouldDrill);
  if (scheduledPhrases.length > 0) {
    const drillRows = scheduledPhrases.map((phrase) => {
      const item = itemById.get(phrase.id);
      return item
        ? srsItemToDrillItemRow(userId, phrase.id, item)
        : defaultDrillItemRow(userId, phrase.id);
    });
    const { error: drillError } = await supabase.from("drill_items").upsert(drillRows);
    if (drillError && !isMissingRelationError(drillError)) throw drillError;

    const legacyRows = scheduledPhrases.map((phrase) => {
      const item = itemById.get(phrase.id);
      return srsItemToLegacySrsRow(
        userId,
        item ?? rowToSrsItem(defaultDrillItemRow(userId, phrase.id)),
      );
    });
    const { error: legacySrsError } = await supabase.from("srs_items").upsert(legacyRows);
    if (legacySrsError) throw legacySrsError;
  }

  return getSupabasePhrasesByUser(accessToken);
}

export async function replaceSupabasePhraseState(
  accessToken: string,
  phrase: Phrase,
  srsItem: SrsItem | null,
  existingOnly = false,
): Promise<boolean> {
  if (!isPostgresUuid(phrase.id)) return false;
  const authenticated = await getAuthenticatedSupabase(accessToken);
  if (!authenticated) return false;
  const { supabase, userId } = authenticated;

  if (existingOnly) {
    const saved = await supabase.from("saved_phrases")
      .update(phraseToSavedPhraseRow(userId, phrase))
      .eq("id", phrase.id).eq("user_id", userId).select("id");
    if (saved.error && !isMissingRelationError(saved.error)) throw saved.error;
    if (!saved.error && !saved.data?.length) {
      throw Object.assign(new Error("別端末で削除されたため更新を停止しました"), { status: 409 });
    }
    const legacy = await supabase.from("phrases")
      .update(phraseToLegacyPhraseRow(userId, phrase))
      .eq("id", phrase.id).eq("user_id", userId).select("id");
    if (legacy.error) throw legacy.error;
    if (!legacy.data?.length) {
      throw Object.assign(new Error("別端末で削除されたため更新を停止しました"), { status: 409 });
    }
  } else {
    await upsertSupabaseSavedPhraseRow(supabase, userId, phrase);
    const { error: phraseError } = await supabase.from("phrases")
      .upsert(phraseToLegacyPhraseRow(userId, phrase));
    if (phraseError) throw phraseError;
  }

  if (phrase.shouldDrill) {
    const item = srsItem ?? rowToSrsItem(defaultDrillItemRow(userId, phrase.id));
    await upsertSupabaseDrillItemRow(supabase, userId, phrase.id, item);
    const { error: srsError } = await supabase
      .from("srs_items")
      .upsert(srsItemToLegacySrsRow(userId, item));
    if (srsError) throw srsError;
  } else {
    const { error: drillError } = await supabase
      .from("drill_items")
      .delete()
      .eq("saved_phrase_id", phrase.id)
      .eq("user_id", userId);
    if (drillError && !isMissingRelationError(drillError)) throw drillError;
    const { error: srsError } = await supabase
      .from("srs_items")
      .delete()
      .eq("phrase_id", phrase.id)
      .eq("user_id", userId);
    if (srsError) throw srsError;
  }

  return true;
}

export async function deleteSupabasePhrases(
  accessToken: string,
  phraseIds: string[],
): Promise<boolean> {
  const ids = phraseIds.filter(isPostgresUuid);
  if (ids.length === 0) return true;
  const authenticated = await getAuthenticatedSupabase(accessToken);
  if (!authenticated) return false;
  const { supabase, userId } = authenticated;

  const { error: drillError } = await supabase
    .from("drill_items")
    .delete()
    .in("saved_phrase_id", ids)
    .eq("user_id", userId);
  if (drillError && !isMissingRelationError(drillError)) throw drillError;
  const { error: legacySrsError } = await supabase
    .from("srs_items")
    .delete()
    .in("phrase_id", ids)
    .eq("user_id", userId);
  if (legacySrsError) throw legacySrsError;
  const { error: savedError } = await supabase
    .from("saved_phrases")
    .delete()
    .in("id", ids)
    .eq("user_id", userId);
  if (savedError && !isMissingRelationError(savedError)) throw savedError;
  const { error: legacyPhraseError } = await supabase
    .from("phrases")
    .delete()
    .in("id", ids)
    .eq("user_id", userId);
  if (legacyPhraseError) throw legacyPhraseError;

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

async function getAuthenticatedSupabase(accessToken: string): Promise<{
  supabase: SupabaseClient;
  userId: string;
} | null> {
  const supabase = getServerSupabase(accessToken);
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { supabase, userId: data.user.id };
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
