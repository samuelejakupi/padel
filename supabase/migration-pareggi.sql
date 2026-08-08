-- TheBoyz · migrazione: pareggi con terzo set incompleto
-- Esegui questo file nel SQL Editor di Supabase.
-- È idempotente: puo essere rilanciato senza duplicare dati.
--
-- Il problema. Si gioca al meglio dei tre set, ma spesso il campo scade a
-- meta del terzo. Fino a ieri quel risultato non si poteva registrare: o si
-- inventava un vincitore, o la partita spariva. Da qui in avanti un 1-1 nei
-- set e un pareggio, e il terzo set interrotto si scrive lo stesso.
--
-- Perche scrivere un set che non e finito. Serve a due cose: i giochi
-- contano nell'Elo (vedi padel_draw_tilt) e restano disponibili per le
-- statistiche future. Un 7-6 6-3 2-1 e un pareggio, ma non e lo stesso
-- pareggio di un 6-4 4-6 1-3.
--
-- Cosa cambia:
--   · matches.winner_team ammette 0 = pareggio, oltre a 1 e 2;
--   · match_sets.incomplete marca il set interrotto (l'unico che puo
--     finire in parita, tipo 3-3);
--   · profiles.draws conta i pareggi. La serie non si tocca: un pareggio
--     non spezza ne le vittorie ne le sconfitte consecutive, le mette in
--     pausa;
--   · nell'Elo il pareggio vale 0.5, spostato al massimo di 0.15 verso chi
--     ha vinto piu giochi in totale.
--
-- Le partite di torneo restano fuori: li serve sempre un vincitore, quindi
-- assign_tournament_match rifiuta i pareggi.

-- 1. Colonne e vincoli -------------------------------------------------------

-- Presente in produzione ma mai finito in un file di questa cartella: lo
-- riallineiamo qui, altrimenti record_match piu sotto non compila.
alter table public.matches
  add column if not exists video_url text;

alter table public.matches
  drop constraint if exists matches_winner_team_check;

alter table public.matches
  add constraint matches_winner_team_check check (winner_team in (0, 1, 2));

alter table public.match_sets
  add column if not exists incomplete boolean not null default false;

alter table public.profiles
  add column if not exists draws integer not null default 0 check (draws >= 0);

-- Il vincolo "i giochi non possono essere pari" e nato senza nome, quindi
-- Postgres gliene ha dato uno automatico. Lo cerchiamo per definizione invece
-- che per nome: cosi la migrazione regge anche se il nome e diverso.
do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.match_sets'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%team1_games <> team2_games%'
  loop
    execute format('alter table public.match_sets drop constraint %I', constraint_name);
  end loop;
end;
$$;

alter table public.match_sets
  drop constraint if exists match_sets_games_check;

-- Un set finito ha per forza un vincitore; solo quello interrotto puo stare
-- in parita.
alter table public.match_sets
  add constraint match_sets_games_check
  check (incomplete or team1_games <> team2_games);

-- 2. Peso dei giochi ---------------------------------------------------------

-- Quanto il pareggio si sposta dal mezzo punto esatto. Guarda i giochi
-- totali di tutta la partita, terzo set interrotto compreso: e la ragione
-- per cui quel set si registra.
--
-- Il tetto e 0.15 e non 0.5 perche il risultato resta un pareggio: i giochi
-- lo inclinano, non lo ribaltano. Con 7-6 6-3 2-1 (15 giochi a 10) la
-- squadra 1 vale 0.60 invece di 0.50.
create or replace function public.padel_draw_tilt(p_sets jsonb)
returns numeric
language sql
immutable
security invoker
set search_path = public, pg_temp
as $$
  with totals as (
    select
      sum((item ->> 'team1_games')::numeric) as team1_games,
      sum((item ->> 'team2_games')::numeric) as team2_games
    from jsonb_array_elements(p_sets) as item
  )
  select least(
    0.15::numeric,
    greatest(
      -0.15::numeric,
      0.5 * (team1_games - team2_games) / greatest(team1_games + team2_games, 1.0)
    )
  )
  from totals;
$$;

revoke all on function public.padel_draw_tilt(jsonb) from public;

