-- Dopo migration-tornei-individuali-premi-30-20-10.sql.
-- Scontri diretti: mini-classifica fra tutti i giocatori a pari vittorie,
-- esclusi i confronti in cui sono compagni. L'ordine d'iscrizione non assegna premi.
begin;

create or replace function public.individual_tournament_standings(p_tournament_id uuid)
returns table(profile_id uuid, rank_position integer, played bigint, wins bigint, games_won bigint, games_lost bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  with scores as (
    select f.*, m.winner_team, s.team1_games, s.team2_games
    from public.tournament_fixtures f
    join public.matches m on m.id=f.match_id
    join public.match_sets s on s.match_id=m.id and s.set_number=1
    where f.tournament_id=p_tournament_id
  ), totals as (
    select p.profile_id,p.sort_order,count(s.id) as played,
      count(s.id) filter(where
        (p.profile_id in (s.player1_id,s.player2_id) and s.winner_team=1) or
        (p.profile_id in (s.player3_id,s.player4_id) and s.winner_team=2)) as wins,
      coalesce(sum(case when p.profile_id in (s.player1_id,s.player2_id) then s.team1_games
                       when p.profile_id in (s.player3_id,s.player4_id) then s.team2_games end),0)::bigint as games_won,
      coalesce(sum(case when p.profile_id in (s.player1_id,s.player2_id) then s.team2_games
                       when p.profile_id in (s.player3_id,s.player4_id) then s.team1_games end),0)::bigint as games_lost
    from public.tournament_participants p
    left join scores s on p.profile_id in (s.player1_id,s.player2_id,s.player3_id,s.player4_id)
    where p.tournament_id=p_tournament_id
    group by p.profile_id,p.sort_order
  ), direct as (
    select t.profile_id,
      count(s.id) filter(where
        (t.profile_id in (s.player1_id,s.player2_id) and s.winner_team=1) or
        (t.profile_id in (s.player3_id,s.player4_id) and s.winner_team=2)) as direct_wins,
      coalesce(sum(case when t.profile_id in (s.player1_id,s.player2_id) then s.team1_games-s.team2_games
                       when t.profile_id in (s.player3_id,s.player4_id) then s.team2_games-s.team1_games end),0) as direct_difference
    from totals t
    left join totals rival on rival.profile_id<>t.profile_id and rival.wins=t.wins
    left join scores s on
      (t.profile_id in (s.player1_id,s.player2_id) and rival.profile_id in (s.player3_id,s.player4_id)) or
      (t.profile_id in (s.player3_id,s.player4_id) and rival.profile_id in (s.player1_id,s.player2_id))
    group by t.profile_id
  ), ranked as (
    select t.*,rank() over(order by t.wins desc,d.direct_wins desc,
      t.games_won-t.games_lost desc,d.direct_difference desc,t.games_won desc)::integer as position
    from totals t join direct d using(profile_id)
  )
  select profile_id,position,played,wins,games_won,games_lost
  from ranked order by position,sort_order;
$$;
revoke all on function public.individual_tournament_standings(uuid) from public, anon;
grant execute on function public.individual_tournament_standings(uuid) to authenticated;

-- Il premio condiviso può essere frazionario; stessa precisione dell'Elo.
drop function public.tournament_elo_awards(uuid);
create function public.tournament_elo_awards(p_tournament_id uuid)
returns table(profile_id uuid, points numeric)
language sql stable security definer set search_path = public, pg_temp as $$
  with t as (select mode,target_matches from public.padel_tournaments where id=p_tournament_id),
  finished as (
    select 1 from public.tournament_fixtures f, t
    where f.tournament_id=p_tournament_id
    having count(*)>0 and count(*) filter(where f.match_id is null)=0
      and count(*)=coalesce(max(t.target_matches),count(*))
  ), individual as (
    select s.*,count(*) over(partition by rank_position) as tied_count
    from public.individual_tournament_standings(p_tournament_id) s
  )
  select team_player.id, case standing.team_position when 1 then 30 else 15 end::numeric
  from public.tournament_standings(p_tournament_id) standing
  join public.tournament_teams team on team.id=standing.team_id
  cross join lateral (values(team.player_a),(team.player_b)) team_player(id)
  where standing.team_position in (1,2) and exists(select 1 from finished)
    and exists(select 1 from t where mode='teams')
  union all
  select s.profile_id,round(prize.total/s.tied_count,4)
  from individual s
  cross join lateral (
    select sum(case slot when 1 then 30 when 2 then 20 when 3 then 10 else 0 end)::numeric as total
    from generate_series(s.rank_position::bigint,s.rank_position+s.tied_count-1) slot
  ) prize
  where s.rank_position<=3 and exists(select 1 from finished)
    and exists(select 1 from t where mode='individual');
$$;
revoke all on function public.tournament_elo_awards(uuid) from public, anon;
grant execute on function public.tournament_elo_awards(uuid) to authenticated;

select public.recalculate_padel_ratings();
notify pgrst, 'reload schema';
commit;
