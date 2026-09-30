-- Pareggio 1-1: peso Elo doppio rispetto a un set secco (K=32).
-- Il terzo set interrotto resta nello storico ma non influenza il rating.

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
  completed_sets integer;
  team1_sets integer;
  team2_sets integer;
  opening_team1_sets integer;
  opening_team2_sets integer;
  team1_rating numeric;
  team2_rating numeric;
  set_probability numeric;
  match_probability numeric;
  weighted_wins numeric;
  weighted_all numeric;
  outcome_weight numeric;
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

    select
      count(*) filter (where not incomplete),
      count(*) filter (where not incomplete and team1_games > team2_games),
      count(*) filter (where not incomplete and team2_games > team1_games),
      count(*) filter (where set_number <= 2 and not incomplete
        and team1_games > team2_games),
      count(*) filter (where set_number <= 2 and not incomplete
        and team2_games > team1_games)
    into completed_sets, team1_sets, team2_sets,
      opening_team1_sets, opening_team2_sets
    from public.match_sets
    where match_id = replay_match.id;

    -- Nei vecchi referti puo esserci un terzo set giocato dopo un 2-0.
    -- Resta nello storico, ma il match e l'Elo sono gia chiusi al secondo.
    if greatest(opening_team1_sets, opening_team2_sets) = 2 then
      completed_sets := 2;
      team1_sets := opening_team1_sets;
      team2_sets := opening_team2_sets;
    end if;

    team1_delta := 0;
    if (replay_match.winner_team in (1, 2)
      and (completed_sets = 1 or (greatest(team1_sets, team2_sets) = 2
        and least(team1_sets, team2_sets) in (0, 1))))
      or (replay_match.winner_team = 0 and team1_sets = 1 and team2_sets = 1) then
      select avg(rating) into team1_rating
      from public.profiles where id = any(replay_team1);
      select avg(rating) into team2_rating
      from public.profiles where id = any(replay_team2);
      set_probability := 1.0 / (1.0 + power(10.0, (team2_rating - team1_rating) / 400.0));

      if replay_match.winner_team = 0 then
        -- Un 1-1 pesa come due set secchi, senza dipendere dall'ordine
        -- in cui i set sono stati vinti: K=32 contro K=16 del set secco.
        outcome_weight := 32.0;
        match_probability := set_probability;
      elsif completed_sets = 1 then
        outcome_weight := 16.0;
        match_probability := set_probability;
      else
        outcome_weight := case when least(team1_sets, team2_sets) = 0
          then 44.0 else 32.0 end;
        -- P(2-0)=p^2; P(2-1)=2p^2(1-p). I due pesi
        -- sono 44 e 32, ossia +22 e +16 quando p=0.5.
        weighted_wins := 44.0 * power(set_probability, 2)
          + 32.0 * 2 * power(set_probability, 2) * (1 - set_probability);
        weighted_all := 44.0 * (power(set_probability, 2)
            + power(1 - set_probability, 2))
          + 32.0 * 2 * set_probability * (1 - set_probability);
        match_probability := weighted_wins / weighted_all;
      end if;

      team1_delta := outcome_weight * replay_match.elo_multiplier
        * ((case when replay_match.winner_team = 1 then 1
            when replay_match.winner_team = 2 then 0 else 0.5 end)
          - match_probability);
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

      update public.profiles set rating = rating + team1_delta
      where id = any(replay_team1);
      update public.profiles set rating = rating - team1_delta
      where id = any(replay_team2);
    else
      -- Eventuali vecchi formati non piu inseribili restano valutati
      -- per set concluso, senza usare un parziale.
      for replay_set in
        select team1_games, team2_games
        from public.match_sets
        where match_id = replay_match.id and not incomplete
        order by set_number
      loop
        continue when replay_set.team1_games = replay_set.team2_games;
        select avg(rating) into team1_rating
        from public.profiles where id = any(replay_team1);
        select avg(rating) into team2_rating
        from public.profiles where id = any(replay_team2);
        set_probability := 1.0 / (1.0 + power(10.0, (team2_rating - team1_rating) / 400.0));
        set_delta := 16.0 * replay_match.elo_multiplier
          * ((case when replay_set.team1_games > replay_set.team2_games then 1 else 0 end)
            - set_probability);
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
    end if;

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
