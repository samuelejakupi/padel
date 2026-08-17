-- TheBoyz · il premio di fine torneo: +30 Elo ai primi, +15 ai secondi
--
-- Il punto delicato non e il premio, e dove metterlo. L'Elo di questo sito non
-- e un totale che si accumula: recalculate_padel_ratings() riazzera tutti a
-- 1000 e ripassa lo storico dall'inizio a ogni partita salvata, corretta o
-- eliminata. Un bonus scritto una volta sola su profiles.rating sparirebbe al
-- primo ricalcolo, cioe entro la sera.
--
-- Quindi il premio non si "assegna": si ricalcola insieme a tutto il resto,
-- ogni volta, a partire dal calendario del torneo. Non c'e una tabella dei
-- premi da tenere allineata — la classifica del girone e gia scritta nei
-- risultati, e chi ha vinto si rilegge da li.
--
-- Quando viene applicato: nell'istante dell'ultima partita del torneo, non in
-- fondo allo storico. Cosi chi vince un torneo a marzo arriva alla partita di
-- aprile con i suoi 30 punti gia in tasca, e l'Elo atteso di quella partita
-- ne tiene conto.
--
-- La parita si scioglie come nella pagina dei tornei: vittorie, poi scontri
-- diretti fra chi e appaiato, poi differenza game, game vinti e infine
-- l'ordine di iscrizione.
--
-- Esegui questo file nel SQL Editor di Supabase, dopo migration-tornei-formato.sql.

-- 1. La classifica del girone, in SQL ---------------------------------------

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
        select sum(gioco.team1_games) from public.match_sets as gioco where gioco.match_id = partita.id
      ), 0) as team1_games,
      coalesce((
        select sum(gioco.team2_games) from public.match_sets as gioco where gioco.match_id = partita.id
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
  -- Gli scontri diretti contano solo fra squadre appaiate nelle vittorie: e
  -- la stessa regola della tabella nella pagina dei tornei.
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

revoke all on function public.tournament_standings(uuid) from public, anon;
grant execute on function public.tournament_standings(uuid) to authenticated;

-- 2. Chi prende quanto ------------------------------------------------------

-- I due numeri stanno scritti qui e in nessun altro posto. Il premio vale solo
-- a torneo finito: finche c'e una partita da giocare la classifica e
-- provvisoria e nessuno ha vinto niente.
create or replace function public.tournament_elo_awards(p_tournament_id uuid)
returns table (profile_id uuid, points integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with finito as (
    select 1
    from public.tournament_fixtures
    where tournament_id = p_tournament_id
    having count(*) > 0 and count(*) filter (where match_id is null) = 0
  ),
  premi as (
    select classifica.team_id, case classifica.team_position when 1 then 30 when 2 then 15 end as points
    from public.tournament_standings(p_tournament_id) as classifica
    where classifica.team_position in (1, 2)
      and exists (select 1 from finito)
  )
  select giocatore.id, premi.points
  from premi
  join public.tournament_teams as squadra on squadra.id = premi.team_id
  cross join lateral (values (squadra.player_a), (squadra.player_b)) as giocatore(id);
$$;

revoke all on function public.tournament_elo_awards(uuid) from public, anon;
grant execute on function public.tournament_elo_awards(uuid) to authenticated;

-- L'ultima partita giocata del torneo, nello stesso ordine con cui il ricalcolo
-- ripassa lo storico: e li che il torneo si chiude ed e li che scatta il premio.
create or replace function public.tournament_closing_match(p_tournament_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select partita.id
  from public.tournament_fixtures as fixture
  join public.matches as partita on partita.id = fixture.match_id
  where fixture.tournament_id = p_tournament_id
    and not exists (
      select 1 from public.tournament_fixtures
      where tournament_id = p_tournament_id and match_id is null
    )
  order by partita.played_at desc, partita.created_at desc, partita.id desc
  limit 1;
$$;

revoke all on function public.tournament_closing_match(uuid) from public, anon;
grant execute on function public.tournament_closing_match(uuid) to authenticated;

-- 3. Il ricalcolo, con il premio dentro -------------------------------------

-- Stessa funzione di migration-pareggi.sql — pareggi, moltiplicatore del
-- torneo, contatori e serie restano identici. L'unica aggiunta e in fondo al
-- giro: quando la partita appena ripassata e quella che chiude un torneo, i
-- premi entrano subito, prima che il giro successivo legga i rating.
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
  closing_matches uuid[];
  award record;
begin
  perform pg_advisory_xact_lock(hashtext('theboyz_padel_results'));
  perform 1 from public.profiles order by id for update;

  update public.profiles
  set rating = 1000, matches_played = 0, wins = 0, losses = 0, draws = 0, current_streak = 0
  where true;

  -- Le partite che chiudono un torneo, cercate una volta sola: dentro al giro
  -- sarebbero una classifica ricalcolata per ogni partita dello storico.
  select coalesce(array_agg(chiusura), '{}')
  into closing_matches
  from (
    select public.tournament_closing_match(id) as chiusura
    from public.padel_tournaments
  ) as tornei
  where chiusura is not null;

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

    -- Il premio del torneo che si chiude proprio qui. Sta sul rating e non
    -- sui delta della partita: quei delta appartengono a chi era in campo,
    -- e i secondi classificati quella sera potevano essere a casa.
    if replay_match.id = any(closing_matches) then
      for award in
        select premio.profile_id, premio.points
        from public.padel_tournaments as torneo
        cross join lateral public.tournament_elo_awards(torneo.id) as premio
        where public.tournament_closing_match(torneo.id) = replay_match.id
      loop
        update public.profiles
        set rating = rating + award.points
        where id = award.profile_id;
      end loop;
    end if;
  end loop;
end;
$$;

revoke all on function public.recalculate_padel_ratings() from public;
grant execute on function public.recalculate_padel_ratings() to authenticated;

-- 4. Eliminare una partita di torneo rimette in discussione il premio -------

-- delete_match_unchecked non ricalcola: scala i delta della partita tolta e
-- riconta i contatori. Bastava finche l'Elo era la somma delle partite, non
-- basta piu adesso — togliere l'ultima partita di un torneo lo riapre, e i
-- 30 punti del primo non hanno piu motivo di stare li. Il ricalcolo completo
-- si aggiunge alla porta dell'eliminazione vera; la correzione non ne ha
-- bisogno perche riregistra e ricalcola subito dopo.
create or replace function public.delete_match(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  origine record;
begin
  if current_user_id is null then
    raise exception 'Devi accedere per eliminare una partita';
  end if;

  if not exists (select 1 from public.profiles where id = current_user_id) then
    raise exception 'Profilo giocatore non trovato';
  end if;

  select * into origine from public.match_origin(p_match_id);

  if not found then
    raise exception 'Partita non trovata';
  end if;

  if origine.author_id is distinct from current_user_id then
    raise exception 'Solo chi ha registrato la partita può eliminarla';
  end if;

  perform public.delete_match_unchecked(p_match_id);
  perform public.recalculate_padel_ratings();
end;
$$;

revoke all on function public.delete_match(uuid) from public;
grant execute on function public.delete_match(uuid) to authenticated;

-- I tornei gia conclusi prendono il premio da adesso: la classifica si
-- ricostruisce sempre da capo, quindi lo stesso torneo deve valere la stessa
-- cosa oggi e fra sei mesi.
select public.recalculate_padel_ratings();

notify pgrst, 'reload schema';
