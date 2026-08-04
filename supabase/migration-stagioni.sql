-- TheBoyz · migrazione: archivio delle stagioni di padel
-- Esegui questo file UNA SOLA VOLTA nel SQL Editor del progetto Supabase.
-- È idempotente: rilanciarlo non rompe nulla.
--
-- L'Elo non si azzera mai. Una stagione archiviata è quindi la fotografia
-- della classifica al momento della chiusura dell'anno, non i punti guadagnati
-- in quei dodici mesi. È esattamente ciò che serve per rivedere "com'era".

create table if not exists public.padel_season_standings (
  season smallint not null,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  position smallint not null,
  rating integer not null,
  matches_played integer not null,
  wins integer not null,
  losses integer not null,
  current_streak integer not null,
  archived_at timestamptz not null default now(),
  primary key (season, profile_id)
);

create index if not exists padel_season_standings_season_idx
  on public.padel_season_standings (season desc, position);

alter table public.padel_season_standings enable row level security;

drop policy if exists "Membri leggono le stagioni" on public.padel_season_standings;
create policy "Membri leggono le stagioni"
on public.padel_season_standings for select
to authenticated
using (true);

-- Nessuno scrive a mano: si passa solo dalla funzione qui sotto.
revoke insert, update, delete on public.padel_season_standings from anon, authenticated;
grant select on public.padel_season_standings to authenticated;

-- Sigilla una stagione conclusa. Chiamabile a ogni avvio dell'app senza
-- effetti collaterali: se la stagione è già archiviata, o non è ancora finita,
-- o non ha partite, la funzione esce senza fare nulla.
create or replace function public.archive_padel_season(p_season smallint)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Devi accedere per archiviare una stagione';
  end if;

  -- Mai la stagione in corso: si archivia solo ciò che è concluso.
  if p_season >= extract(year from now())::smallint then
    return false;
  end if;

  if exists (select 1 from public.padel_season_standings where season = p_season) then
    return false;
  end if;

  if not exists (
    select 1 from public.matches
    where extract(year from played_at)::smallint = p_season
  ) then
    return false;
  end if;

  insert into public.padel_season_standings (
    season, profile_id, position, rating, matches_played, wins, losses, current_streak
  )
  select
    p_season,
    player.id,
    row_number() over (order by player.rating desc, player.display_name)::smallint,
    player.rating,
    player.matches_played,
    player.wins,
    player.losses,
    player.current_streak
  from public.profiles as player
  where player.matches_played > 0;

  return true;
end;
$$;

revoke all on function public.archive_padel_season(smallint) from public;
grant execute on function public.archive_padel_season(smallint) to authenticated;

notify pgrst, 'reload schema';
