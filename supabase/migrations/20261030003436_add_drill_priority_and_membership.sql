begin;

alter table public.saved_phrases
  add column if not exists should_drill boolean,
  add column if not exists drill_priority boolean not null default false;

alter table public.phrases
  add column if not exists drill_priority boolean not null default false;

commit;
