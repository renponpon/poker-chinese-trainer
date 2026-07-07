create table if not exists public.saved_phrases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  japanese text not null default '',
  chinese text not null default '',
  pinyin text not null default '',
  source_language text not null default 'ja',
  target_language text not null default 'zh',
  source_text text not null default '',
  target_text text not null default '',
  reading text not null default '',
  reading_type text not null default 'pinyin' check (reading_type in ('pinyin', 'none')),
  explanation text not null default '',
  audio_url text,
  direction text not null check (direction ~ '^[a-z]{2,3}-to-[a-z]{2,3}$'),
  category_id text,
  source text not null default 'manual' check (source in ('manual', 'conversation', 'prototype')),
  used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.drill_items (
  saved_phrase_id uuid primary key references public.saved_phrases(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'new' check (status in ('new', 'learning', 'review', 'maintenance', 'mastered')),
  next_review_at timestamptz,
  interval_days double precision not null default 0,
  ease_factor double precision not null default 2.5,
  consecutive_good integer not null default 0,
  last_score integer check (last_score in (1, 2, 3)),
  last_reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.saved_phrases enable row level security;
alter table public.drill_items enable row level security;

grant select, insert, update, delete on table public.saved_phrases to authenticated;
grant select, insert, update, delete on table public.drill_items to authenticated;

drop policy if exists "Users can read own saved phrases" on public.saved_phrases;
create policy "Users can read own saved phrases"
  on public.saved_phrases for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own saved phrases" on public.saved_phrases;
create policy "Users can insert own saved phrases"
  on public.saved_phrases for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own saved phrases" on public.saved_phrases;
create policy "Users can update own saved phrases"
  on public.saved_phrases for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own saved phrases" on public.saved_phrases;
create policy "Users can delete own saved phrases"
  on public.saved_phrases for delete
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can read own drill items" on public.drill_items;
create policy "Users can read own drill items"
  on public.drill_items for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own drill items" on public.drill_items;
create policy "Users can insert own drill items"
  on public.drill_items for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own drill items" on public.drill_items;
create policy "Users can update own drill items"
  on public.drill_items for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own drill items" on public.drill_items;
create policy "Users can delete own drill items"
  on public.drill_items for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create index if not exists saved_phrases_user_created_idx
  on public.saved_phrases(user_id, created_at desc);

create index if not exists saved_phrases_user_direction_idx
  on public.saved_phrases(user_id, direction);

create index if not exists saved_phrases_user_language_pair_idx
  on public.saved_phrases(user_id, source_language, target_language, created_at desc);

create index if not exists drill_items_user_next_review_idx
  on public.drill_items(user_id, next_review_at);

create index if not exists drill_items_user_status_idx
  on public.drill_items(user_id, status);

insert into public.saved_phrases (
  id,
  user_id,
  japanese,
  chinese,
  pinyin,
  source_language,
  target_language,
  source_text,
  target_text,
  reading,
  reading_type,
  explanation,
  audio_url,
  direction,
  category_id,
  source,
  used_at,
  created_at,
  updated_at
)
select
  id,
  user_id,
  japanese,
  chinese,
  pinyin,
  source_language,
  target_language,
  source_text,
  target_text,
  reading,
  reading_type,
  explanation,
  audio_url,
  direction,
  category_id,
  source,
  used_at,
  created_at,
  updated_at
from public.phrases
on conflict (id) do update set
  user_id = excluded.user_id,
  japanese = excluded.japanese,
  chinese = excluded.chinese,
  pinyin = excluded.pinyin,
  source_language = excluded.source_language,
  target_language = excluded.target_language,
  source_text = excluded.source_text,
  target_text = excluded.target_text,
  reading = excluded.reading,
  reading_type = excluded.reading_type,
  explanation = excluded.explanation,
  audio_url = excluded.audio_url,
  direction = excluded.direction,
  category_id = excluded.category_id,
  source = excluded.source,
  used_at = excluded.used_at,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at;

insert into public.drill_items (
  saved_phrase_id,
  user_id,
  status,
  next_review_at,
  interval_days,
  ease_factor,
  consecutive_good,
  last_score,
  last_reviewed_at,
  created_at,
  updated_at
)
select
  srs.phrase_id,
  srs.user_id,
  srs.status,
  srs.next_review_at,
  srs.interval_days,
  srs.ease_factor,
  srs.consecutive_good,
  srs.last_score,
  srs.last_reviewed_at,
  srs.updated_at,
  srs.updated_at
from public.srs_items srs
join public.saved_phrases saved on saved.id = srs.phrase_id
on conflict (saved_phrase_id) do update set
  user_id = excluded.user_id,
  status = excluded.status,
  next_review_at = excluded.next_review_at,
  interval_days = excluded.interval_days,
  ease_factor = excluded.ease_factor,
  consecutive_good = excluded.consecutive_good,
  last_score = excluded.last_score,
  last_reviewed_at = excluded.last_reviewed_at,
  updated_at = excluded.updated_at;

insert into public.drill_items (
  saved_phrase_id,
  user_id,
  status,
  next_review_at,
  interval_days,
  ease_factor,
  consecutive_good,
  last_score,
  last_reviewed_at,
  created_at,
  updated_at
)
select
  phrase.id,
  phrase.user_id,
  'new',
  null,
  0,
  2.5,
  0,
  null,
  null,
  phrase.created_at,
  phrase.updated_at
from public.phrases phrase
where
  phrase.should_drill = true
  and not exists (
    select 1
    from public.drill_items drill
    where drill.saved_phrase_id = phrase.id
  );