-- ELO V4: il fattore margine ignora i set interrotti quando conta i set
-- vinti, e per un pareggio (p_winner = 0) resta neutro — l'informazione dei
-- giochi la porta gia padel_draw_tilt, contarla due volte la raddoppierebbe.
create or replace function public.padel_margin_factor(p_sets jsonb, p_winner smallint)
returns numeric
language sql
immutable
security invoker
set search_path = public, pg_temp
as $$
  with parsed as (
    select
      (item ->> 'team1_games')::numeric as team1_games,
      (item ->> 'team2_games')::numeric as team2_games,
      coalesce((item ->> 'incomplete')::boolean, false) as incomplete
    from jsonb_array_elements(p_sets) as item
  ),
  summary as (
    select
      count(*) filter (where not incomplete and team1_games > team2_games) as team1_sets,
      count(*) filter (where not incomplete and team2_games > team1_games) as team2_sets,
      avg(
        case
          when p_winner = 1
            then (team1_games - team2_games) / greatest(team1_games + team2_games, 1.0)
          else (team2_games - team1_games) / greatest(team1_games + team2_games, 1.0)
        end
      ) as game_dominance
    from parsed
  )
  select case
    when p_winner = 0 then 1.0::numeric
    else least(
      1.25::numeric,
      greatest(
        0.85::numeric,
        1.0
          + 0.08 * greatest(0, abs(team1_sets - team2_sets) - 1)
          + 0.12 * coalesce(game_dominance, 0)
      )
    )
  end
  from summary;
$$;

revoke all on function public.padel_margin_factor(jsonb, smallint) from public;

-- 3. Registrazione di una partita --------------------------------------------

