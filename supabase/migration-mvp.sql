-- TheBoyz · migrazione: votazione MVP delle partite
-- Esegui questo file UNA SOLA VOLTA nel SQL Editor del progetto Supabase.
-- È idempotente: può essere rilanciato senza modificare le partite nuove.
--
-- La colonna viene aggiunta con default FALSE: in questo modo tutte le
-- partite già presenti al momento della prima esecuzione restano escluse.
-- Subito dopo il default passa a TRUE e vale soltanto per i nuovi risultati.

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'matches'
      and column_name = 'mvp_voting_enabled'
  ) then
    alter table public.matches
      add column mvp_voting_enabled boolean not null default false;
  end if;
end;
$$;

alter table public.matches
  alter column mvp_voting_enabled set default true;

alter table public.matches
  add column if not exists mvp_voting_closed_at timestamptz;

create table if not exists public.match_mvp_votes (
  match_id uuid not null references public.matches(id) on delete cascade,
  voter_id uuid not null references public.profiles(id) on delete cascade,
  target_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (match_id, voter_id)
);

create index if not exists match_mvp_votes_target_idx
  on public.match_mvp_votes (match_id, target_id);

create table if not exists public.match_mvps (
  match_id uuid not null references public.matches(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  awarded_at timestamptz not null default now(),
  primary key (match_id, profile_id)
);

create index if not exists match_mvps_profile_idx
  on public.match_mvps (profile_id, awarded_at desc);

create unique index if not exists match_mvps_one_winner_idx
  on public.match_mvps (match_id);

alter table public.match_mvp_votes enable row level security;
alter table public.match_mvps enable row level security;

-- Ognuno può rileggere soltanto il proprio voto. Agli altri arrivano il
-- semplice avanzamento e, alla chiusura, il nome o i nomi degli MVP.
drop policy if exists "Ognuno rilegge il proprio voto MVP" on public.match_mvp_votes;
create policy "Ognuno rilegge il proprio voto MVP"
on public.match_mvp_votes for select
to authenticated
using (voter_id = auth.uid());

drop policy if exists "Membri leggono gli MVP assegnati" on public.match_mvps;
create policy "Membri leggono gli MVP assegnati"
on public.match_mvps for select
to authenticated
using (true);

revoke insert, update, delete on public.match_mvp_votes from anon, authenticated;
revoke insert, update, delete on public.match_mvps from anon, authenticated;
grant select on public.match_mvp_votes, public.match_mvps to authenticated;

-- Espone solo quanti hanno votato, mai chi ha votato chi.
create or replace function public.match_mvp_progress()
returns table (match_id uuid, votes_cast integer, total_voters integer)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select
    match_record.id,
    count(distinct vote.voter_id)::integer,
    count(distinct player.profile_id)::integer
  from public.matches as match_record
  join public.match_players as player on player.match_id = match_record.id
  left join public.match_mvp_votes as vote on vote.match_id = match_record.id
  where match_record.mvp_voting_enabled
  group by match_record.id;
$$;

drop function if exists public.vote_match_mvp(uuid, uuid);

create function public.vote_match_mvp(
  p_match_id uuid,
  p_target_id uuid
)
returns table (
  is_awarded boolean,
  is_closed boolean,
  winner_ids uuid[],
  votes_cast integer,
  total_voters integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  current_winners uuid[];
  v_votes_cast integer;
  v_total_voters integer;
  v_top_votes integer;
  v_leader_count integer;
begin
  if current_user_id is null then
    raise exception 'Devi accedere per votare l''MVP';
  end if;

  perform pg_advisory_xact_lock(hashtext('match_mvp:' || p_match_id::text));

  if not exists (
    select 1 from public.matches
    where id = p_match_id
      and mvp_voting_enabled
      and mvp_voting_closed_at is null
  ) then
    raise exception 'La votazione MVP non è disponibile o è già chiusa';
  end if;

  select array_agg(profile_id order by profile_id)
  into current_winners
  from public.match_mvps
  where match_id = p_match_id;

  if coalesce(cardinality(current_winners), 0) > 0 then
    raise exception 'L''MVP di questa partita è già stato assegnato';
  end if;

  if not exists (
    select 1 from public.match_players
    where match_id = p_match_id and profile_id = current_user_id
  ) then
    raise exception 'Solo chi ha giocato la partita può votare';
  end if;

  if not exists (
    select 1 from public.match_players
    where match_id = p_match_id and profile_id = p_target_id
  ) then
    raise exception 'Puoi votare soltanto uno dei partecipanti alla partita';
  end if;

  if p_target_id = current_user_id then
    raise exception 'Non puoi votare te stesso come MVP';
  end if;

  insert into public.match_mvp_votes (match_id, voter_id, target_id)
  values (p_match_id, current_user_id, p_target_id)
  on conflict (match_id, voter_id) do update set
    target_id = excluded.target_id,
    updated_at = now();

  select count(*)::integer
  into v_votes_cast
  from public.match_mvp_votes
  where match_id = p_match_id;

  select count(*)::integer
  into v_total_voters
  from public.match_players
  where match_id = p_match_id;

  select coalesce(max(target_votes), 0)::integer
  into v_top_votes
  from (
    select count(*)::integer as target_votes
    from public.match_mvp_votes
    where match_id = p_match_id
    group by target_id
  ) as totals;

  if v_top_votes >= 3 then
    select array_agg(target_id order by target_id)
    into current_winners
    from (
      select target_id
      from public.match_mvp_votes
      where match_id = p_match_id
      group by target_id
      having count(*) = v_top_votes
    ) as leaders;

    insert into public.match_mvps (match_id, profile_id)
    select p_match_id, winner_id
    from unnest(current_winners) as winner(winner_id)
    on conflict do nothing;

    update public.matches
    set mvp_voting_closed_at = now()
    where id = p_match_id;
  elsif v_votes_cast >= v_total_voters then
    select count(*)::integer
    into v_leader_count
    from (
      select target_id
      from public.match_mvp_votes
      where match_id = p_match_id
      group by target_id
      having count(*) = v_top_votes
    ) as leaders;

    -- A votazione completa il vincitore deve essere unico. In caso di
    -- parità si chiude senza assegnare alcun MVP.
    if v_leader_count = 1 then
      select array_agg(target_id order by target_id)
      into current_winners
      from (
        select target_id
        from public.match_mvp_votes
        where match_id = p_match_id
        group by target_id
        having count(*) = v_top_votes
      ) as leaders;

      insert into public.match_mvps (match_id, profile_id)
      select p_match_id, winner_id
      from unnest(current_winners) as winner(winner_id)
      on conflict do nothing;
    end if;

    update public.matches
    set mvp_voting_closed_at = now()
    where id = p_match_id;
  end if;

  return query select
    coalesce(cardinality(current_winners), 0) > 0,
    v_top_votes >= 3 or v_votes_cast >= v_total_voters,
    coalesce(current_winners, array[]::uuid[]),
    v_votes_cast,
    v_total_voters;
end;
$$;

-- Quando si corregge una vecchia partita, il frontend la ricrea per
-- ricalcolare l'Elo. Questa funzione conserva l'esclusione storica anche sul
-- nuovo record, ma può soltanto disabilitare e soltanto chi lo ha creato.
create or replace function public.disable_match_mvp_voting(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Devi accedere per modificare una partita';
  end if;

  update public.matches
  set mvp_voting_enabled = false
  where id = p_match_id
    and created_by = auth.uid()
    and not exists (select 1 from public.match_mvp_votes where match_id = p_match_id)
    and not exists (select 1 from public.match_mvps where match_id = p_match_id);
end;
$$;

revoke all on function public.match_mvp_progress() from public;
revoke all on function public.vote_match_mvp(uuid, uuid) from public;
revoke all on function public.disable_match_mvp_voting(uuid) from public;
grant execute on function public.match_mvp_progress() to authenticated;
grant execute on function public.vote_match_mvp(uuid, uuid) to authenticated;
grant execute on function public.disable_match_mvp_voting(uuid) to authenticated;

notify pgrst, 'reload schema';
