-- Partite organizzate prima di conoscere il risultato.
-- Eseguire dopo migration-pareggi.sql: complete_random_match riusa la stessa
-- funzione record_match, quindi Elo, pareggi, MVP e storico restano coerenti.

create table if not exists public.planned_matches (
  id uuid primary key default gen_random_uuid(),
  played_at timestamptz not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  court text,
  notes text,
  created_at timestamptz not null default now(),
  constraint planned_matches_court_length check (court is null or char_length(court) <= 60)
);

create table if not exists public.planned_match_players (
  planned_match_id uuid not null references public.planned_matches(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  team smallint not null check (team in (1, 2)),
  primary key (planned_match_id, profile_id)
);

create index if not exists planned_matches_played_at_idx
  on public.planned_matches (played_at, created_at);
create index if not exists planned_match_players_profile_idx
  on public.planned_match_players (profile_id);

alter table public.planned_matches enable row level security;
alter table public.planned_match_players enable row level security;

drop policy if exists "planned matches readable by members" on public.planned_matches;
create policy "planned matches readable by members"
on public.planned_matches for select
to authenticated
using (exists (select 1 from public.profiles where id = auth.uid()));

drop policy if exists "planned match players readable by members" on public.planned_match_players;
create policy "planned match players readable by members"
on public.planned_match_players for select
to authenticated
using (exists (select 1 from public.profiles where id = auth.uid()));

grant select on public.planned_matches to authenticated;
grant select on public.planned_match_players to authenticated;

create or replace function public.create_random_match(
  p_played_at timestamptz,
  p_participants uuid[],
  p_court text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  shuffled uuid[];
  new_planned_match_id uuid := gen_random_uuid();
begin
  if current_user_id is null or not exists (
    select 1 from public.profiles where id = current_user_id
  ) then
    raise exception 'Devi accedere per creare una partita';
  end if;

  if cardinality(p_participants) <> 4
     or (select count(distinct participant) from unnest(p_participants) participant) <> 4 then
    raise exception 'Seleziona esattamente quattro partecipanti diversi';
  end if;

  if (select count(*) from public.profiles where id = any(p_participants)) <> 4 then
    raise exception 'Uno o piu partecipanti non appartengono al gruppo';
  end if;

  select array_agg(participant order by random())
  into shuffled
  from unnest(p_participants) participant;

  insert into public.planned_matches (id, played_at, created_by, court, notes)
  values (
    new_planned_match_id,
    p_played_at,
    current_user_id,
    nullif(trim(p_court), ''),
    nullif(trim(p_notes), '')
  );

  insert into public.planned_match_players (planned_match_id, profile_id, team)
  select
    new_planned_match_id,
    shuffled[position],
    case when position <= 2 then 1 else 2 end
  from generate_series(1, 4) position;

  return new_planned_match_id;
end;
$$;

revoke all on function public.create_random_match(timestamptz, uuid[], text, text) from public;
grant execute on function public.create_random_match(timestamptz, uuid[], text, text) to authenticated;

create or replace function public.complete_random_match(
  p_planned_match_id uuid,
  p_sets jsonb,
  p_notes text default null,
  p_video_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  planned public.planned_matches%rowtype;
  team1 uuid[];
  team2 uuid[];
  new_match_id uuid;
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles where id = auth.uid()
  ) then
    raise exception 'Devi accedere per inserire il risultato';
  end if;

  select * into planned
  from public.planned_matches
  where id = p_planned_match_id
  for update;

  if not found then
    raise exception 'Partita da giocare non trovata';
  end if;

  select array_agg(profile_id order by profile_id)
  into team1
  from public.planned_match_players
  where planned_match_id = p_planned_match_id and team = 1;

  select array_agg(profile_id order by profile_id)
  into team2
  from public.planned_match_players
  where planned_match_id = p_planned_match_id and team = 2;

  if cardinality(team1) <> 2 or cardinality(team2) <> 2 then
    raise exception 'Le squadre della partita non sono complete';
  end if;

  new_match_id := public.record_match(
    planned.played_at,
    team1,
    team2,
    p_sets,
    coalesce(nullif(trim(p_notes), ''), planned.notes),
    nullif(trim(p_video_url), '')
  );

  -- La colonna court e facoltativa nelle installazioni piu vecchie.
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'matches' and column_name = 'court'
  ) then
    execute 'update public.matches set court = $1 where id = $2'
      using planned.court, new_match_id;
  end if;

  -- Sparisce dall'elenco "da giocare" solo dopo che record_match ha
  -- completato con successo. Essendo la stessa transazione non puo restare
  -- un risultato orfano o una partita duplicata.
  delete from public.planned_matches where id = p_planned_match_id;

  return new_match_id;
end;
$$;

revoke all on function public.complete_random_match(uuid, jsonb, text, text) from public;
grant execute on function public.complete_random_match(uuid, jsonb, text, text) to authenticated;
