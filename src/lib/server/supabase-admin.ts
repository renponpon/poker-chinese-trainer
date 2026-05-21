import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { PhraseDirection } from "@/lib/types";

export type AiUsageActorType = "guest" | "user";

export type AiUsageEventInput = {
  requestId: string;
  userId: string | null;
  actorType: AiUsageActorType;
  ipHash: string | null;
  endpoint: string;
  feature: "translation" | "explanation" | "speech_to_text" | "usage_event" | null;
  provider: "azure" | "gemini" | "openai" | "web_speech" | "unknown" | null;
  mode: string | null;
  sourcePage: string | null;
  direction: PhraseDirection | null;
  inputChars: number;
  outputChars: number;
  audioDurationMs: number | null;
  success: boolean;
  errorCode: string | null;
  model: string | null;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let adminClient: SupabaseClient | null | undefined;

function getSupabaseAdmin(): SupabaseClient | null {
  if (adminClient !== undefined) return adminClient;
  if (!supabaseUrl || !serviceRoleKey) {
    adminClient = null;
    return adminClient;
  }
  adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  return adminClient;
}

export function isUsageTrackingConfigured(): boolean {
  return Boolean(supabaseUrl && serviceRoleKey);
}

export async function getUserIdFromAccessToken(
  accessToken: string,
): Promise<string | null> {
  if (!supabaseUrl || !anonKey || !accessToken) return null;

  const supabase = createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user.id;
}

export async function countAiUsageToday(params: {
  userId: string | null;
  ipHash: string | null;
  actorType: AiUsageActorType;
  now?: Date;
}): Promise<number | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const start = startOfUtcDay(params.now ?? new Date());
  let query = supabase
    .from("ai_usage_events")
    .select("id", { count: "exact", head: true })
    .eq("actor_type", params.actorType)
    .gte("created_at", start.toISOString());

  if (params.userId) {
    query = query.eq("user_id", params.userId);
  } else if (params.ipHash) {
    query = query.eq("ip_hash", params.ipHash);
  } else {
    return null;
  }

  const { count, error } = await query;
  if (error) {
    console.error("[ai_usage_events] count failed", error);
    return null;
  }
  return count ?? 0;
}

export async function recordAiUsageEvent(
  input: AiUsageEventInput,
): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;

  const { error } = await supabase.from("ai_usage_events").insert({
    request_id: input.requestId,
    user_id: input.userId,
    actor_type: input.actorType,
    ip_hash: input.ipHash,
    endpoint: input.endpoint,
    feature: input.feature,
    provider: input.provider,
    mode: input.mode,
    source_page: input.sourcePage,
    direction: input.direction,
    input_chars: input.inputChars,
    output_chars: input.outputChars,
    audio_duration_ms: input.audioDurationMs,
    success: input.success,
    error_code: input.errorCode,
    model: input.model,
  });
  if (error) {
    console.error("[ai_usage_events] insert failed", error);
    return false;
  }
  return true;
}

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
