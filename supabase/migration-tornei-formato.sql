-- TheBoyz · tornei: formato delle partite, andata e ritorno, correzione ed eliminazione
--
-- Tre aggiunte a migration-tornei.sql, tutte additive:
--
--   · Il formato delle partite del torneo — best of 1 o best of 3 — sta sul
--     torneo, non sulla singola partita: e una regola decisa una volta, non un
--     caso che cambia di volta in volta. Il best of 5 non esiste apposta:
--     nessuno lo giochera mai e ammetterlo avrebbe voluto dire allargare il
--     vincolo dei set su tutte le partite del sito.
--   · L'andata e ritorno: ogni coppia si incontra due volte, con le squadre
--     invertite al ritorno. Il calendario raddoppia, la classifica no — somma
--     quello che trova, come faceva gia.
--   · Le stesse due regole delle partite (migration-permessi-partite.sql):
--     modificare entro 24 ore dalla creazione, e lo puo fare chi ha creato il
--     torneo o chi ci gioca dentro; eliminare solo chi l'ha creato, sempre.
--     Eliminare un torneo porta via anche i suoi risultati: sono partite
--     giocate per quel trofeo e pesate con il suo moltiplicatore, senza il
--     torneo non vogliono dire piu niente.
--
-- L'Elo non si tocca: una partita da un set vale gia meta
-- (migration-partite-un-set.sql), il best of 3 vale uno, e sopra si applica il
-- moltiplicatore del torneo come prima.
--
-- Esegui questo file nel SQL Editor di Supabase. E idempotente.

-- 1. Le colonne nuove -------------------------------------------------------

alter table public.padel_tournaments
  add column if not exists sets_format smallint not null default 3;

alter table public.padel_tournaments
  add column if not exists legs smallint not null default 1;

alter table public.tournament_fixtures
  add column if not exists leg smallint not null default 1;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'padel_tournaments_sets_format_check') then
    alter table public.padel_tournaments
      add constraint padel_tournaments_sets_format_check check (sets_format in (1, 3));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'padel_tournaments_legs_check') then
    alter table public.padel_tournaments
      add constraint padel_tournaments_legs_check check (legs in (1, 2));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tournament_fixtures_leg_check') then
    alter table public.tournament_fixtures
      add constraint tournament_fixtures_leg_check check (leg in (1, 2));
  end if;
end;
$$;

-- Quattro squadre andata e ritorno fanno dodici partite: il tetto di sei non
-- basta piu.
alter table public.tournament_fixtures
  drop constraint if exists tournament_fixtures_match_number_check;
alter table public.tournament_fixtures
  add constraint tournament_fixtures_match_number_check check (match_number between 1 and 12);

-- 2. Il calendario ----------------------------------------------------------

