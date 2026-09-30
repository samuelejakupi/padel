-- Ogni set concluso applica lo stesso aggiornamento Elo di una partita
-- da un set, nello stesso ordine. Un set interrotto rimane nello storico
-- ma non influenza l'Elo. I premi dei tornei restano separati e vengono
-- accreditati alla partita conclusiva del torneo.

begin;

create or replace function public.recalculate_padel_ratings()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  replay_match record;
  replay_set record;
  replay_team1 uuid[];
  replay_team2 uuid[];
  team1_rating numeric;
  team2_rating numeric;
  expected_team1 numeric;
  set_delta numeric;
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

    team1_delta := 0;
    for replay_set in
      select team1_games, team2_games
      from public.match_sets
      where match_id = replay_match.id and not incomplete
      order by set_number
    loop
      -- Un eventuale set senza vincitore non apporta informazione Elo.
      continue when replay_set.team1_games = replay_set.team2_games;

      select avg(rating) into team1_rating
      from public.profiles where id = any(replay_team1);
      select avg(rating) into team2_rating
      from public.profiles where id = any(replay_team2);
      expected_team1 := 1.0 / (1.0 + power(10.0, (team2_rating - team1_rating) / 400.0));
      set_delta := 16.0 * replay_match.elo_multiplier
        * ((case when replay_set.team1_games > replay_set.team2_games then 1 else 0 end)
          - expected_team1);

      -- Il limite minimo agisce su ciascun set come farebbe se i set
      -- fossero stati registrati in partite singole consecutive.
      if set_delta > 0 then
        select min(greatest(rating - 100, 0)) into loss_capacity
        from public.profiles where id = any(replay_team2);
        set_delta := least(set_delta, loss_capacity);
      elsif set_delta < 0 then
        select min(greatest(rating - 100, 0)) into loss_capacity
        from public.profiles where id = any(replay_team1);
        set_delta := -least(abs(set_delta), loss_capacity);
      end if;
      set_delta := round(set_delta, 4);

      update public.profiles set rating = rating + set_delta
      where id = any(replay_team1);
      update public.profiles set rating = rating - set_delta
      where id = any(replay_team2);
      team1_delta := team1_delta + set_delta;
    end loop;

    -- Lo storico espone un unico delta e una sola presenza per partita,
    -- anche se il rating e stato aggiornato dopo ogni set.
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
          rating_before = current_player.rating - applied_delta,
          rating_after = current_player.rating
      where match_id = replay_match.id and profile_id = current_player.id;

      update public.profiles
      set matches_played = matches_played + 1,
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

    update public.matches set rating_delta = abs(team1_delta)
    where id = replay_match.id;

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
