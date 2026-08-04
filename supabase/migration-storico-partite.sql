-- TheBoyz · migrazione: storico delle modifiche a una partita
-- Esegui questo file UNA SOLA VOLTA nel SQL Editor del progetto Supabase.
-- È idempotente: rilanciarlo non rompe nulla.
--
-- Perché serve una "discendenza".
-- Modificare una partita significa cancellarla e riregistrarla, perché è
-- l'unico modo per far ricalcolare l'Elo in ordine cronologico. Ogni modifica
-- quindi produce una riga nuova con un id nuovo: un registro agganciato
-- all'id della partita si perderebbe al primo ritocco. La colonna lineage_id
-- resta invece la stessa per tutta la vita della partita ed è lì che si
-- appende lo storico.

alter table public.matches
  add column if not exists lineage_id uuid;

-- Le partite già registrate diventano capostipite di sé stesse.
update public.matches
set lineage_id = id
where lineage_id is null;

create or replace function public.matches_set_lineage()
returns trigger
language plpgsql
as $$
begin
  new.lineage_id := coalesce(new.lineage_id, new.id);
  return new;
end;
$$;

drop trigger if exists matches_set_lineage on public.matches;
create trigger matches_set_lineage
before insert on public.matches
for each row execute function public.matches_set_lineage();

create index if not exists matches_lineage_idx on public.matches (lineage_id);

create table if not exists public.match_events (
  id uuid primary key default gen_random_uuid(),
  lineage_id uuid not null,
  match_id uuid,
  kind text not null check (kind in ('created', 'edited')),
  author_id uuid references public.profiles(id) on delete set null,
  comment text,
  summary text not null,
  created_at timestamptz not null default now()
);

create index if not exists match_events_lineage_idx
  on public.match_events (lineage_id, created_at);

alter table public.match_events enable row level security;

drop policy if exists "Membri leggono lo storico" on public.match_events;
create policy "Membri leggono lo storico"
on public.match_events for select
to authenticated
using (true);

-- Si scrive solo a proprio nome, e non si modifica né si cancella: uno
-- storico che si può riscrivere non è uno storico.
drop policy if exists "Membri scrivono lo storico" on public.match_events;
create policy "Membri scrivono lo storico"
on public.match_events for insert
to authenticated
with check (author_id = auth.uid());

revoke update, delete on public.match_events from anon, authenticated;
grant select, insert on public.match_events to authenticated;

-- Aggancia la partita riregistrata alla discendenza di quella sostituita.
create or replace function public.set_match_lineage(p_match_id uuid, p_lineage_id uuid)
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
  set lineage_id = p_lineage_id
  where id = p_match_id;
end;
$$;

revoke all on function public.set_match_lineage(uuid, uuid) from public;
grant execute on function public.set_match_lineage(uuid, uuid) to authenticated;

-- Le partite già in archivio ottengono la loro riga "Registrata", così lo
-- storico parte davvero dal primo risultato e non dalla prossima correzione.
insert into public.match_events (lineage_id, match_id, kind, author_id, summary, created_at)
select
  match_record.lineage_id,
  match_record.id,
  'created',
  match_record.created_by,
  coalesce(team_one.names, '?') || ' vs ' || coalesce(team_two.names, '?')
    || ' · ' || coalesce(set_scores.score, 'risultato non disponibile'),
  coalesce(match_record.created_at, match_record.played_at)
from public.matches as match_record
left join lateral (
  select string_agg(player_profile.display_name, ' · ' order by player_profile.display_name) as names
  from public.match_players as match_player
  join public.profiles as player_profile on player_profile.id = match_player.profile_id
  where match_player.match_id = match_record.id and match_player.team = 1
) as team_one on true
left join lateral (
  select string_agg(player_profile.display_name, ' · ' order by player_profile.display_name) as names
  from public.match_players as match_player
  join public.profiles as player_profile on player_profile.id = match_player.profile_id
  where match_player.match_id = match_record.id and match_player.team = 2
) as team_two on true
left join lateral (
  select string_agg(
    match_set.team1_games || '-' || match_set.team2_games, ' ' order by match_set.set_number
  ) as score
  from public.match_sets as match_set
  where match_set.match_id = match_record.id
) as set_scores on true
where not exists (
  select 1 from public.match_events as existing
  where existing.lineage_id = match_record.lineage_id
);

notify pgrst, 'reload schema';
