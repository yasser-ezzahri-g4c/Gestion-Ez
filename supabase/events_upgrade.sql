-- Run after finance_upgrade.sql in the Supabase SQL editor.
begin;

create table if not exists public.finance_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null check (length(btrim(name)) between 1 and 80),
  icon text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint finance_events_valid_period check (ends_at > starts_at)
);

alter table public.wallet_movements
  add column if not exists event_id uuid references public.finance_events(id) on delete set null;

create index if not exists finance_events_user_period_idx
  on public.finance_events (user_id, starts_at, ends_at);
create index if not exists wallet_movements_event_idx
  on public.wallet_movements (event_id)
  where event_id is not null;

alter table public.finance_events enable row level security;
drop policy if exists "finance_events_own_rows" on public.finance_events;
create policy "finance_events_own_rows" on public.finance_events
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Events for one user may not overlap, keeping automatic assignment deterministic.
create or replace function public.validate_finance_event_period()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.finance_events event
    where event.user_id = new.user_id
      and event.id <> new.id
      and new.starts_at < event.ends_at
      and new.ends_at > event.starts_at
  ) then
    raise exception 'La période chevauche un événement existant.';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_finance_event_period_trigger on public.finance_events;
create trigger validate_finance_event_period_trigger
before insert or update of starts_at, ends_at on public.finance_events
for each row execute function public.validate_finance_event_period();

-- Automatically attach every new wallet movement recorded during an event.
create or replace function public.assign_wallet_movement_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.event_id is null and new.source_type <> 'opening' then
    select event.id into new.event_id
    from public.finance_events event
    where event.user_id = new.user_id
      and new.occurred_at between event.starts_at and event.ends_at
    order by event.starts_at desc
    limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists assign_wallet_movement_event_trigger on public.wallet_movements;
create trigger assign_wallet_movement_event_trigger
before insert on public.wallet_movements
for each row execute function public.assign_wallet_movement_event();

-- When an event is created later, link existing unassigned movements in its period.
create or replace function public.backfill_finance_event_movements()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.wallet_movements
  set event_id = new.id
  where user_id = new.user_id
    and event_id is null
    and source_type <> 'opening'
    and occurred_at between new.starts_at and new.ends_at;
  return new;
end;
$$;

drop trigger if exists backfill_finance_event_movements_trigger on public.finance_events;
create trigger backfill_finance_event_movements_trigger
after insert on public.finance_events
for each row execute function public.backfill_finance_event_movements();

commit;
