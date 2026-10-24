create table public.learning_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  time_zone text not null check (length(time_zone) between 1 and 100 and (time_zone = 'UTC' or time_zone ~ '^[A-Za-z_]+(/[A-Za-z0-9_+-]+)+$')),
  created_at timestamptz not null default now(),
  check (timezone(time_zone, created_at) is not null)
);

create table public.learning_days (
  user_id uuid not null references auth.users(id) on delete cascade,
  learning_day date not null,
  occurred_at timestamptz not null,
  time_zone text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, learning_day),
  check (learning_day = (occurred_at at time zone time_zone)::date)
);

alter table public.learning_preferences enable row level security;
alter table public.learning_days enable row level security;
revoke all on public.learning_preferences, public.learning_days from public, anon, authenticated;
grant select, insert on public.learning_preferences, public.learning_days to authenticated;

create policy learning_preferences_read on public.learning_preferences for select to authenticated
  using (user_id = (select auth.uid()));
create policy learning_preferences_insert on public.learning_preferences for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy learning_days_read on public.learning_days for select to authenticated
  using (user_id = (select auth.uid()));
create policy learning_days_insert on public.learning_days for insert to authenticated
  with check (user_id = (select auth.uid()) and occurred_at <= now() + interval '5 minutes'
    and time_zone = (select settings.time_zone from public.learning_preferences settings where settings.user_id = (select auth.uid())));
