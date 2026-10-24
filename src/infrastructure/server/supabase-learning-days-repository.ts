import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { LearningDaysRepository } from "./learning-days-service";

export async function learningDaysRepositoryForToken(token: string): Promise<{ userId: string; repository: LearningDaysRepository } | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("learning_sync_unconfigured");
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
  return { userId: data.user.id, repository: createLearningDaysRepository(client) };
}

export function createLearningDaysRepository(client: SupabaseClient): LearningDaysRepository {
  return {
    async initializeTimeZone(userId, timeZone) {
      const inserted = await client.from("learning_preferences").upsert({ user_id: userId, time_zone: timeZone }, { onConflict: "user_id", ignoreDuplicates: true });
      if (inserted.error) throw new Error("learning_preferences_write_failed");
      const result = await client.from("learning_preferences").select("time_zone").eq("user_id", userId).single();
      if (result.error || !result.data) throw new Error("learning_preferences_read_failed");
      return result.data.time_zone;
    },
    async insertDays(userId, entries) {
      if (!entries.length) return;
      const result = await client.from("learning_days").upsert(entries.map((entry) => ({ user_id: userId, learning_day: entry.day, occurred_at: entry.occurredAt, time_zone: entry.timeZone })), { onConflict: "user_id,learning_day", ignoreDuplicates: true });
      if (result.error) throw new Error("learning_days_write_failed");
    },
    async listDays(userId) {
      const days: string[] = [];
      for (let offset = 0; offset < 100000; offset += 1000) {
        const result = await client.from("learning_days").select("learning_day").eq("user_id", userId).order("learning_day").range(offset, offset + 999);
        if (result.error || !result.data) throw new Error("learning_days_read_failed");
        days.push(...result.data.map((entry) => entry.learning_day));
        if (result.data.length < 1000) return days;
      }
      throw new Error("learning_days_limit");
    },
  };
}