-- La vecchia firma a cinque argomenti resta indietro con una copia della
-- logica che non conosce i pareggi. Nessuno la chiama piu (il sito passa
-- sempre p_video_url), quindi la togliamo invece di lasciare due Elo
-- diversi a seconda di come si entra.
drop function if exists public.record_match(timestamptz, uuid[], uuid[], jsonb, text);
-- Si butta giu anche quella a sei: "create or replace" si rifiuta di
-- cambiare il nome di un argomento, e la versione in produzione non e in
-- nessun file di questa cartella — non sappiamo come si chiamano i suoi.
drop function if exists public.record_match(timestamptz, uuid[], uuid[], jsonb, text, text);

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
declare
  current_user_id uuid := auth.uid();
  all_players uuid[];
  set_count integer;
  incomplete_count integer;
  last_incomplete boolean;
  team1_rating numeric;
  team2_rating numeric;
  expected_team1 numeric;
  team1_wins integer;
  team2_wins integer;
  winner smallint;
  margin_factor numeric;
  actual_team1 numeric;
  current_player record;
  expected_score numeric;
  actual_score numeric;
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

  set_count := jsonb_array_length(p_sets);

  if exists (
    select 1
    from jsonb_array_elements(p_sets) as item
    where (item ->> 'team1_games') is null
      or (item ->> 'team2_games') is null
      or (item ->> 'team1_games')::integer < 0
      or (item ->> 'team2_games')::integer < 0
      or (item ->> 'team1_games')::integer > 20
      or (item ->> 'team2_games')::integer > 20
      or (
        (item ->> 'team1_games')::integer = (item ->> 'team2_games')::integer
        and not coalesce((item ->> 'incomplete')::boolean, false)
      )
  ) then
    raise exception 'Punteggio set non valido';
  end if;

  -- Un solo set interrotto, e per forza l'ultimo: una partita non riprende
  -- dopo essersi fermata.
  select
    count(*) filter (where coalesce((item ->> 'incomplete')::boolean, false)),
    bool_or(
      coalesce((item ->> 'incomplete')::boolean, false)
      and ordinality = set_count
    )
  into incomplete_count, last_incomplete
  from jsonb_array_elements(p_sets) with ordinality as parsed(item, ordinality);

  if incomplete_count > 1 or (incomplete_count = 1 and not last_incomplete) then
    raise exception 'Solo l''ultimo set puo essere interrotto';
  end if;

  -- Il set interrotto non si conta fra i set vinti, anche quando i giochi
  -- non sono pari: 2-1 non e un set, e un set lasciato a meta.
  select
    count(*) filter (
      where not coalesce((item ->> 'incomplete')::boolean, false)
        and (item ->> 'team1_games')::integer > (item ->> 'team2_games')::integer
    ),
    count(*) filter (
      where not coalesce((item ->> 'incomplete')::boolean, false)
        and (item ->> 'team2_games')::integer > (item ->> 'team1_games')::integer
    )
  into team1_wins, team2_wins
  from jsonb_array_elements(p_sets) as item;

  if team1_wins = 1 and team2_wins = 1 then
    winner := 0;
  elsif greatest(team1_wins, team2_wins) = 2 and team1_wins <> team2_wins then
    winner := case when team1_wins > team2_wins then 1 else 2 end;
  else
    raise exception 'La partita deve finire con due set vinti o in parita sull''uno a uno';
  end if;

  perform 1 from public.profiles where id = any(all_players) order by id for update;
  select avg(rating) into team1_rating from public.profiles where id = any(p_team1);
  select avg(rating) into team2_rating from public.profiles where id = any(p_team2);
  expected_team1 := 1.0 / (
    1.0 + power(10.0, (team2_rating - team1_rating) / 400.0)
  );
  margin_factor := public.padel_margin_factor(p_sets, winner);
  actual_team1 := case
    when winner = 0 then 0.5 + public.padel_draw_tilt(p_sets)
    when winner = 1 then 1.0
    else 0.0
  end;

  insert into public.matches (id, played_at, created_by, winner_team, rating_delta, notes, video_url)
  values (
    new_match_id,
    p_played_at,
    current_user_id,
    winner,
    0,
    nullif(trim(p_notes), ''),
    nullif(trim(p_video_url), '')
  );

  insert into public.match_sets (match_id, set_number, team1_games, team2_games, incomplete)
  select
    new_match_id,
    ordinality::smallint,
    (item ->> 'team1_games')::smallint,
    (item ->> 'team2_games')::smallint,
    coalesce((item ->> 'incomplete')::boolean, false)
  from jsonb_array_elements(p_sets) with ordinality as parsed(item, ordinality);

  for current_player in
    select id, rating
    from public.profiles
    where id = any(all_players)
    order by id
  loop
    if current_player.id = any(p_team1) then
      expected_score := expected_team1;
      actual_score := actual_team1;
    else
      expected_score := 1.0 - expected_team1;
      actual_score := 1.0 - actual_team1;
    end if;
    player_won := winner <> 0 and (
      (winner = 1 and current_player.id = any(p_team1))
      or (winner = 2 and current_player.id = any(p_team2))
    );

    raw_delta := round(
      32.0 * margin_factor * (actual_score - expected_score)
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
      losses = losses + case when winner = 0 or player_won then 0 else 1 end,
      draws = draws + case when winner = 0 then 1 else 0 end,
      -- Il pareggio mette la serie in pausa invece di azzerarla: chi aveva
      -- tre vittorie di fila le ritrova alla prossima vinta.
      current_streak = case
        when winner = 0 then current_streak
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

revoke all on function public.record_match(timestamptz, uuid[], uuid[], jsonb, text, text) from public;
grant execute on function public.record_match(timestamptz, uuid[], uuid[], jsonb, text, text) to authenticated;

-- 4. Ricalcolo cronologico ---------------------------------------------------

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
  actual_team1 numeric;
  current_player record;
  expected_score numeric;
  actual_score numeric;
  player_won boolean;
  raw_delta integer;
  applied_delta integer;
  absolute_delta_total integer;
begin
  perform pg_advisory_xact_lock(hashtext('theboyz_padel_results'));
  perform 1 from public.profiles order by id for update;

  update public.profiles
  set rating = 1000, matches_played = 0, wins = 0, losses = 0, draws = 0, current_streak = 0
  where true;

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
      )
      order by set_number
    ) into match_sets_json
    from public.match_sets
    where match_id = replay_match.id;

    margin_factor := case
      when match_sets_json is null then 1.0
      else public.padel_margin_factor(match_sets_json, replay_match.winner_team)
    end;
    actual_team1 := case
      when replay_match.winner_team = 1 then 1.0
      when replay_match.winner_team = 2 then 0.0
      when match_sets_json is null then 0.5
      else 0.5 + public.padel_draw_tilt(match_sets_json)
    end;

    select avg(rating) into team1_rating from public.profiles where id = any(replay_team1);
    select avg(rating) into team2_rating from public.profiles where id = any(replay_team2);
    expected_team1 := 1.0 / (1.0 + power(10.0, (team2_rating - team1_rating) / 400.0));
    absolute_delta_total := 0;

    for current_player in
      select id, rating from public.profiles
      where id = any(replay_team1 || replay_team2)
      order by id
    loop
      if current_player.id = any(replay_team1) then
        expected_score := expected_team1;
        actual_score := actual_team1;
      else
        expected_score := 1.0 - expected_team1;
        actual_score := 1.0 - actual_team1;
      end if;
      player_won := replay_match.winner_team <> 0 and (
        (replay_match.winner_team = 1 and current_player.id = any(replay_team1))
        or (replay_match.winner_team = 2 and current_player.id = any(replay_team2))
      );

      raw_delta := round(
        32.0 * replay_match.elo_multiplier * margin_factor
          * (actual_score - expected_score)
      )::integer;
      applied_delta := greatest(100, current_player.rating + raw_delta) - current_player.rating;

      update public.match_players
      set
        rating_delta = applied_delta,
        rating_before = current_player.rating,
        rating_after = current_player.rating + applied_delta
      where match_id = replay_match.id and profile_id = current_player.id;

      update public.profiles
      set
        rating = rating + applied_delta,
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

-- 5. Eliminazione ------------------------------------------------------------

