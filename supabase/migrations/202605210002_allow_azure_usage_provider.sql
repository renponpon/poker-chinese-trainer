alter table public.ai_usage_events
  drop constraint if exists ai_usage_events_provider_check;

alter table public.ai_usage_events
  add constraint ai_usage_events_provider_check
  check (provider in ('azure', 'deepl', 'gemini', 'openai', 'web_speech', 'unknown'));
