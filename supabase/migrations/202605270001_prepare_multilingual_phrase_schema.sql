alter table public.phrases
  add column if not exists source_language text not null default 'ja',
  add column if not exists target_language text not null default 'zh',
  add column if not exists source_text text not null default '',
  add column if not exists target_text text not null default '',
  add column if not exists reading text not null default '',
  add column if not exists reading_type text not null default 'pinyin';

update public.phrases
set
  source_language = case when direction = 'zh-to-ja' then 'zh' else 'ja' end,
  target_language = case when direction = 'zh-to-ja' then 'ja' else 'zh' end,
  source_text = case when direction = 'zh-to-ja' then chinese else japanese end,
  target_text = case when direction = 'zh-to-ja' then japanese else chinese end,
  reading = coalesce(nullif(reading, ''), pinyin),
  reading_type = case
    when direction in ('ja-to-zh', 'zh-to-ja') then 'pinyin'
    else 'none'
  end
where source_text = '' or target_text = '' or reading = '';

alter table public.phrases
  drop constraint if exists phrases_direction_check;

alter table public.phrases
  add constraint phrases_direction_check
  check (direction ~ '^[a-z]{2,3}-to-[a-z]{2,3}$');

alter table public.phrases
  drop constraint if exists phrases_reading_type_check;

alter table public.phrases
  add constraint phrases_reading_type_check
  check (reading_type in ('pinyin', 'none'));

alter table public.ai_usage_events
  drop constraint if exists ai_usage_events_direction_check;

alter table public.ai_usage_events
  add constraint ai_usage_events_direction_check
  check (direction is null or direction ~ '^[a-z]{2,3}-to-[a-z]{2,3}$');

create index if not exists phrases_user_language_pair_idx
  on public.phrases(user_id, source_language, target_language, created_at desc);
