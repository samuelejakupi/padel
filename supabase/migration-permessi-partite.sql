-- TheBoyz · migrazione: chi puo correggere e chi puo eliminare una partita
-- Esegui questo file UNA SOLA VOLTA nel SQL Editor del progetto Supabase.
-- E idempotente: rilanciarlo non rompe nulla.
-- Richiede migration-storico-partite.sql, gia eseguita.
--
-- Le due regole.
--   1. Correggere: chiunque abbia giocato quella partita, entro 24 ore dalla
--      registrazione. Dopo, il risultato e storia e non lo tocca piu nessuno,
--      nemmeno chi c'era.
--   2. Eliminare: solo chi l'ha registrata, senza scadenza.
--
-- Da dove arrivano "chi l'ha registrata" e "quando". Non da `matches`:
-- correggere una partita significa cancellarla e riregistrarla — e l'unico
-- modo per far ricalcolare l'Elo in ordine cronologico — quindi `created_by` e
-- `created_at` della riga parlano dell'ultima correzione, non della prima
-- registrazione. La riga 'created' di `match_events` invece resta la stessa per
-- tutta la vita della partita, perche e appesa alla discendenza e non all'id:
-- e li che stanno l'autore vero e l'istante vero. Vedi
-- migration-storico-partite.sql.

-- L'origine di una partita: chi l'ha registrata la prima volta e quando.
-- Ricade su `matches` per le partite che non hanno ancora una riga di storico
-- (la migrazione dello storico le ha popolate tutte, ma una partita registrata
-- mentre lo storico e irraggiungibile resterebbe scoperta).
create or replace function public.match_origin(p_match_id uuid)
returns table (author_id uuid, started_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    coalesce(origine.author_id, partita.created_by),
    coalesce(origine.created_at, partita.created_at, partita.played_at)
  from public.matches as partita
  left join lateral (
    select evento.author_id, evento.created_at
    from public.match_events as evento
    where evento.lineage_id = coalesce(partita.lineage_id, partita.id)
      and evento.kind = 'created'
    order by evento.created_at
    limit 1
  ) as origine on true
  where partita.id = p_match_id;
$$;

revoke all on function public.match_origin(uuid) from public;
grant execute on function public.match_origin(uuid) to authenticated;

-- Il corpo dell'eliminazione, senza permessi: scala i delta della partita
-- rimossa e riconta lo storico. E lo stesso di migration-pareggi.sql, spostato
-- qui sotto un nome suo perche adesso ha due porte d'ingresso — l'eliminazione
-- vera e la correzione, che elimina e riregistra — e ognuna ha le sue regole.
-- Non e raggiungibile dal client: ci si passa solo dalle due porte.
create or replace function public.delete_match_unchecked(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  replay_match record;
begin
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

revoke all on function public.delete_match_unchecked(uuid) from public, anon, authenticated;

-- Porta 1: eliminare per davvero. Solo chi ha registrato la partita, sempre.
-- Chi ha giocato puo correggere il risultato, non farlo sparire: la partita
-- resta di chi l'ha messa a referto.
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
end;
$$;

revoke all on function public.delete_match(uuid) from public;
grant execute on function public.delete_match(uuid) to authenticated;

-- Porta 2: eliminare per riregistrare, cioe correggere. Aperta a chi ha
-- giocato la partita (e a chi l'ha registrata, che non sempre e in campo) e
-- solo entro 24 ore dalla registrazione.
-- Perche una funzione a parte e non un permesso piu largo sull'altra: se
-- bastasse una porta sola, chi ha giocato potrebbe eliminare e non
-- riregistrare, e il risultato sparirebbe comunque. Qui la partita esce
-- soltanto perche sta per rientrare corretta.
create or replace function public.delete_match_for_edit(p_match_id uuid)
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
    raise exception 'Devi accedere per correggere una partita';
  end if;

  select * into origine from public.match_origin(p_match_id);

  if not found then
    raise exception 'Partita non trovata';
  end if;

  if origine.started_at < now() - interval '24 hours' then
    raise exception 'Le correzioni si chiudono 24 ore dopo la registrazione';
  end if;

  if origine.author_id is distinct from current_user_id
    and not exists (
      select 1 from public.match_players
      where match_id = p_match_id and profile_id = current_user_id
    )
  then
    raise exception 'Può correggere il risultato solo chi ha giocato la partita';
  end if;

  perform public.delete_match_unchecked(p_match_id);
end;
$$;

revoke all on function public.delete_match_for_edit(uuid) from public;
grant execute on function public.delete_match_for_edit(uuid) to authenticated;

notify pgrst, 'reload schema';
