-- Premi individuali: +30 al primo, +20 al secondo, +10 al terzo.
-- Il replay cronologico aggiorna anche i tornei già conclusi e le partite successive.
begin;

create or replace function public.tournament_elo_awards(p_tournament_id uuid)
returns table(profile_id uuid, points integer)
language sql stable security definer set search_path = public, pg_temp as $$
  with t as (select mode,target_matches from public.padel_tournaments where id=p_tournament_id),
  finished as (
    select 1 from public.tournament_fixtures f, t
    where f.tournament_id=p_tournament_id
    having count(*)>0 and count(*) filter(where f.match_id is null)=0
      and count(*)=coalesce(max(t.target_matches),count(*))
  )
  select team_player.id, case standing.team_position when 1 then 30 else 15 end
  from public.tournament_standings(p_tournament_id) standing
  join public.tournament_teams team on team.id=standing.team_id
  cross join lateral (values(team.player_a),(team.player_b)) team_player(id)
  where standing.team_position in (1,2) and exists(select 1 from finished)
    and exists(select 1 from t where mode='teams')
  union all
  select standing.profile_id, case standing.rank_position when 1 then 30 when 2 then 20 else 10 end
  from public.individual_tournament_standings(p_tournament_id) standing
  where standing.rank_position in (1,2,3) and exists(select 1 from finished)
    and exists(select 1 from t where mode='individual');
$$;
revoke all on function public.tournament_elo_awards(uuid) from public, anon;
grant execute on function public.tournament_elo_awards(uuid) to authenticated;

select public.recalculate_padel_ratings();
notify pgrst, 'reload schema';
commit;