-- Girone all'italiana, una volta per ogni giro. Al ritorno le due squadre si
-- scambiano di posto: la prima colonna del tabellone e sempre chi "riceve".
create or replace function public.build_tournament_fixtures(
  p_tournament_id uuid,
  p_team_ids uuid[],
  p_legs smallint,
  p_first_number integer default 1,
  p_first_leg smallint default 1
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  team_total integer := cardinality(p_team_ids);
  match_counter integer := p_first_number - 1;
  leg_index integer;
  first_index integer;
  second_index integer;
begin
  for leg_index in p_first_leg..p_legs loop
    for first_index in 1..team_total - 1 loop
      for second_index in first_index + 1..team_total loop
        match_counter := match_counter + 1;
        insert into public.tournament_fixtures (
          tournament_id, match_number, team1_id, team2_id, leg
        ) values (
          p_tournament_id,
          match_counter,
          case when leg_index = 1 then p_team_ids[first_index] else p_team_ids[second_index] end,
          case when leg_index = 1 then p_team_ids[second_index] else p_team_ids[first_index] end,
          leg_index::smallint
        );
      end loop;
    end loop;
  end loop;
end;
$$;

revoke all on function public.build_tournament_fixtures(uuid, uuid[], smallint, integer, smallint)
  from public, anon, authenticated;

-- Le squadre di un torneo, controllate e riscritte da zero. Serve sia alla
-- creazione sia alla correzione, che rifa il girone quando le coppie cambiano.
create or replace function public.replace_tournament_teams(
  p_tournament_id uuid,
  p_teams jsonb
)
returns uuid[]
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  team_total integer;
  participant_count integer;
  distinct_participant_count integer;
  team_item record;
  new_team_id uuid;
  team_ids uuid[] := array[]::uuid[];
begin
  if jsonb_typeof(p_teams) <> 'array' then
    raise exception 'Le squadre del torneo non sono valide';
  end if;
  team_total := jsonb_array_length(p_teams);
  if team_total not between 3 and 4 then
    raise exception 'Il torneo richiede da tre a quattro squadre';
  end if;

  select count(*), count(distinct participant_id)
  into participant_count, distinct_participant_count
  from (
    select (item ->> 'player_a')::uuid as participant_id from jsonb_array_elements(p_teams) as item
    union all
    select (item ->> 'player_b')::uuid as participant_id from jsonb_array_elements(p_teams) as item
  ) as participants;

  if participant_count <> team_total * 2 or distinct_participant_count <> participant_count then
    raise exception 'Ogni partecipante deve comparire in una sola squadra';
  end if;
  if (
    select count(*)
    from public.profiles
    where id in (
      select (item ->> 'player_a')::uuid from jsonb_array_elements(p_teams) as item
      union
      select (item ->> 'player_b')::uuid from jsonb_array_elements(p_teams) as item
    )
  ) <> participant_count then
    raise exception 'Uno o più partecipanti non appartengono al gruppo';
  end if;

  delete from public.tournament_fixtures where tournament_id = p_tournament_id;
  delete from public.tournament_teams where tournament_id = p_tournament_id;

  for team_item in
    select item, ordinality
    from jsonb_array_elements(p_teams) with ordinality as team_data(item, ordinality)
    order by ordinality
  loop
    insert into public.tournament_teams (
      tournament_id, name, player_a, player_b, sort_order
    ) values (
      p_tournament_id,
      trim(team_item.item ->> 'name'),
      (team_item.item ->> 'player_a')::uuid,
      (team_item.item ->> 'player_b')::uuid,
      team_item.ordinality::smallint
    ) returning id into new_team_id;
    team_ids := array_append(team_ids, new_team_id);
  end loop;

  return team_ids;
end;
$$;

revoke all on function public.replace_tournament_teams(uuid, jsonb) from public, anon, authenticated;

-- 3. Creazione --------------------------------------------------------------

-- La firma cambia: "create or replace" non aggiunge argomenti, quindi la
-- vecchia si butta giu. I due parametri nuovi hanno un default che ripete il
-- comportamento di prima, cosi una pagina rimasta aperta continua a funzionare.
drop function if exists public.create_round_robin_tournament(text, text, text, numeric, jsonb);

create or replace function public.create_round_robin_tournament(
  p_name text,
  p_trophy_name text,
  p_trophy_badge text,
  p_elo_multiplier numeric,
  p_teams jsonb,
  p_sets_format smallint default 3,
  p_legs smallint default 1
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  new_tournament_id uuid;
  team_ids uuid[];
begin
  if current_user_id is null or not exists (select 1 from public.profiles where id = current_user_id) then
    raise exception 'Devi accedere per creare un torneo';
  end if;
  if p_trophy_badge not in ('cup', 'crown', 'shield', 'star') then
    raise exception 'Il simbolo del trofeo non è valido';
  end if;
  if p_elo_multiplier not in (1, 2) then
    raise exception 'Il moltiplicatore Elo deve essere 1 oppure 2';
  end if;
  if p_sets_format not in (1, 3) then
    raise exception 'Il formato deve essere un set secco o due set su tre';
  end if;
  if p_legs not in (1, 2) then
    raise exception 'Il girone è di sola andata oppure di andata e ritorno';
  end if;

  insert into public.padel_tournaments (
    name, trophy_name, trophy_badge, elo_multiplier, sets_format, legs, created_by
  ) values (
    trim(p_name), trim(p_trophy_name), p_trophy_badge, p_elo_multiplier,
    p_sets_format, p_legs, current_user_id
  ) returning id into new_tournament_id;

  team_ids := public.replace_tournament_teams(new_tournament_id, p_teams);
  perform public.build_tournament_fixtures(new_tournament_id, team_ids, p_legs);

  return new_tournament_id;
end;
$$;

revoke all on function public.create_round_robin_tournament(text, text, text, numeric, jsonb, smallint, smallint) from public;
grant execute on function public.create_round_robin_tournament(text, text, text, numeric, jsonb, smallint, smallint) to authenticated;

-- 4. Correzione -------------------------------------------------------------

-- Le stesse due regole delle partite, spostate sul torneo. Chi corregge: chi
-- l'ha montato e chiunque ci giochi dentro — sono le stesse persone che si
-- accorgono che una coppia e sbagliata o che il nome del trofeo e un altro.
-- Fino a quando: 24 ore dalla creazione, come per i risultati.
--
-- Cosa si puo cambiare sempre: nome, trofeo, moltiplicatore, formato, e
-- passare da sola andata ad andata e ritorno (il ritorno si aggiunge in fondo
-- al calendario, l'andata gia giocata resta dov'e).
-- Cosa no, quando c'e gia un risultato: le squadre — rifarebbero il girone da
-- capo e le partite giocate resterebbero appese al nulla — e togliere il
-- ritorno, se nel ritorno si e gia giocato.
create or replace function public.update_tournament(
  p_tournament_id uuid,
  p_name text,
  p_trophy_name text,
  p_trophy_badge text,
  p_elo_multiplier numeric,
  p_sets_format smallint,
  p_legs smallint,
  p_teams jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  tournament_record record;
  played_count integer;
  current_teams jsonb;
  wanted_teams jsonb;
  team_ids uuid[];
  last_number integer;
begin
  if current_user_id is null or not exists (select 1 from public.profiles where id = current_user_id) then
    raise exception 'Devi accedere per modificare un torneo';
  end if;

  select * into tournament_record from public.padel_tournaments where id = p_tournament_id;
  if not found then
    raise exception 'Torneo non trovato';
  end if;

  if tournament_record.created_at < now() - interval '24 hours' then
    raise exception 'Le modifiche si chiudono 24 ore dopo la creazione del torneo';
  end if;

  if tournament_record.created_by is distinct from current_user_id
    and not exists (
      select 1 from public.tournament_teams
      where tournament_id = p_tournament_id
        and (player_a = current_user_id or player_b = current_user_id)
    )
  then
    raise exception 'Può modificare il torneo chi l''ha creato o chi ci gioca';
  end if;

  if p_trophy_badge not in ('cup', 'crown', 'shield', 'star') then
    raise exception 'Il simbolo del trofeo non è valido';
  end if;
  if p_elo_multiplier not in (1, 2) then
    raise exception 'Il moltiplicatore Elo deve essere 1 oppure 2';
  end if;
  if p_sets_format not in (1, 3) then
    raise exception 'Il formato deve essere un set secco o due set su tre';
  end if;
  if p_legs not in (1, 2) then
    raise exception 'Il girone è di sola andata oppure di andata e ritorno';
  end if;

  select count(*) into played_count
  from public.tournament_fixtures
  where tournament_id = p_tournament_id and match_id is not null;

  select coalesce(jsonb_agg(
    jsonb_build_object('name', name, 'player_a', player_a, 'player_b', player_b)
    order by sort_order
  ), '[]'::jsonb)
  into current_teams
  from public.tournament_teams
  where tournament_id = p_tournament_id;

  -- Squadre non passate vuol dire "lasciale come stanno": chi corregge solo il
  -- nome del trofeo non deve mandare tutto il girone per non perderlo.
  if p_teams is null then
    wanted_teams := current_teams;
  else
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'name', trim(item ->> 'name'),
        'player_a', (item ->> 'player_a')::uuid,
        'player_b', (item ->> 'player_b')::uuid
      )
      order by ordinality
    ), '[]'::jsonb)
    into wanted_teams
    from jsonb_array_elements(p_teams) with ordinality as parsed(item, ordinality);
  end if;

  if wanted_teams is distinct from current_teams then
    if played_count > 0 then
      raise exception 'Le squadre non si cambiano quando c''è già un risultato: elimina il torneo e rifallo';
    end if;
    team_ids := public.replace_tournament_teams(p_tournament_id, p_teams);
    perform public.build_tournament_fixtures(p_tournament_id, team_ids, p_legs);
  elsif p_legs <> tournament_record.legs then
    select array_agg(id order by sort_order) into team_ids
    from public.tournament_teams where tournament_id = p_tournament_id;

    if p_legs = 2 then
      select coalesce(max(match_number), 0) into last_number
      from public.tournament_fixtures where tournament_id = p_tournament_id;
      perform public.build_tournament_fixtures(
        p_tournament_id, team_ids, 2::smallint, last_number + 1, 2::smallint
      );
    else
      if exists (
        select 1 from public.tournament_fixtures
        where tournament_id = p_tournament_id and leg = 2 and match_id is not null
      ) then
        raise exception 'Nel ritorno si è già giocato: non si torna alla sola andata';
      end if;
      delete from public.tournament_fixtures where tournament_id = p_tournament_id and leg = 2;
    end if;
  end if;

  update public.padel_tournaments
  set
    name = trim(p_name),
    trophy_name = trim(p_trophy_name),
    trophy_badge = p_trophy_badge,
    elo_multiplier = p_elo_multiplier,
    sets_format = p_sets_format,
    legs = p_legs,
    -- Il trigger sullo stato guarda solo match_id: dopo aver aggiunto o tolto
    -- il ritorno il conto va rifatto a mano.
    status = case
      when exists (
        select 1 from public.tournament_fixtures
        where tournament_id = p_tournament_id and match_id is null
      ) then 'active'
      else 'completed'
    end
  where id = p_tournament_id;

  -- Il moltiplicatore vive anche sulle partite gia registrate: se cambia qui,
  -- deve cambiare li, e la classifica va ripassata.
  if p_elo_multiplier <> tournament_record.elo_multiplier then
    update public.matches
    set elo_multiplier = p_elo_multiplier
    where id in (
      select match_id from public.tournament_fixtures
      where tournament_id = p_tournament_id and match_id is not null
    );
    perform public.recalculate_padel_ratings();
  end if;
