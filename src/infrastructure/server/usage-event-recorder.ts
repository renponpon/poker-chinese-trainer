import {
  recordAiUsageEvent as recordSupabaseAiUsageEvent,
  recordProductAnalyticsEvent as recordSupabaseProductAnalyticsEvent,
  type AiUsageEventInput,
  type ProductAnalyticsEventInput,
} from "@/lib/server/supabase-admin";

export type { AiUsageEventInput, ProductAnalyticsEventInput };

export function recordAiUsageEvent(input: AiUsageEventInput): Promise<boolean> {
  return recordSupabaseAiUsageEvent(input);
}

export function recordProductAnalyticsEvent(
  input: ProductAnalyticsEventInput,
): Promise<boolean> {
  return recordSupabaseProductAnalyticsEvent(input);
}
