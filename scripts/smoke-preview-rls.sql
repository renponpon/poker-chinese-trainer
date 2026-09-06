begin;

do $$
begin
  if exists(select 1 from auth.users) or exists(select 1 from public.saved_phrases)
    or exists(select 1 from public.phrases) then
    raise exception 'Run this smoke test only in an empty isolated test project';
  end if;
end $$;

insert into auth.users(id) values
  ('00000000-0000-4000-8000-000000000091'),
  ('00000000-0000-4000-8000-000000000092');

insert into public.saved_phrases(id,user_id,japanese,chinese,direction) values
  ('00000000-0000-4000-8000-000000000191','00000000-0000-4000-8000-000000000091','検証用A','Test A','ja-to-en'),
  ('00000000-0000-4000-8000-000000000192','00000000-0000-4000-8000-000000000092','検証用B','Test B','ja-to-en');

insert into public.drill_items(saved_phrase_id,user_id) values
  ('00000000-0000-4000-8000-000000000191','00000000-0000-4000-8000-000000000091'),
  ('00000000-0000-4000-8000-000000000192','00000000-0000-4000-8000-000000000092');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000091","role":"authenticated"}',true);

do $$
declare changed integer;
begin
  if (select count(*) from public.saved_phrases) <> 1 then
    raise exception 'cross-account read failure';
  end if;
  if (select count(*) from public.drill_items) <> 1 then
    raise exception 'cross-account drill read failure';
  end if;
  if not exists(select 1 from public.saved_phrases where id='00000000-0000-4000-8000-000000000191') then
    raise exception 'own data unreadable';
  end if;
  update public.saved_phrases set japanese='updated' where id='00000000-0000-4000-8000-000000000192';
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'cross-account update failure'; end if;
  begin
    insert into public.saved_phrases(user_id,direction) values ('00000000-0000-4000-8000-000000000092','ja-to-en');
    raise exception 'cross-account insert unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
  update public.saved_phrases set japanese='own edit' where id='00000000-0000-4000-8000-000000000191';
  get diagnostics changed = row_count;
  if changed <> 1 then raise exception 'own update failed'; end if;
end $$;

set local role anon;
do $$
begin
  begin
    perform count(*) from public.saved_phrases;
    raise exception 'anonymous access unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;
select 'PASS: ownership RLS and anonymous denial; all fixtures rolled back' as verification;