end;
$$;

revoke all on function public.update_tournament(uuid, text, text, text, numeric, smallint, smallint, jsonb) from public;
grant execute on function public.update_tournament(uuid, text, text, text, numeric, smallint, smallint, jsonb) to authenticated;

-- 5. Eliminazione -----------------------------------------------------------

-- Solo chi ha creato il torneo, senza scadenza: come per le partite, chi si e
-- preso la responsabilita di montarlo e quello che puo smontarlo.
-- Si porta dietro i suoi risultati. Non e una scelta comoda ma e l'unica
-- onesta: quelle partite sono state giocate in un formato deciso dal torneo e
-- pesate con il suo moltiplicatore, lasciarle indietro come partite normali
-- vorrebbe dire cambiare a posteriori quanto sono valse.
create or replace function public.delete_tournament(p_tournament_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  tournament_record record;
begin
  if current_user_id is null then
    raise exception 'Devi accedere per eliminare un torneo';
  end if;

  select * into tournament_record from public.padel_tournaments where id = p_tournament_id;
  if not found then
    raise exception 'Torneo non trovato';
  end if;

  if tournament_record.created_by is distinct from current_user_id then
    raise exception 'Solo chi ha creato il torneo può eliminarlo';
  end if;

  perform pg_advisory_xact_lock(hashtext('theboyz_padel_results'));
  perform 1 from public.profiles order by id for update;

  -- Una cancellazione sola e un ricalcolo solo, invece di passare partita per
  -- partita da delete_match_unchecked: quello riconta tutto lo storico a ogni
  -- chiamata, e qui le partite possono essere dodici.
  delete from public.matches
  where id in (
    select match_id from public.tournament_fixtures
    where tournament_id = p_tournament_id and match_id is not null
  );

  delete from public.padel_tournaments where id = p_tournament_id;

  perform public.recalculate_padel_ratings();
end;
$$;

revoke all on function public.delete_tournament(uuid) from public;
grant execute on function public.delete_tournament(uuid) to authenticated;

-- 6. Il formato vale anche al momento del risultato -------------------------

-- Il tabellone del foglio partita mostra gia il numero giusto di set, ma la
-- regola non puo vivere solo li: un torneo secco non accetta una partita da
-- due set e viceversa.
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
  set_total integer;
begin
  if auth.uid() is null or not exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'Devi accedere per registrare il risultato del torneo';
  end if;

  select fixture.*, tournament.elo_multiplier, tournament.sets_format
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

  select count(*) into set_total from public.match_sets where match_id = p_match_id;
  if coalesce(fixture_record.sets_format, 3) = 1 and set_total <> 1 then
    raise exception 'Questo torneo si gioca al set secco: serve un set solo';
  end if;
  if coalesce(fixture_record.sets_format, 3) = 3 and set_total not between 2 and 3 then
    raise exception 'Questo torneo si gioca al meglio dei tre set';
  end if;

  update public.tournament_fixtures set match_id = p_match_id where id = p_fixture_id;
  update public.matches set elo_multiplier = fixture_record.elo_multiplier where id = p_match_id;
  perform public.recalculate_padel_ratings();
end;
$$;

revoke all on function public.assign_tournament_match(uuid, uuid) from public;
grant execute on function public.assign_tournament_match(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
