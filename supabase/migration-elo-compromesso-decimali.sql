-- Elo a precisione decimale: il risultato si arrotonda soltanto nell'interfaccia.
-- A parita di Elo e moltiplicatore x1: 1 set 8, 2-1 13, 2-0 16, 3-0 18.
-- Il ricalcolo dello storico e parte della migrazione: non alterare i risultati.

begin;

-- Il vecchio trigger dipende dal tipo di matches.rating_delta: rimuoverlo
-- prima della conversione delle colonne.
drop trigger if exists halve_single_set_match_elo on public.matches;
drop function if exists public.halve_single_set_match_elo();

alter table public.profiles alter column rating type numeric using rating::numeric;
alter table public.matches alter column rating_delta type numeric using rating_delta::numeric;
alter table public.match_players alter column rating_delta type numeric using rating_delta::numeric;
alter table public.match_players alter column rating_before type numeric using rating_before::numeric;
alter table public.match_players alter column rating_after type numeric using rating_after::numeric;
alter table public.padel_season_standings alter column rating type numeric using rating::numeric;

-- Il set secco entra direttamente nella formula, senza arrotondare e dimezzare
-- un delta gia applicato.

create or replace function public.padel_elo_weight(p_sets jsonb, p_winner smallint)
returns numeric
language sql
immutable
security invoker
set search_path = public, pg_temp
as $$
  with score as (
    select
      count(*) filter (where not coalesce((item ->> 'incomplete')::boolean, false)
        and (item ->> 'team1_games')::integer > (item ->> 'team2_games')::integer) as team1_sets,
      count(*) filter (where not coalesce((item ->> 'incomplete')::boolean, false)
        and (item ->> 'team2_games')::integer > (item ->> 'team1_games')::integer) as team2_sets
    from jsonb_array_elements(p_sets) as item
  )
  select case
    when p_winner = 0 then 1.0::numeric
    when greatest(team1_sets, team2_sets) = 1 and least(team1_sets, team2_sets) = 0 then 0.5::numeric
    when greatest(team1_sets, team2_sets) = 2 and least(team1_sets, team2_sets) = 1 then 0.8125::numeric
    when greatest(team1_sets, team2_sets) = 2 and least(team1_sets, team2_sets) = 0 then 1.0::numeric
    when greatest(team1_sets, team2_sets) = 3 and least(team1_sets, team2_sets) = 0 then 1.125::numeric
    else 1.0::numeric
  end
  from score;
$$;

revoke all on function public.padel_elo_weight(jsonb, smallint) from public, anon, authenticated;

-- Unica fonte della classifica: ogni partita trasferisce lo stesso delta alle
-- due coppie, senza arrotondamenti. Il limite minimo di 100 viene applicato
-- al trasferimento intero, cosi non genera Elo per il gruppo.
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
  actual_team1 numeric;
  elo_weight numeric;
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
    ) into match_sets_json
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

    -- I premi restano separati dal delta della partita e vengono accreditati
    -- nel loro punto cronologico, prima di elaborare la partita successiva.
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

-- Valida e registra ogni formato reale (uno, due o tre set). I calcoli Elo e
-- le statistiche passano sempre dal ricalcolo, anche per una nuova partita.
create or replace function public.record_match_standard(
  p_played_at timestamptz,
  p_team1 uuid[],
  p_team2 uuid[],
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
  current_user_id uuid := auth.uid();
  all_players uuid[];
  set_count integer;
  incomplete_count integer;
  last_incomplete boolean;
  team1_wins integer;
  team2_wins integer;
  winner smallint;
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
  if jsonb_typeof(p_sets) <> 'array' or jsonb_array_length(p_sets) not between 1 and 3 then
    raise exception 'Inserisci da uno a tre set';
  end if;
  set_count := jsonb_array_length(p_sets);

  if exists (
    select 1 from jsonb_array_elements(p_sets) as item
    where (item ->> 'team1_games') is null
      or (item ->> 'team2_games') is null
      or (item ->> 'team1_games')::integer < 0
      or (item ->> 'team2_games')::integer < 0
      or (item ->> 'team1_games')::integer > 20
      or (item ->> 'team2_games')::integer > 20
      or ((item ->> 'team1_games')::integer = (item ->> 'team2_games')::integer
        and not coalesce((item ->> 'incomplete')::boolean, false))
  ) then
    raise exception 'Punteggio set non valido';
  end if;

  select
    count(*) filter (where coalesce((item ->> 'incomplete')::boolean, false)),
    bool_or(coalesce((item ->> 'incomplete')::boolean, false) and ordinality = set_count)
  into incomplete_count, last_incomplete
  from jsonb_array_elements(p_sets) with ordinality as parsed(item, ordinality);
  if incomplete_count > 1 or (incomplete_count = 1 and not last_incomplete) then
    raise exception 'Solo l''ultimo set puo essere interrotto';
  end if;

  select
    count(*) filter (where not coalesce((item ->> 'incomplete')::boolean, false)
      and (item ->> 'team1_games')::integer > (item ->> 'team2_games')::integer),
    count(*) filter (where not coalesce((item ->> 'incomplete')::boolean, false)
      and (item ->> 'team2_games')::integer > (item ->> 'team1_games')::integer)
  into team1_wins, team2_wins
  from jsonb_array_elements(p_sets) as item;

  if team1_wins = 1 and team2_wins = 1 then
    winner := 0;
  elsif team1_wins <> team2_wins and (
    (set_count = 1 and greatest(team1_wins, team2_wins) = 1)
    or (set_count >= 2 and greatest(team1_wins, team2_wins) between 2 and 3)
  ) then
    winner := case when team1_wins > team2_wins then 1 else 2 end;
  else
    raise exception 'La partita deve finire con un set secco, due set vinti o tre set vinti';
  end if;

  insert into public.matches (id, played_at, created_by, winner_team, rating_delta, notes, video_url)
  values (new_match_id, p_played_at, current_user_id, winner, 0,
    nullif(trim(p_notes), ''), nullif(trim(p_video_url), ''));

  insert into public.match_sets (match_id, set_number, team1_games, team2_games, incomplete)
  select new_match_id, ordinality::smallint,
    (item ->> 'team1_games')::smallint,
    (item ->> 'team2_games')::smallint,
    coalesce((item ->> 'incomplete')::boolean, false)
  from jsonb_array_elements(p_sets) with ordinality as parsed(item, ordinality);

  insert into public.match_players (match_id, profile_id, team, rating_delta)
  select new_match_id, player_id,
    case when player_id = any(p_team1) then 1 else 2 end, 0
  from unnest(all_players) as player_id;

  perform public.recalculate_padel_ratings();
  return new_match_id;
end;
$$;

revoke all on function public.record_match_standard(timestamptz, uuid[], uuid[], jsonb, text, text)
  from public, anon, authenticated;

create or replace function public.record_match(
  p_played_at timestamptz,
  p_team1 uuid[],
  p_team2 uuid[],
  p_sets jsonb,
  p_notes text default null,
  p_video_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return public.record_match_standard(
    p_played_at, p_team1, p_team2, p_sets, p_notes, p_video_url
  );
end;
$$;

revoke all on function public.record_match(timestamptz, uuid[], uuid[], jsonb, text, text)
  from public, anon;
grant execute on function public.record_match(timestamptz, uuid[], uuid[], jsonb, text, text)
  to authenticated;

select public.recalculate_padel_ratings();
notify pgrst, 'reload schema';

commit;
