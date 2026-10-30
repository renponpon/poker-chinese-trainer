begin;
create table if not exists public.drill_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  question_limit integer not null default 5 check (question_limit between 0 and 999)
);
alter table public.drill_preferences enable row level security;
revoke all on public.drill_preferences from public, anon, authenticated;
grant select, insert, update on public.drill_preferences to authenticated;
create policy "drill_preferences_select_own" on public.drill_preferences for select to authenticated using ((select auth.uid()) = user_id);
create policy "drill_preferences_insert_own" on public.drill_preferences for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "drill_preferences_update_own" on public.drill_preferences for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
commit;
