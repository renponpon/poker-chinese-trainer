create extension if not exists "pgcrypto";

create table if not exists public.phrases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  japanese text not null default '',
  chinese text not null default '',
  pinyin text not null default '',
  explanation text not null default '',
  audio_url text,
  direction text not null check (direction in ('ja-to-zh', 'zh-to-ja')),
  category_id text,
  should_drill boolean not null default true,
  source text not null default 'manual' check (source in ('manual', 'conversation', 'prototype')),
  used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.srs_items (
  phrase_id uuid primary key references public.phrases(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'new' check (status in ('new', 'learning', 'review', 'maintenance', 'mastered')),
  next_review_at timestamptz,
  interval_days double precision not null default 0,
  ease_factor double precision not null default 2.5,
  consecutive_good integer not null default 0,
  last_score integer check (last_score in (1, 2, 3)),
  last_reviewed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.phrase_categories (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  built_in boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  check (char_length(id) between 1 and 64),
  check (char_length(label) between 1 and 80)
);

create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  request_id text not null,
  user_id uuid references auth.users(id) on delete set null,
  actor_type text not null check (actor_type in ('guest', 'user')),
  ip_hash text,
  endpoint text not null,
  feature text check (feature in ('translation', 'explanation', 'speech_to_text', 'usage_event')),
  provider text check (provider in ('azure', 'gemini', 'openai', 'web_speech', 'unknown')),
  mode text,
  source_page text check (source_page in ('add', 'conversation', 'library', 'drill', 'admin')),
  direction text check (direction in ('ja-to-zh', 'zh-to-ja')),
  input_chars integer not null default 0 check (input_chars >= 0),
  output_chars integer not null default 0 check (output_chars >= 0),
  audio_duration_ms integer check (audio_duration_ms >= 0),
  success boolean not null default false,
  error_code text,
  model text,
  created_at timestamptz not null default now()
);

alter table public.phrases enable row level security;
alter table public.srs_items enable row level security;
alter table public.phrase_categories enable row level security;
alter table public.ai_usage_events enable row level security;

drop policy if exists "Users can read own phrases" on public.phrases;
create policy "Users can read own phrases"
  on public.phrases for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own phrases" on public.phrases;
create policy "Users can insert own phrases"
  on public.phrases for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own phrases" on public.phrases;
create policy "Users can update own phrases"
  on public.phrases for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own phrases" on public.phrases;
create policy "Users can delete own phrases"
  on public.phrases for delete
  using (auth.uid() = user_id);

drop policy if exists "Users can read own srs items" on public.srs_items;
create policy "Users can read own srs items"
  on public.srs_items for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own srs items" on public.srs_items;
create policy "Users can insert own srs items"
  on public.srs_items for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own srs items" on public.srs_items;
create policy "Users can update own srs items"
  on public.srs_items for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own srs items" on public.srs_items;
create policy "Users can delete own srs items"
  on public.srs_items for delete
  using (auth.uid() = user_id);

drop policy if exists "Users can read own phrase categories" on public.phrase_categories;
create policy "Users can read own phrase categories"
  on public.phrase_categories for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own phrase categories" on public.phrase_categories;
create policy "Users can insert own phrase categories"
  on public.phrase_categories for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own phrase categories" on public.phrase_categories;
create policy "Users can update own phrase categories"
  on public.phrase_categories for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own phrase categories" on public.phrase_categories;
create policy "Users can delete own phrase categories"
  on public.phrase_categories for delete
  using (auth.uid() = user_id);

create index if not exists phrases_user_created_idx
  on public.phrases(user_id, created_at desc);

create index if not exists phrases_user_direction_idx
  on public.phrases(user_id, direction);

create index if not exists srs_user_next_review_idx
  on public.srs_items(user_id, next_review_at);

create index if not exists phrase_categories_user_created_idx
  on public.phrase_categories(user_id, created_at desc);

create index if not exists ai_usage_events_user_created_idx
  on public.ai_usage_events(user_id, created_at desc);

create index if not exists ai_usage_events_ip_created_idx
  on public.ai_usage_events(ip_hash, created_at desc);

create index if not exists ai_usage_events_request_idx
  on public.ai_usage_events(request_id);

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
