-- TheBoyz · Cash Out, gruppi e spese condivise
-- Esegui questo file nel SQL Editor di Supabase. È idempotente.

create table if not exists public.cashout_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 80),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.cashout_group_members (
  group_id uuid not null references public.cashout_groups(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  joined_at timestamptz not null default now(),
  primary key (group_id, profile_id)
);

create table if not exists public.cashout_expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.cashout_groups(id) on delete cascade,
  description text not null check (char_length(trim(description)) between 2 and 120),
  amount numeric(12, 2) not null check (amount > 0),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create table if not exists public.cashout_expense_payers (
  expense_id uuid not null references public.cashout_expenses(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  amount numeric(12, 2) not null check (amount > 0),
  primary key (expense_id, profile_id)
);

create table if not exists public.cashout_expense_shares (
  expense_id uuid not null references public.cashout_expenses(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  amount numeric(12, 2) not null check (amount > 0),
  settled_at timestamptz,
  settled_by uuid references public.profiles(id) on delete set null,
  primary key (expense_id, profile_id)
);

-- La prima versione di Cashout usava lo stesso nome per una tabella di
-- obbligazioni legate alla singola spesa. La conserviamo integralmente e la
-- separiamo dal nuovo registro dei pagamenti di gruppo.
do $$
begin
  if to_regclass('public.cashout_settlements') is not null
    and not exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'cashout_settlements'
        and column_name = 'group_id'
    )
    and to_regclass('public.cashout_expense_settlements_legacy') is null
  then
    alter table public.cashout_settlements rename to cashout_expense_settlements_legacy;
  end if;
end;
$$;

-- I saldi sono movimenti del gruppo, non chiusure delle singole spese: in
-- questo modo anticipi diversi si compensano prima di stabilire chi paga chi.
create table if not exists public.cashout_settlements (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.cashout_groups(id) on delete cascade,
  from_profile_id uuid not null references public.profiles(id) on delete restrict,
  to_profile_id uuid not null references public.profiles(id) on delete restrict,
  amount numeric(12, 2) not null check (amount > 0),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (from_profile_id <> to_profile_id)
);

-- Dalla tabella legacy diventano movimenti soltanto le righe effettivamente
-- saldate. Quelle ancora aperte restano archiviate e saranno sostituite dal
-- ricalcolo netto di tutte le spese.
do $$
begin
  if to_regclass('public.cashout_expense_settlements_legacy') is not null then
    insert into public.cashout_settlements (
      id, group_id, from_profile_id, to_profile_id, amount, created_by, created_at
    )
    select legacy.id, expense.group_id, legacy.from_profile_id,
      legacy.to_profile_id, legacy.amount,
      coalesce(legacy.settled_by, expense.created_by),
      coalesce(legacy.settled_at, legacy.created_at)
    from public.cashout_expense_settlements_legacy legacy
    join public.cashout_expenses expense on expense.id = legacy.expense_id
    where legacy.settled_at is not null
    on conflict (id) do nothing;

    revoke all on public.cashout_expense_settlements_legacy from anon, authenticated;
  end if;
end;
$$;

create index if not exists cashout_groups_created_at_idx
  on public.cashout_groups (created_at desc);
create index if not exists cashout_group_members_profile_idx
  on public.cashout_group_members (profile_id, group_id);
create index if not exists cashout_expenses_group_idx
  on public.cashout_expenses (group_id, created_at desc);
create index if not exists cashout_expense_payers_profile_idx
  on public.cashout_expense_payers (profile_id, expense_id);
create index if not exists cashout_expense_shares_profile_idx
  on public.cashout_expense_shares (profile_id, expense_id);
create index if not exists cashout_settlements_group_idx
  on public.cashout_settlements (group_id, created_at desc);

alter table public.cashout_groups enable row level security;
alter table public.cashout_group_members enable row level security;
alter table public.cashout_expenses enable row level security;
alter table public.cashout_expense_payers enable row level security;
alter table public.cashout_expense_shares enable row level security;
alter table public.cashout_settlements enable row level security;

-- L'helper vive in uno schema non esposto alla Data API e controlla soltanto
-- l'identità della sessione. Evita la ricorsione RLS della tabella membri.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.is_cashout_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.cashout_group_members member
    where member.group_id = p_group_id
      and member.profile_id = (select auth.uid())
  );
$$;

revoke all on function private.is_cashout_group_member(uuid) from public, anon;
grant execute on function private.is_cashout_group_member(uuid) to authenticated;

-- Ogni voce economica è visibile soltanto ai partecipanti del relativo
-- gruppo. Le scritture passano dalle funzioni transazionali sottostanti.
drop policy if exists "Membri leggono i gruppi cashout" on public.cashout_groups;
create policy "Membri leggono i gruppi cashout"
on public.cashout_groups for select to authenticated
using (created_by = (select auth.uid()) or (select private.is_cashout_group_member(id)));

drop policy if exists "Membri leggono i partecipanti cashout" on public.cashout_group_members;
create policy "Membri leggono i partecipanti cashout"
on public.cashout_group_members for select to authenticated
using ((select private.is_cashout_group_member(group_id)));

drop policy if exists "Membri leggono le spese cashout" on public.cashout_expenses;
create policy "Membri leggono le spese cashout"
on public.cashout_expenses for select to authenticated
using ((select private.is_cashout_group_member(group_id)));

drop policy if exists "Membri leggono gli anticipi cashout" on public.cashout_expense_payers;
create policy "Membri leggono gli anticipi cashout"
on public.cashout_expense_payers for select to authenticated
using (exists (
  select 1 from public.cashout_expenses expense
  where expense.id = cashout_expense_payers.expense_id
    and (select private.is_cashout_group_member(expense.group_id))
));

drop policy if exists "Membri leggono le quote cashout" on public.cashout_expense_shares;
create policy "Membri leggono le quote cashout"
on public.cashout_expense_shares for select to authenticated
using (exists (
  select 1 from public.cashout_expenses expense
  where expense.id = cashout_expense_shares.expense_id
    and (select private.is_cashout_group_member(expense.group_id))
));

drop policy if exists "Membri leggono i saldi cashout" on public.cashout_settlements;
create policy "Membri leggono i saldi cashout"
on public.cashout_settlements for select to authenticated
using ((select private.is_cashout_group_member(group_id)));

revoke all on public.cashout_groups from anon, authenticated;
revoke all on public.cashout_group_members from anon, authenticated;
revoke all on public.cashout_expenses from anon, authenticated;
revoke all on public.cashout_expense_payers from anon, authenticated;
revoke all on public.cashout_expense_shares from anon, authenticated;
revoke all on public.cashout_settlements from anon, authenticated;
grant select on public.cashout_groups to authenticated;
grant select on public.cashout_group_members to authenticated;
grant select on public.cashout_expenses to authenticated;
grant select on public.cashout_expense_payers to authenticated;
grant select on public.cashout_expense_shares to authenticated;
grant select on public.cashout_settlements to authenticated;

create or replace function public.create_cashout_group(
  p_name text,
  p_member_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  clean_members uuid[];
  new_group_id uuid;
begin
  if current_user_id is null then
    raise exception 'Devi accedere per creare un gruppo';
  end if;
  if nullif(trim(p_name), '') is null or char_length(trim(p_name)) > 80 then
    raise exception 'Inserisci un nome valido';
  end if;

  select array_agg(member_id order by member_id)
  into clean_members
  from (select distinct unnest(coalesce(p_member_ids, array[]::uuid[])) as member_id) members;

  if coalesce(cardinality(clean_members), 0) < 2 then
    raise exception 'Scegli almeno due partecipanti';
  end if;
  if not current_user_id = any(clean_members) then
    raise exception 'Chi crea il gruppo deve partecipare';
  end if;
  if (select count(*) from public.profiles where id = any(clean_members)) <> cardinality(clean_members) then
    raise exception 'Uno o più partecipanti non sono validi';
  end if;

  insert into public.cashout_groups (name, created_by)
  values (trim(p_name), current_user_id)
  returning id into new_group_id;

  insert into public.cashout_group_members (group_id, profile_id)
  select new_group_id, member_id from unnest(clean_members) member_id;

  return new_group_id;
end;
$$;

create or replace function public.create_cashout_expense(
  p_group_id uuid,
  p_description text,
  p_total numeric,
  p_payers jsonb,
  p_participant_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  clean_participants uuid[];
  participant_total integer;
  total_cents bigint;
  payer_cents bigint;
  base_share bigint;
  remainder bigint;
  new_expense_id uuid;
begin
  if current_user_id is null then
    raise exception 'Devi accedere per aggiungere una spesa';
  end if;
  if not exists (
    select 1 from public.cashout_group_members
    where group_id = p_group_id and profile_id = current_user_id
  ) then
    raise exception 'Non partecipi a questo gruppo';
  end if;
  if nullif(trim(p_description), '') is null or char_length(trim(p_description)) > 120 then
    raise exception 'Inserisci una descrizione valida';
  end if;

  if p_total is null then raise exception 'Inserisci il totale della spesa'; end if;
  total_cents := round(p_total * 100)::bigint;
  if total_cents <= 0 then raise exception 'Il totale deve essere maggiore di zero'; end if;
  if jsonb_typeof(p_payers) <> 'array' or jsonb_array_length(p_payers) = 0 then
    raise exception 'Scegli almeno un pagatore';
  end if;

  select array_agg(participant_id order by participant_id)
  into clean_participants
  from (select distinct unnest(coalesce(p_participant_ids, array[]::uuid[])) as participant_id) participants;
  participant_total := coalesce(cardinality(clean_participants), 0);
  if participant_total = 0 then raise exception 'Scegli chi partecipa alla spesa'; end if;

  if exists (
    select 1 from unnest(clean_participants) participant_id
    where not exists (
      select 1 from public.cashout_group_members member
      where member.group_id = p_group_id and member.profile_id = participant_id
    )
  ) then raise exception 'Una persona addebitata non appartiene al gruppo'; end if;

  if exists (
    select 1 from jsonb_array_elements(p_payers) payer
    where (payer ->> 'profile_id') is null
      or (payer ->> 'amount') is null
      or round((payer ->> 'amount')::numeric * 100)::bigint <= 0
      or not exists (
        select 1 from public.cashout_group_members member
        where member.group_id = p_group_id
          and member.profile_id = (payer ->> 'profile_id')::uuid
      )
  ) then raise exception 'I pagatori non sono validi'; end if;

  if (
    select count(*) from jsonb_array_elements(p_payers)
  ) <> (
    select count(distinct (payer ->> 'profile_id')::uuid) from jsonb_array_elements(p_payers) payer
  ) then raise exception 'Ogni pagatore può comparire una volta sola'; end if;

  select sum(round((payer ->> 'amount')::numeric * 100)::bigint)
  into payer_cents from jsonb_array_elements(p_payers) payer;
  if payer_cents <> total_cents then
    raise exception 'Gli anticipi devono sommare esattamente al totale';
  end if;

  insert into public.cashout_expenses (group_id, description, amount, created_by)
  values (p_group_id, trim(p_description), total_cents::numeric / 100, current_user_id)
  returning id into new_expense_id;

  insert into public.cashout_expense_payers (expense_id, profile_id, amount)
  select new_expense_id, (payer ->> 'profile_id')::uuid,
    round((payer ->> 'amount')::numeric * 100)::numeric / 100
  from jsonb_array_elements(p_payers) payer;

  base_share := total_cents / participant_total;
  remainder := total_cents % participant_total;
  insert into public.cashout_expense_shares (expense_id, profile_id, amount)
  select new_expense_id, participant_id,
    (base_share + case when ordinality <= remainder then 1 else 0 end)::numeric / 100
  from unnest(clean_participants) with ordinality participant(participant_id, ordinality);

  return new_expense_id;
end;
$$;

-- La vecchia chiusura per quota non può esprimere il destinatario del denaro
-- e impedisce la compensazione tra spese: la rimuoviamo quando si rilancia la
-- migrazione su un progetto esistente.
drop function if exists public.set_cashout_share_settled(uuid, uuid, boolean);

create or replace function public.record_cashout_settlement(
  p_group_id uuid,
  p_from_profile_id uuid,
  p_to_profile_id uuid,
  p_amount numeric
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  amount_cents bigint;
  from_balance numeric;
  to_balance numeric;
  new_settlement_id uuid;
begin
  if current_user_id is null then raise exception 'Devi accedere per registrare un saldo'; end if;

  -- Serializza i pagamenti del gruppo: due conferme contemporanee non possono
  -- entrambe usare lo stesso debito residuo.
  perform 1 from public.cashout_groups where id = p_group_id for update;
  if not found then raise exception 'Gruppo non trovato'; end if;
  if not exists (
    select 1 from public.cashout_group_members
    where group_id = p_group_id and profile_id = current_user_id
  ) then raise exception 'Non partecipi a questo gruppo'; end if;
  if p_from_profile_id = p_to_profile_id then raise exception 'Pagatore e destinatario devono essere diversi'; end if;
  if not exists (
    select 1 from public.cashout_group_members
    where group_id = p_group_id and profile_id = p_from_profile_id
  ) or not exists (
    select 1 from public.cashout_group_members
    where group_id = p_group_id and profile_id = p_to_profile_id
  ) then raise exception 'Pagatore e destinatario devono appartenere al gruppo'; end if;

  if p_amount is null then raise exception 'Inserisci un importo valido'; end if;
  amount_cents := round(p_amount * 100)::bigint;
  if amount_cents <= 0 then raise exception 'Inserisci un importo valido'; end if;

  select
    coalesce((select sum(payer.amount) from public.cashout_expense_payers payer join public.cashout_expenses expense on expense.id = payer.expense_id where expense.group_id = p_group_id and payer.profile_id = p_from_profile_id), 0)
    - coalesce((select sum(share.amount) from public.cashout_expense_shares share join public.cashout_expenses expense on expense.id = share.expense_id where expense.group_id = p_group_id and share.profile_id = p_from_profile_id), 0)
    + coalesce((select sum(amount) from public.cashout_settlements where group_id = p_group_id and from_profile_id = p_from_profile_id), 0)
    - coalesce((select sum(amount) from public.cashout_settlements where group_id = p_group_id and to_profile_id = p_from_profile_id), 0)
  into from_balance;

  select
    coalesce((select sum(payer.amount) from public.cashout_expense_payers payer join public.cashout_expenses expense on expense.id = payer.expense_id where expense.group_id = p_group_id and payer.profile_id = p_to_profile_id), 0)
    - coalesce((select sum(share.amount) from public.cashout_expense_shares share join public.cashout_expenses expense on expense.id = share.expense_id where expense.group_id = p_group_id and share.profile_id = p_to_profile_id), 0)
    + coalesce((select sum(amount) from public.cashout_settlements where group_id = p_group_id and from_profile_id = p_to_profile_id), 0)
    - coalesce((select sum(amount) from public.cashout_settlements where group_id = p_group_id and to_profile_id = p_to_profile_id), 0)
  into to_balance;

  if from_balance >= 0 then raise exception 'Chi paga non ha un debito nel saldo attuale'; end if;
  if to_balance <= 0 then raise exception 'Il destinatario non ha un credito nel saldo attuale'; end if;
  if amount_cents > round(least(-from_balance, to_balance) * 100)::bigint then
    raise exception 'L’importo supera il debito o il credito disponibile';
  end if;

  insert into public.cashout_settlements (group_id, from_profile_id, to_profile_id, amount, created_by)
  values (p_group_id, p_from_profile_id, p_to_profile_id, amount_cents::numeric / 100, current_user_id)
  returning id into new_settlement_id;
  return new_settlement_id;
end;
$$;

revoke all on function public.create_cashout_group(text, uuid[]) from public, anon;
revoke all on function public.create_cashout_expense(uuid, text, numeric, jsonb, uuid[]) from public, anon;
revoke all on function public.record_cashout_settlement(uuid, uuid, uuid, numeric) from public, anon;
grant execute on function public.create_cashout_group(text, uuid[]) to authenticated;
grant execute on function public.create_cashout_expense(uuid, text, numeric, jsonb, uuid[]) to authenticated;
grant execute on function public.record_cashout_settlement(uuid, uuid, uuid, numeric) to authenticated;
