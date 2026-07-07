drop policy if exists "Users can read own phrases" on public.phrases;
create policy "Users can read own phrases"
  on public.phrases for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own phrases" on public.phrases;
create policy "Users can insert own phrases"
  on public.phrases for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own phrases" on public.phrases;
create policy "Users can update own phrases"
  on public.phrases for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own phrases" on public.phrases;
create policy "Users can delete own phrases"
  on public.phrases for delete
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can read own srs items" on public.srs_items;
create policy "Users can read own srs items"
  on public.srs_items for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own srs items" on public.srs_items;
create policy "Users can insert own srs items"
  on public.srs_items for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own srs items" on public.srs_items;
create policy "Users can update own srs items"
  on public.srs_items for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own srs items" on public.srs_items;
create policy "Users can delete own srs items"
  on public.srs_items for delete
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can read own phrase categories" on public.phrase_categories;
create policy "Users can read own phrase categories"
  on public.phrase_categories for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own phrase categories" on public.phrase_categories;
create policy "Users can insert own phrase categories"
  on public.phrase_categories for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own phrase categories" on public.phrase_categories;
create policy "Users can update own phrase categories"
  on public.phrase_categories for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own phrase categories" on public.phrase_categories;
create policy "Users can delete own phrase categories"
  on public.phrase_categories for delete
  to authenticated
  using ((select auth.uid()) = user_id);
