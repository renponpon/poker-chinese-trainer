revoke all on table public.saved_phrases from authenticated;
revoke all on table public.drill_items from authenticated;

grant select, insert, update, delete on table public.saved_phrases to authenticated;
grant select, insert, update, delete on table public.drill_items to authenticated;
