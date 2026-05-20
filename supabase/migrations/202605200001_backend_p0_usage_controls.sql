create extension if not exists "pgcrypto";

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
  direction text check (direction in ('ja-to-zh', 'zh-to-ja')),
  input_chars integer not null default 0 check (input_chars >= 0),
  output_chars integer not null default 0 check (output_chars >= 0),
  success boolean not null default false,
  error_code text,
  model text,
  created_at timestamptz not null default now()
);

alter table public.phrase_categories enable row level security;
alter table public.ai_usage_events enable row level security;

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

create index if not exists phrase_categories_user_created_idx
  on public.phrase_categories(user_id, created_at desc);

create index if not exists ai_usage_events_user_created_idx
  on public.ai_usage_events(user_id, created_at desc);

create index if not exists ai_usage_events_ip_created_idx
  on public.ai_usage_events(ip_hash, created_at desc);

create index if not exists ai_usage_events_request_idx
  on public.ai_usage_events(request_id);
