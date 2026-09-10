create table public.ai_budget_config (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  monthly_limit_microyen bigint not null default 3000000000 check (monthly_limit_microyen between 0 and 3000000000),
  recurring_microyen bigint not null default 0 check (recurring_microyen >= 0),
  start_month date,
  verified_until timestamptz
);
insert into public.ai_budget_config (id) values (true);

create table public.ai_budget_prices (
  operation text primary key,
  unit_microyen bigint not null check (unit_microyen > 0),
  max_units integer not null check (max_units between 1 and 1000000)
);

create table public.ai_budget_months (
  month date primary key,
  charged_microyen bigint not null check (charged_microyen >= 0)
);

create table public.ai_budget_reservations (
  id uuid primary key,
  month date not null references public.ai_budget_months(month),
  operation text not null,
  units integer not null check (units > 0),
  unit_microyen bigint not null check (unit_microyen > 0),
  settled boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.ai_budget_config enable row level security;
alter table public.ai_budget_prices enable row level security;
alter table public.ai_budget_months enable row level security;
alter table public.ai_budget_reservations enable row level security;
revoke all on public.ai_budget_config, public.ai_budget_prices, public.ai_budget_months, public.ai_budget_reservations from public, anon, authenticated;
grant select, insert, update on public.ai_budget_config, public.ai_budget_prices, public.ai_budget_months, public.ai_budget_reservations to service_role;

create function public.reserve_ai_budget(reservation_id uuid, operation_name text, requested_units integer)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  config public.ai_budget_config%rowtype;
  price public.ai_budget_prices%rowtype;
  budget_month date := date_trunc('month', now() at time zone 'UTC')::date;
  reserved_amount bigint;
begin
  select * into config from public.ai_budget_config where id = true for update;
  if not found or not config.enabled or config.start_month is null or config.start_month > budget_month
     or config.verified_until is null or config.verified_until <= now() then
    return 'unconfigured';
  end if;
  select * into price from public.ai_budget_prices where operation = operation_name;
  if not found or requested_units is null or requested_units < 1 or requested_units > price.max_units then
    return 'unconfigured';
  end if;
  if exists (select 1 from public.ai_budget_reservations where id = reservation_id) then
    return 'duplicate';
  end if;
  if budget_month = config.start_month and not exists (select 1 from public.ai_budget_months where month = budget_month) then
    return 'unconfigured';
  end if;
  insert into public.ai_budget_months (month, charged_microyen)
  values (budget_month, config.recurring_microyen) on conflict (month) do nothing;
  reserved_amount := requested_units::bigint * price.unit_microyen;
  update public.ai_budget_months set charged_microyen = charged_microyen + reserved_amount
  where month = budget_month and charged_microyen + reserved_amount <= config.monthly_limit_microyen;
  if not found then return 'exceeded'; end if;
  insert into public.ai_budget_reservations (id, month, operation, units, unit_microyen)
  values (reservation_id, budget_month, operation_name, requested_units, price.unit_microyen);
  return 'reserved';
end;
$$;

create function public.settle_ai_budget(reservation_id uuid, actual_units integer)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  reservation public.ai_budget_reservations%rowtype;
begin
  perform id from public.ai_budget_config where id = true for update;
  select * into reservation from public.ai_budget_reservations where id = reservation_id for update;
  if not found or actual_units is null or actual_units < 1 then return 'invalid'; end if;
  if reservation.settled then return 'settled'; end if;
  update public.ai_budget_months
  set charged_microyen = charged_microyen + (actual_units::bigint - reservation.units) * reservation.unit_microyen
  where month = reservation.month;
  update public.ai_budget_reservations set settled = true where id = reservation_id;
  if actual_units > reservation.units then
    update public.ai_budget_config set enabled = false where id = true;
    return 'under_reserved';
  end if;
  return 'settled';
end;
$$;

revoke all on function public.reserve_ai_budget(uuid, text, integer), public.settle_ai_budget(uuid, integer) from public, anon, authenticated;
grant execute on function public.reserve_ai_budget(uuid, text, integer), public.settle_ai_budget(uuid, integer) to service_role;
