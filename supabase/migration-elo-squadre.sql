-- TheBoyz · migrazione: ELO V3 basato sulla forza delle coppie
-- Esegui questo file nel SQL Editor di Supabase.
-- È idempotente: puo essere rilanciato senza duplicare dati.
--
-- Formula:
--   media Elo squadra 1 contro media Elo squadra 2
-- I due compagni condividono quindi la stessa probabilita attesa e lo stesso
-- delta base. Il margine dei set continua a pesare attraverso
-- padel_margin_factor. Al termine viene ricalcolato tutto lo storico.

alter table public.match_players
  add column if not exists rating_before integer;

alter table public.match_players
  add column if not exists rating_after integer;

create or replace function public.record_match(
  p_played_at timestamptz,
  p_team1 uuid[],
  p_team2 uuid[],
  p_sets jsonb,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  all_players uuid[];
  team1_rating numeric;
  team2_rating numeric;
  expected_team1 numeric;
  team1_wins integer;
  team2_wins integer;
  winner smallint;
  margin_factor numeric;
  current_player record;
  expected_score numeric;
  player_won boolean;
  raw_delta integer;
  applied_delta integer;
  absolute_delta_total integer := 0;
  new_match_id uuid := gen_random_uuid();
begin
  if current_user_id is null then
    raise exception 'Devi accedere per registrare una partita';
  end if;

  if not exists (select 1 from public.profiles where id = current_user_id) then
    raise exception 'Profilo giocatore non trovato';
  end if;

  perform pg_advisory_xact_lock(hashtext('theboyz_padel_results'));

  if cardinality(p_team1) <> 2 or cardinality(p_team2) <> 2 then
    raise exception 'Ogni squadra deve avere esattamente due giocatori';
  end if;

  all_players := p_team1 || p_team2;
  if (select count(distinct player_id) from unnest(all_players) as player_id) <> 4 then
    raise exception 'I quattro giocatori devono essere diversi';
  end if;

  if (select count(*) from public.profiles where id = any(all_players)) <> 4 then
    raise exception 'Uno o piu giocatori non appartengono al gruppo';
  end if;

  if jsonb_typeof(p_sets) <> 'array' or jsonb_array_length(p_sets) not between 2 and 3 then
    raise exception 'Inserisci due o tre set';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_sets) as item
    where (item ->> 'team1_games') is null
      or (item ->> 'team2_games') is null
      or (item ->> 'team1_games')::integer < 0
      or (item ->> 'team2_games')::integer < 0
      or (item ->> 'team1_games')::integer > 20
      or (item ->> 'team2_games')::integer > 20
      or (item ->> 'team1_games')::integer = (item ->> 'team2_games')::integer
  ) then
    raise exception 'Punteggio set non valido';
  end if;

  select
    count(*) filter (where (item ->> 'team1_games')::integer > (item ->> 'team2_games')::integer),
    count(*) filter (where (item ->> 'team2_games')::integer > (item ->> 'team1_games')::integer)
  into team1_wins, team2_wins
  from jsonb_array_elements(p_sets) as item;

  if greatest(team1_wins, team2_wins) <> 2 or team1_wins = team2_wins then
    raise exception 'La partita deve terminare con due set vinti';
  end if;

  winner := case when team1_wins > team2_wins then 1 else 2 end;

  perform 1 from public.profiles where id = any(all_players) order by id for update;
  select avg(rating) into team1_rating from public.profiles where id = any(p_team1);
  select avg(rating) into team2_rating from public.profiles where id = any(p_team2);
  expected_team1 := 1.0 / (
    1.0 + power(10.0, (team2_rating - team1_rating) / 400.0)
  );
  margin_factor := public.padel_margin_factor(p_sets, winner);

  insert into public.matches (id, played_at, created_by, winner_team, rating_delta, notes)
  values (new_match_id, p_played_at, current_user_id, winner, 0, nullif(trim(p_notes), ''));

  insert into public.match_sets (match_id, set_number, team1_games, team2_games)
  select
    new_match_id,
    ordinality::smallint,
    (item ->> 'team1_games')::smallint,
    (item ->> 'team2_games')::smallint
  from jsonb_array_elements(p_sets) with ordinality as parsed(item, ordinality);

  for current_player in
    select id, rating
    from public.profiles
    where id = any(all_players)
    order by id
  loop
    if current_player.id = any(p_team1) then
      expected_score := expected_team1;
      player_won := winner = 1;
    else
      expected_score := 1.0 - expected_team1;
      player_won := winner = 2;
    end if;

    raw_delta := round(
      32.0
        * margin_factor
        * ((case when player_won then 1.0 else 0.0 end) - expected_score)
    )::integer;
    applied_delta := greatest(100, current_player.rating + raw_delta) - current_player.rating;

    insert into public.match_players (
      match_id,
      profile_id,
      team,
      rating_delta,
      rating_before,
      rating_after
    )
    values (
      new_match_id,
      current_player.id,
      case when current_player.id = any(p_team1) then 1 else 2 end,
      applied_delta,
      current_player.rating,
      current_player.rating + applied_delta
    );

    update public.profiles
    set
      rating = rating + applied_delta,
      matches_played = matches_played + 1,
      wins = wins + case when player_won then 1 else 0 end,
      losses = losses + case when player_won then 0 else 1 end,
      current_streak = case
        when player_won
          then case when current_streak >= 0 then current_streak + 1 else 1 end
        else case when current_streak <= 0 then current_streak - 1 else -1 end
      end
    where id = current_player.id;

    absolute_delta_total := absolute_delta_total + abs(applied_delta);
  end loop;

  update public.matches
  set rating_delta = round(absolute_delta_total / 4.0)::integer
  where id = new_match_id;

  return new_match_id;
