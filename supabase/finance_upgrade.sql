-- Personal finance upgrade. Run once in the Supabase SQL editor.
begin;

alter table public.wallet_categories
  add column if not exists user_id uuid references auth.users(id) on delete cascade default auth.uid(),
  add column if not exists is_fixed boolean not null default false,
  add column if not exists icon text;

alter table public.wallet_movements
  add column if not exists user_id uuid references auth.users(id) on delete cascade default auth.uid(),
  add column if not exists occurred_at timestamptz,
  add column if not exists transaction_type text generated always as
    (case when amount < 0 then 'Expense' else 'Revenue' end) stored;

update public.wallet_movements
set occurred_at = movement_date::timestamp + interval '12 hours'
where occurred_at is null;

alter table public.wallet_movements
  alter column occurred_at set default now(),
  alter column occurred_at set not null;

-- Preserve existing data automatically when the project currently has one user.
do $$
declare
  only_user uuid;
begin
  if (select count(*) from auth.users) = 1 then
    select id into only_user from auth.users limit 1;
    update public.wallet_categories set user_id = only_user where user_id is null;
    update public.wallet_movements set user_id = only_user where user_id is null;
  end if;

  if exists (select 1 from public.wallet_categories where user_id is null)
    or exists (select 1 from public.wallet_movements where user_id is null) then
    raise exception 'Existing wallet rows need a user_id. Assign them to the correct auth.users.id, then rerun this migration.';
  end if;
end $$;

alter table public.wallet_categories alter column user_id set not null;
alter table public.wallet_movements alter column user_id set not null;

-- Remove legacy global uniqueness: two different users may use the same category name.
alter table public.wallet_categories
  drop constraint if exists wallet_categories_name_key;
do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select conname
    from pg_constraint
    where conrelid = 'public.wallet_categories'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) ~* '^UNIQUE \(name\)$'
  loop
    execute format('alter table public.wallet_categories drop constraint %I', constraint_row.conname);
  end loop;
end $$;

create unique index if not exists wallet_categories_user_normalized_name_uidx
  on public.wallet_categories (
    user_id,
    lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))
  )
  where user_id is not null and not is_system;

create index if not exists wallet_movements_user_occurred_idx
  on public.wallet_movements (user_id, occurred_at desc);

-- References such as opening:2026-09 are unique for each user, not globally.
alter table public.wallet_movements
  drop constraint if exists wallet_movements_ref_key_key;
do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select conname
    from pg_constraint
    where conrelid = 'public.wallet_movements'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) ~* '^UNIQUE \(ref_key\)$'
  loop
    execute format('alter table public.wallet_movements drop constraint %I', constraint_row.conname);
  end loop;
end $$;
create unique index if not exists wallet_movements_user_ref_key_uidx
  on public.wallet_movements (user_id, ref_key)
  where user_id is not null and ref_key is not null;

alter table public.wallet_categories enable row level security;
alter table public.wallet_movements enable row level security;

-- Replace legacy shared policies: personal finance rows must never cross accounts.
do $$
declare
  policy_row record;
begin
  for policy_row in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('wallet_categories', 'wallet_movements')
  loop
    execute format('drop policy if exists %I on %I.%I', policy_row.policyname, policy_row.schemaname, policy_row.tablename);
  end loop;
end $$;

drop policy if exists "wallet_categories_own_rows" on public.wallet_categories;
create policy "wallet_categories_own_rows" on public.wallet_categories
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "wallet_movements_own_rows" on public.wallet_movements;
create policy "wallet_movements_own_rows" on public.wallet_movements
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

commit;
