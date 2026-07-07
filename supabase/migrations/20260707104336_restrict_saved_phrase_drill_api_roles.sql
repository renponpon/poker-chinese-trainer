revoke all on table public.saved_phrases from anon;
revoke all on table public.drill_items from anon;
revoke all on table public.saved_phrases from public;
revoke all on table public.drill_items from public;

grant select, insert, update, delete on table public.saved_phrases to authenticated;
grant select, insert, update, delete on table public.drill_items to authenticated;
