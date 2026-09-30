-- L'Elo stima la probabilita di vincere un set. Nei match da tre set
-- il risultato (2-1 / 3-0) ha pesi diversi: il pronostico deve quindi
-- essere pesato allo stesso modo, altrimenti i favoriti guadagnano Elo
-- anche quando la loro probabilita per set e gia corretta.
-- Il trasferimento e arrotondato una sola volta a 4 decimali e applicato
-- con segno opposto alle due squadre, mantenendo la somma a zero.

begin;

alter table public.profiles alter column rating type numeric(12,4) using round(rating,4);
alter table public.matches alter column rating_delta type numeric(12,4) using round(rating_delta,4);
alter table public.match_players alter column rating_delta type numeric(12,4) using round(rating_delta,4);
alter table public.match_players alter column rating_before type numeric(12,4) using round(rating_before,4);
alter table public.match_players alter column rating_after type numeric(12,4) using round(rating_after,4);
alter table public.padel_season_standings alter column rating type numeric(12,4) using round(rating,4);

create or replace function public.recalculate_padel_ratings()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  replay_match record;
  replay_team1 uuid[];
  replay_team2 uuid[];
  match_sets_json jsonb;
  completed_set_count integer;
  team1_rating numeric;
  team2_rating numeric;
  expected_team1 numeric;
  actual_team1 numeric;
  elo_weight numeric;
  three_set_sweep_probability numeric;
  three_set_split_probability numeric;
  weighted_win_probability numeric;
  weighted_total_probability numeric;
  team1_delta numeric;
  loss_capacity numeric;
  current_player record;
  applied_delta numeric;
  player_won boolean;
  closing_matches uuid[];
  award record;
begin
  perform pg_advisory_xact_lock(hashtext('theboyz_padel_results'));
  perform 1 from public.profiles order by id for update;

  update public.profiles
  set rating = 1000, matches_played = 0, wins = 0, losses = 0,
      draws = 0, current_streak = 0
  where true;

  select coalesce(array_agg(closing_match), '{}')
  into closing_matches
  from (
    select public.tournament_closing_match(id) as closing_match
    from public.padel_tournaments
  ) as tournaments
  where closing_match is not null;

  for replay_match in
    select id, winner_team, coalesce(elo_multiplier, 1) as elo_multiplier
    from public.matches
    order by played_at, created_at, id
  loop
    select
      array_agg(profile_id order by profile_id) filter (where team = 1),
      array_agg(profile_id order by profile_id) filter (where team = 2)
    into replay_team1, replay_team2
    from public.match_players
    where match_id = replay_match.id;

    continue when replay_team1 is null or replay_team2 is null
      or cardinality(replay_team1) <> 2 or cardinality(replay_team2) <> 2;

    select jsonb_agg(
      jsonb_build_object(
        'team1_games', team1_games,
        'team2_games', team2_games,
        'incomplete', incomplete
      ) order by set_number
    ), count(*) filter (where not incomplete)
    into match_sets_json, completed_set_count
    from public.match_sets
    where match_id = replay_match.id;

    elo_weight := case when match_sets_json is null then 1.0
      else public.padel_elo_weight(match_sets_json, replay_match.winner_team) end;
    actual_team1 := case
      when replay_match.winner_team = 1 then 1.0
      when replay_match.winner_team = 2 then 0.0
      when match_sets_json is null then 0.5
      else 0.5 + public.padel_draw_tilt(match_sets_json)
    end;

    select avg(rating) into team1_rating from public.profiles where id = any(replay_team1);
    select avg(rating) into team2_rating from public.profiles where id = any(replay_team2);
    expected_team1 := 1.0 / (1.0 + power(10.0, (team2_rating - team1_rating) / 400.0));

    if completed_set_count = 3 and replay_match.winner_team <> 0 then
      -- p e la probabilita di vincere un singolo set. P(3-0)=p^3,
      -- P(2-1)=3p^2(1-p). Il pronostico condizionato al peso elimina
      -- la deriva dei favoriti senza cambiare i delta a parita di Elo.
      three_set_sweep_probability := power(expected_team1, 3)
        + power(1 - expected_team1, 3);
      three_set_split_probability := 3 * expected_team1 * (1 - expected_team1);
      weighted_win_probability := 1.125 * power(expected_team1, 3)
        + 0.8125 * 3 * power(expected_team1, 2) * (1 - expected_team1);
      weighted_total_probability := 1.125 * three_set_sweep_probability
        + 0.8125 * three_set_split_probability;
      expected_team1 := weighted_win_probability / weighted_total_probability;
    end if;

    team1_delta := 32.0 * replay_match.elo_multiplier * elo_weight
      * (actual_team1 - expected_team1);

    if team1_delta > 0 then
      select min(greatest(rating - 100, 0)) into loss_capacity
      from public.profiles where id = any(replay_team2);
      team1_delta := least(team1_delta, loss_capacity);
    elsif team1_delta < 0 then
      select min(greatest(rating - 100, 0)) into loss_capacity
      from public.profiles where id = any(replay_team1);
      team1_delta := -least(abs(team1_delta), loss_capacity);
    end if;
    team1_delta := round(team1_delta, 4);

    for current_player in
      select id, rating from public.profiles
      where id = any(replay_team1 || replay_team2)
      order by id
    loop
      applied_delta := case when current_player.id = any(replay_team1)
        then team1_delta else -team1_delta end;
      player_won := replay_match.winner_team <> 0 and (
        (replay_match.winner_team = 1 and current_player.id = any(replay_team1))
        or (replay_match.winner_team = 2 and current_player.id = any(replay_team2))
      );

      update public.match_players
      set rating_delta = applied_delta,
          rating_before = current_player.rating,
          rating_after = current_player.rating + applied_delta
      where match_id = replay_match.id and profile_id = current_player.id;

      update public.profiles
      set rating = rating + applied_delta,
          matches_played = matches_played + 1,
          wins = wins + case when player_won then 1 else 0 end,
          losses = losses + case when replay_match.winner_team = 0 or player_won then 0 else 1 end,
          draws = draws + case when replay_match.winner_team = 0 then 1 else 0 end,
          current_streak = case
            when replay_match.winner_team = 0 then current_streak
            when player_won then case when current_streak >= 0 then current_streak + 1 else 1 end
            else case when current_streak <= 0 then current_streak - 1 else -1 end
          end
      where id = current_player.id;
    end loop;

    update public.matches set rating_delta = abs(team1_delta) where id = replay_match.id;

    if replay_match.id = any(closing_matches) then
      for award in
        select prize.profile_id, prize.points
        from public.padel_tournaments as tournament
        cross join lateral public.tournament_elo_awards(tournament.id) as prize
        where public.tournament_closing_match(tournament.id) = replay_match.id
      loop
        update public.profiles set rating = rating + award.points
        where id = award.profile_id;
      end loop;
    end if;
  end loop;
end;
$$;

revoke all on function public.recalculate_padel_ratings() from public, anon;
grant execute on function public.recalculate_padel_ratings() to authenticated;

select public.recalculate_padel_ratings();
notify pgrst, 'reload schema';

commit;