-- Stessa struttura di prima: si scalano i delta della partita rimossa e si
-- riconta lo storico. Cambia solo che il pareggio non e piu una sconfitta.
create or replace function public.delete_match(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  replay_match record;
begin
  if current_user_id is null then
    raise exception 'Devi accedere per eliminare una partita';
  end if;

  if not exists (select 1 from public.profiles where id = current_user_id) then
    raise exception 'Profilo giocatore non trovato';
  end if;

  perform pg_advisory_xact_lock(hashtext('theboyz_padel_results'));
  perform 1 from public.profiles order by id for update;

  if not exists (select 1 from public.matches where id = p_match_id) then
    raise exception 'Partita non trovata';
  end if;

  update public.profiles as profile
  set rating = greatest(100, profile.rating - match_player.rating_delta)
  from public.match_players as match_player
  where match_player.match_id = p_match_id
    and profile.id = match_player.profile_id;

  delete from public.matches where id = p_match_id;

  update public.profiles
  set
    matches_played = 0,
    wins = 0,
    losses = 0,
    draws = 0,
    current_streak = 0
  where true;

  for replay_match in
    select id, winner_team
    from public.matches
    order by played_at, created_at, id
  loop
    update public.profiles as profile
    set
      matches_played = matches_played + 1,
      wins = wins + case
        when replay_match.winner_team <> 0 and match_player.team = replay_match.winner_team then 1
        else 0
      end,
      losses = losses + case
        when replay_match.winner_team <> 0 and match_player.team <> replay_match.winner_team then 1
        else 0
      end,
      draws = draws + case when replay_match.winner_team = 0 then 1 else 0 end,
      current_streak = case
        when replay_match.winner_team = 0 then current_streak
        when match_player.team = replay_match.winner_team
          then case when current_streak >= 0 then current_streak + 1 else 1 end
        else case when current_streak <= 0 then current_streak - 1 else -1 end
      end
    from public.match_players as match_player
    where match_player.match_id = replay_match.id
      and profile.id = match_player.profile_id;
  end loop;
end;
$$;

revoke all on function public.delete_match(uuid) from public;
grant execute on function public.delete_match(uuid) to authenticated;

-- 6. Tornei ------------------------------------------------------------------

-- Un girone all'italiana si regge sulla classifica delle squadre: un
-- pareggio la lascerebbe senza punti assegnati. Finche non decidiamo come
-- valgono li dentro, il torneo pretende un vincitore.
create or replace function public.assign_tournament_match(p_fixture_id uuid, p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  fixture_record record;
  expected_team1 uuid[];
  expected_team2 uuid[];
  actual_team1 uuid[];
  actual_team2 uuid[];
begin
  if auth.uid() is null or not exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'Devi accedere per registrare il risultato del torneo';
  end if;

  if exists (select 1 from public.matches where id = p_match_id and winner_team = 0) then
    raise exception 'Una partita di torneo non puo finire in pareggio';
  end if;

  select fixture.*, tournament.elo_multiplier
  into fixture_record
  from public.tournament_fixtures as fixture
  join public.padel_tournaments as tournament on tournament.id = fixture.tournament_id
  where fixture.id = p_fixture_id;

  if not found then raise exception 'Partita del torneo non trovata'; end if;
  if fixture_record.match_id is not null and fixture_record.match_id <> p_match_id then
    raise exception 'Questa partita del torneo ha già un risultato';
  end if;

  select array[player_a, player_b] into expected_team1
  from public.tournament_teams where id = fixture_record.team1_id;
  select array[player_a, player_b] into expected_team2
  from public.tournament_teams where id = fixture_record.team2_id;
  select
    array_agg(profile_id order by profile_id) filter (where team = 1),
    array_agg(profile_id order by profile_id) filter (where team = 2)
  into actual_team1, actual_team2
  from public.match_players where match_id = p_match_id;

  if actual_team1 is null or actual_team2 is null
    or not (actual_team1 @> expected_team1 and expected_team1 @> actual_team1)
    or not (actual_team2 @> expected_team2 and expected_team2 @> actual_team2)
  then
    raise exception 'I giocatori del risultato non corrispondono alle squadre del torneo';
  end if;

  update public.tournament_fixtures set match_id = p_match_id where id = p_fixture_id;
  update public.matches set elo_multiplier = fixture_record.elo_multiplier where id = p_match_id;
  perform public.recalculate_padel_ratings();
end;
$$;

revoke all on function public.assign_tournament_match(uuid, uuid) from public;
grant execute on function public.assign_tournament_match(uuid, uuid) to authenticated;

-- 7. Riallineamento ----------------------------------------------------------

-- I pareggi non esistevano, quindi nessun risultato gia salvato cambia: il
-- ricalcolo serve solo a riempire draws e a ripassare tutto con le funzioni
-- nuove.
select public.recalculate_padel_ratings();

notify pgrst, 'reload schema';
