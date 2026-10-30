import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { DrillPreferencesRepository } from "./drill-preferences-service";

export async function drillPreferencesRepositoryForToken(token: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("drill_preferences_unconfigured");
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
  return { userId: data.user.id, repository: createDrillPreferencesRepository(client) };
}

export function createDrillPreferencesRepository(client: SupabaseClient): DrillPreferencesRepository {
  return {
    async read(userId) {
      const result = await client.from("drill_preferences").select("question_limit").eq("user_id", userId).maybeSingle();
      if (result.error) throw new Error("drill_preferences_read_failed");
      return result.data?.question_limit ?? null;
    },
    async write(userId, limit) {
      const result = await client.from("drill_preferences").upsert({ user_id: userId, question_limit: limit }, { onConflict: "user_id" }).select("question_limit").single();
      if (result.error || !result.data) throw new Error("drill_preferences_write_failed");
      return result.data.question_limit;
    },
  };
}
