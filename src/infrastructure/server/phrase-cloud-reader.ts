import { getPhrasesByOwner } from "../../lib/notion";
import { getSupabasePhrasesByUser } from "./supabase-phrase-repository";

export function createPhraseCloudReader() {
  return {
    loadByAccessToken: getSupabasePhrasesByUser,
    loadByOwnerKey: getPhrasesByOwner,
  };
}
