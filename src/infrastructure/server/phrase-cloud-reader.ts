import { getPhrasesByOwner } from "../../lib/notion";
import { getSupabasePhrasesByUser } from "../../lib/supabase";

export function createPhraseCloudReader() {
  return {
    loadByAccessToken: getSupabasePhrasesByUser,
    loadByOwnerKey: getPhrasesByOwner,
  };
}
