alter table public.ai_usage_events
  add column if not exists feature text check (feature in ('translation', 'explanation', 'speech_to_text', 'usage_event')),
  add column if not exists provider text check (provider in ('azure', 'deepl', 'gemini', 'openai', 'web_speech', 'unknown')),
  add column if not exists mode text,
  add column if not exists source_page text check (source_page in ('add', 'conversation', 'library', 'drill', 'admin')),
  add column if not exists audio_duration_ms integer check (audio_duration_ms >= 0);

create index if not exists ai_usage_events_feature_created_idx
  on public.ai_usage_events(feature, provider, mode, created_at desc);

create or replace view public.weekly_ai_usage
with (security_invoker = true) as
select
  date_trunc('week', created_at)::date as period_start,
  actor_type,
  coalesce(user_id::text, ip_hash, 'unknown') as actor_key,
  feature,
  provider,
  mode,
  source_page,
  endpoint,
  direction,
  model,
  count(*)::integer as request_count,
  count(*) filter (where success)::integer as success_count,
  count(*) filter (where not success)::integer as failure_count,
  sum(input_chars)::bigint as input_chars,
  sum(output_chars)::bigint as output_chars,
  sum(coalesce(audio_duration_ms, 0))::bigint as audio_duration_ms,
  min(created_at) as first_used_at,
  max(created_at) as last_used_at
from public.ai_usage_events
group by
  period_start,
  actor_type,
  actor_key,
  feature,
  provider,
  mode,
  source_page,
  endpoint,
  direction,
  model;

create or replace view public.monthly_ai_usage
with (security_invoker = true) as
select
  date_trunc('month', created_at)::date as period_start,
  actor_type,
  coalesce(user_id::text, ip_hash, 'unknown') as actor_key,
  feature,
  provider,
  mode,
  source_page,
  endpoint,
  direction,
  model,
  count(*)::integer as request_count,
  count(*) filter (where success)::integer as success_count,
  count(*) filter (where not success)::integer as failure_count,
  sum(input_chars)::bigint as input_chars,
  sum(output_chars)::bigint as output_chars,
  sum(coalesce(audio_duration_ms, 0))::bigint as audio_duration_ms,
  min(created_at) as first_used_at,
  max(created_at) as last_used_at
from public.ai_usage_events
group by
  period_start,
  actor_type,
  actor_key,
  feature,
  provider,
  mode,
  source_page,
  endpoint,
  direction,
  model;
