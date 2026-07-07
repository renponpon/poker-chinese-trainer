revoke all on table public.ai_usage_events from anon;
revoke all on table public.ai_usage_events from authenticated;
revoke all on table public.ai_usage_events from public;
revoke all on table public.product_analytics_events from anon;
revoke all on table public.product_analytics_events from authenticated;
revoke all on table public.product_analytics_events from public;

grant select, insert on table public.ai_usage_events to service_role;
grant select, insert on table public.product_analytics_events to service_role;

drop policy if exists "No client access to ai usage events" on public.ai_usage_events;
create policy "No client access to ai usage events"
  on public.ai_usage_events for all
  to anon, authenticated
  using (false)
  with check (false);

drop policy if exists "No client access to product analytics events" on public.product_analytics_events;
create policy "No client access to product analytics events"
  on public.product_analytics_events for all
  to anon, authenticated
  using (false)
  with check (false);
