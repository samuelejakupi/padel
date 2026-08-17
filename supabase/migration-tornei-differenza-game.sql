-- TheBoyz · spareggio dei tornei con differenza game.
-- Esegui dopo migration-tornei-premio-elo.sql.
--
-- A parita di vittorie e scontri diretti conta la differenza fra game vinti
-- e game subiti. I game vinti e l'ordine di iscrizione restano gli ultimi
-- criteri di spareggio. Il ricalcolo finale riallinea anche i premi Elo dei
-- tornei gia conclusi.

create or replace function public.tournament_standings(p_tournament_id uuid)
returns table (team_id uuid, team_position integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with results as (
    select
      fixture.team1_id,
      fixture.team2_id,
      partita.winner_team,
      coalesce((
        select sum(gioco.team1_games)
        from public.match_sets as gioco
        where gioco.match_id = partita.id
      ), 0) as team1_games,
      coalesce((
        select sum(gioco.team2_games)
        from public.match_sets as gioco
        where gioco.match_id = partita.id
      ), 0) as team2_games
    from public.tournament_fixtures as fixture
    join public.matches as partita on partita.id = fixture.match_id
    where fixture.tournament_id = p_tournament_id
  ),
  per_team as (
    select
      squadra.id,
      squadra.sort_order,
      coalesce(sum(case
        when esito.team1_id = squadra.id and esito.winner_team = 1 then 1
        when esito.team2_id = squadra.id and esito.winner_team = 2 then 1
        else 0
      end), 0) as wins,
      coalesce(sum(case
        when esito.team1_id = squadra.id then esito.team1_games
        when esito.team2_id = squadra.id then esito.team2_games
        else 0
      end), 0) as games_won,
      coalesce(sum(case
        when esito.team1_id = squadra.id then esito.team2_games
        when esito.team2_id = squadra.id then esito.team1_games
        else 0
      end), 0) as games_lost
    from public.tournament_teams as squadra
    left join results as esito
      on esito.team1_id = squadra.id or esito.team2_id = squadra.id
    where squadra.tournament_id = p_tournament_id
    group by squadra.id, squadra.sort_order
  ),
  direct as (
    select
      squadra.id,
      coalesce((
        select count(*)
        from results as esito
        join per_team as prima on prima.id = esito.team1_id
        join per_team as seconda on seconda.id = esito.team2_id
        where prima.wins = seconda.wins
          and (
            (esito.team1_id = squadra.id and esito.winner_team = 1)
            or (esito.team2_id = squadra.id and esito.winner_team = 2)
          )
      ), 0) as direct_wins
    from per_team as squadra
  )
  select
    per_team.id,
    row_number() over (
      order by
        per_team.wins desc,
        direct.direct_wins desc,
        (per_team.games_won - per_team.games_lost) desc,
        per_team.games_won desc,
        per_team.sort_order
    )::integer
  from per_team
  join direct on direct.id = per_team.id;
$$;

revoke all on function public.tournament_standings(uuid)
  from public, anon, authenticated;
grant execute on function public.tournament_standings(uuid) to authenticated;

-- La classifica appena cambiata decide anche chi riceve +30 e +15.
select public.recalculate_padel_ratings();

notify pgrst, 'reload schema';
