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

alter table public.cashout_groups enable row level security;
alter table public.cashout_group_members enable row level security;
alter table public.cashout_expenses enable row level security;
alter table public.cashout_expense_payers enable row level security;
alter table public.cashout_expense_shares enable row level security;

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

revoke all on public.cashout_groups from anon, authenticated;
revoke all on public.cashout_group_members from anon, authenticated;
revoke all on public.cashout_expenses from anon, authenticated;
revoke all on public.cashout_expense_payers from anon, authenticated;
revoke all on public.cashout_expense_shares from anon, authenticated;
grant select on public.cashout_groups to authenticated;
grant select on public.cashout_group_members to authenticated;
grant select on public.cashout_expenses to authenticated;
grant select on public.cashout_expense_payers to authenticated;
grant select on public.cashout_expense_shares to authenticated;

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

  -- Chi ha anticipato almeno la propria quota non ha alcun debito da saldare.
  update public.cashout_expense_shares share
  set settled_at = now(), settled_by = current_user_id
  where share.expense_id = new_expense_id
    and share.amount <= coalesce((
      select payer.amount from public.cashout_expense_payers payer
      where payer.expense_id = new_expense_id and payer.profile_id = share.profile_id
    ), 0);

  update public.cashout_expenses expense
  set closed_at = now()
  where expense.id = new_expense_id
    and not exists (
      select 1 from public.cashout_expense_shares share
      where share.expense_id = new_expense_id and share.settled_at is null
    );

  return new_expense_id;
end;
$$;

create or replace function public.set_cashout_share_settled(
  p_expense_id uuid,
  p_profile_id uuid,
  p_settled boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  expense_owner uuid;
  share_amount numeric;
  paid_amount numeric;
begin
  select created_by into expense_owner from public.cashout_expenses where id = p_expense_id;
  if current_user_id is null or expense_owner is distinct from current_user_id then
    raise exception 'Solo chi ha creato la spesa può aggiornare i saldi';
  end if;

  select amount into share_amount from public.cashout_expense_shares
  where expense_id = p_expense_id and profile_id = p_profile_id;
  if share_amount is null then raise exception 'Quota non trovata'; end if;
  select coalesce(sum(amount), 0) into paid_amount from public.cashout_expense_payers
  where expense_id = p_expense_id and profile_id = p_profile_id;
  if share_amount <= paid_amount and not p_settled then
    raise exception 'Questa persona non ha un debito sulla spesa';
  end if;

  update public.cashout_expense_shares
  set settled_at = case when p_settled then now() else null end,
      settled_by = case when p_settled then current_user_id else null end
  where expense_id = p_expense_id and profile_id = p_profile_id;

  update public.cashout_expenses expense
  set closed_at = case
    when exists (
      select 1 from public.cashout_expense_shares share
      where share.expense_id = p_expense_id and share.settled_at is null
    ) then null else coalesce(expense.closed_at, now()) end
  where expense.id = p_expense_id;
end;
$$;

revoke all on function public.create_cashout_group(text, uuid[]) from public, anon;
revoke all on function public.create_cashout_expense(uuid, text, numeric, jsonb, uuid[]) from public, anon;
revoke all on function public.set_cashout_share_settled(uuid, uuid, boolean) from public, anon;
grant execute on function public.create_cashout_group(text, uuid[]) to authenticated;
grant execute on function public.create_cashout_expense(uuid, text, numeric, jsonb, uuid[]) to authenticated;
grant execute on function public.set_cashout_share_settled(uuid, uuid, boolean) to authenticated;
