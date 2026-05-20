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

alter table public.phrases enable row level security;
alter table public.srs_items enable row level security;

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

create index if not exists phrases_user_created_idx
  on public.phrases(user_id, created_at desc);

create index if not exists phrases_user_direction_idx
  on public.phrases(user_id, direction);

create index if not exists srs_user_next_review_idx
  on public.srs_items(user_id, next_review_at);
