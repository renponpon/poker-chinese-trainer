create table if not exists public.product_analytics_events (
  id uuid primary key default gen_random_uuid(),
  request_id text not null,
  user_id uuid references auth.users(id) on delete set null,
  actor_type text not null check (actor_type in ('guest', 'user')),
  ip_hash text,
  session_id text,
  event_name text not null check (
    event_name in (
      'page_view',
      'input_start',
      'translation_submit',
      'translation_success',
      'translation_failure',
      'drill_open',
      'drill_answer',
      'conversation_drill_save'
    )
  ),
  route text,
  source_page text check (
    source_page is null or source_page in ('home', 'add', 'conversation', 'drill', 'library', 'auth')
  ),
  direction text check (direction is null or direction ~ '^[a-z]{2,3}-to-[a-z]{2,3}$'),
  target_language text,
  generation_mode text,
  input_chars integer not null default 0 check (input_chars >= 0),
  score integer check (score in (1, 2, 3)),
  success boolean,
  error_code text,
  created_at timestamptz not null default now()
);

alter table public.product_analytics_events enable row level security;

create index if not exists product_analytics_events_created_idx
  on public.product_analytics_events(created_at desc);

create index if not exists product_analytics_events_user_created_idx
  on public.product_analytics_events(user_id, created_at desc);

create index if not exists product_analytics_events_ip_created_idx
  on public.product_analytics_events(ip_hash, created_at desc);

create index if not exists product_analytics_events_session_created_idx
  on public.product_analytics_events(session_id, created_at desc);

create index if not exists product_analytics_events_name_created_idx
  on public.product_analytics_events(event_name, created_at desc);

create index if not exists product_analytics_events_source_created_idx
  on public.product_analytics_events(source_page, event_name, created_at desc);