end;
$$;

revoke all on function public.record_match(timestamptz, uuid[], uuid[], jsonb, text) from public;
grant execute on function public.record_match(timestamptz, uuid[], uuid[], jsonb, text) to authenticated;

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
  team1_rating numeric;
  team2_rating numeric;
  expected_team1 numeric;
  margin_factor numeric;
  current_player record;
  expected_score numeric;
  player_won boolean;
  raw_delta integer;
  applied_delta integer;
  absolute_delta_total integer;
begin
  perform pg_advisory_xact_lock(hashtext('theboyz_padel_results'));
  perform 1 from public.profiles order by id for update;

  update public.profiles
  set
    rating = 1000,
    matches_played = 0,
    wins = 0,
    losses = 0,
    current_streak = 0
  where true;

  for replay_match in
    select id, winner_team
    from public.matches
    order by played_at, created_at, id
  loop
    select
      array_agg(profile_id order by profile_id) filter (where team = 1),
      array_agg(profile_id order by profile_id) filter (where team = 2)
    into replay_team1, replay_team2
    from public.match_players
    where match_id = replay_match.id;

    continue when replay_team1 is null
      or replay_team2 is null
      or cardinality(replay_team1) <> 2
      or cardinality(replay_team2) <> 2;

    select jsonb_agg(
      jsonb_build_object('team1_games', team1_games, 'team2_games', team2_games)
      order by set_number
    )
    into match_sets_json
    from public.match_sets
    where match_id = replay_match.id;

    if match_sets_json is null then
      margin_factor := 1.0;
    else
      margin_factor := public.padel_margin_factor(match_sets_json, replay_match.winner_team);
    end if;

    select avg(rating) into team1_rating from public.profiles where id = any(replay_team1);
    select avg(rating) into team2_rating from public.profiles where id = any(replay_team2);
    expected_team1 := 1.0 / (
      1.0 + power(10.0, (team2_rating - team1_rating) / 400.0)
    );
    absolute_delta_total := 0;

    for current_player in
      select id, rating
      from public.profiles
      where id = any(replay_team1 || replay_team2)
      order by id
    loop
      if current_player.id = any(replay_team1) then
        expected_score := expected_team1;
        player_won := replay_match.winner_team = 1;
      else
        expected_score := 1.0 - expected_team1;
        player_won := replay_match.winner_team = 2;
      end if;

      raw_delta := round(
        32.0
          * margin_factor
          * ((case when player_won then 1.0 else 0.0 end) - expected_score)
      )::integer;
      applied_delta := greatest(100, current_player.rating + raw_delta) - current_player.rating;

      update public.match_players
      set
        rating_delta = applied_delta,
        rating_before = current_player.rating,
        rating_after = current_player.rating + applied_delta
      where match_id = replay_match.id
        and profile_id = current_player.id;

      update public.profiles
      set
        rating = rating + applied_delta,
        matches_played = matches_played + 1,
        wins = wins + case when player_won then 1 else 0 end,
        losses = losses + case when player_won then 0 else 1 end,
        current_streak = case
          when player_won
            then case when current_streak >= 0 then current_streak + 1 else 1 end
          else case when current_streak <= 0 then current_streak - 1 else -1 end
        end
      where id = current_player.id;

      absolute_delta_total := absolute_delta_total + abs(applied_delta);
    end loop;

    update public.matches
    set rating_delta = round(absolute_delta_total / 4.0)::integer
    where id = replay_match.id;
  end loop;
end;
$$;

revoke all on function public.recalculate_padel_ratings() from public;
grant execute on function public.recalculate_padel_ratings() to authenticated;

select public.recalculate_padel_ratings();
