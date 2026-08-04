-- TheBoyz · migrazione: Elo deterministico e in ordine cronologico
-- Esegui questo file UNA SOLA VOLTA nel SQL Editor del progetto Supabase.
-- È idempotente: rilanciarlo non rompe nulla.
--
-- Il problema.
-- record_match calcola il delta partendo dal rating che i giocatori hanno
-- in quel momento, e non da quello che avevano alla data della partita.
-- Finché si registra sempre l'ultima partita giocata le due cose coincidono,
-- ma modificare una partita significa cancellarla e riregistrarla: la
-- seconda volta i rating di partenza sono quelli aggiornati da tutte le
-- partite successive, quindi lo stesso identico risultato può valere +15
-- invece di +16. delete_match, dal canto suo, si limita a sottrarre i delta
-- salvati e a ricontare vittorie e sconfitte: i rating non li ricalcola.
--
-- La soluzione.
-- Una funzione che azzera tutto e rigioca l'intero storico in ordine di
-- data, con la formula ELO V2. Il risultato non dipende più dall'ordine in
-- cui le partite sono state inserite o corrette: a parità di risultati e di
-- date, i numeri sono sempre gli stessi.
--
-- ATTENZIONE, da leggere prima di eseguire.
-- Il ricalcolo applica la formula ELO V2 a tutto lo storico, comprese le
-- partite registrate quando era in vigore la formula precedente. Alla prima
-- esecuzione alcuni valori storici possono quindi cambiare di qualche punto.
-- Da lì in poi restano stabili.

-- L'Elo di ogni giocatore prima e dopo ogni singola partita: serve a
-- controllare i conti senza dover rifare il replay a mente.
alter table public.match_players
  add column if not exists rating_before integer;

alter table public.match_players
  add column if not exists rating_after integer;

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
  margin_factor numeric;
  current_player record;
  expected_score numeric;
  player_won boolean;
  raw_delta integer;
  applied_delta integer;
  absolute_delta_total integer;
begin
  -- Nessun controllo su auth.uid(): la funzione e concessa solo al ruolo
  -- authenticated (vedi grant in fondo), e cosi resta eseguibile anche
  -- dall'SQL Editor, dove auth.uid() e sempre null.

  -- Stesso lock usato da record_match e delete_match: due ricalcoli
  -- contemporanei si metterebbero i piedi in testa.
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

    -- Una partita senza quattro giocatori validi non e ricalcolabile: la
    -- saltiamo invece di far fallire tutto il replay.
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

    -- Senza i set non si puo pesare il margine: si resta sul fattore neutro.
    if match_sets_json is null then
      margin_factor := 1.0;
    else
      margin_factor := public.padel_margin_factor(match_sets_json, replay_match.winner_team);
    end if;

    select avg(rating) into team1_rating from public.profiles where id = any(replay_team1);
    select avg(rating) into team2_rating from public.profiles where id = any(replay_team2);

    absolute_delta_total := 0;

    for current_player in
      select id, rating
      from public.profiles
      where id = any(replay_team1 || replay_team2)
      order by id
    loop
      if current_player.id = any(replay_team1) then
        expected_score := 1.0 / (
          1.0 + power(10.0, (team2_rating - current_player.rating) / 400.0)
        );
        player_won := replay_match.winner_team = 1;
      else
        expected_score := 1.0 / (
          1.0 + power(10.0, (team1_rating - current_player.rating) / 400.0)
        );
        player_won := replay_match.winner_team = 2;
      end if;

      raw_delta := round(
        32.0
          * margin_factor
          * ((case when player_won then 1.0 else 0.0 end) - expected_score)
      )::integer;
      -- Il rating non scende sotto 100: il delta applicato tiene conto
      -- del taglio, altrimenti la somma non tornerebbe.
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

-- Allinea subito lo storico esistente.
select public.recalculate_padel_ratings();
