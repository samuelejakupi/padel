-- ATTENZIONE — SUPERATA da migration-permessi-partite.sql (13 agosto 2026).
-- Questo file limitava modifica ed eliminazione a chi aveva registrato la
-- partita, entro 24 ore. La regola concordata poi e un'altra: correggere lo puo
-- fare chiunque abbia giocato, entro 24 ore; eliminare resta all'autore senza
-- scadenza. Rilanciare questo file rimetterebbe le vecchie regole al posto di
-- quelle nuove: se serve rieseguirlo, subito dopo va rieseguita anche
-- migration-permessi-partite.sql, che deve restare l'ultima parola.

-- Soltanto il creatore può correggere o eliminare una partita, e soltanto
-- nelle prime 24 ore dalla creazione. La modifica dell'app passa dalla stessa
-- funzione: elimina il vecchio risultato e lo registra nuovamente.

create or replace function public.delete_match(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  replay_match record;
  match_creator_id uuid;
  match_created_at timestamptz;
begin
  if current_user_id is null then
    raise exception 'Devi accedere per eliminare una partita';
  end if;

  if not exists (select 1 from public.profiles where id = current_user_id) then
    raise exception 'Profilo giocatore non trovato';
  end if;

  perform pg_advisory_xact_lock(hashtext('theboyz_padel_results'));
  perform 1 from public.profiles order by id for update;

  select created_by, created_at
  into match_creator_id, match_created_at
  from public.matches
  where id = p_match_id;

  if not found then
    raise exception 'Partita non trovata';
  end if;

  if match_creator_id is distinct from current_user_id then
    raise exception 'Solo chi ha creato la partita può modificarla o eliminarla';
  end if;

  if match_created_at + interval '24 hours' <= now() then
    raise exception 'La partita è bloccata: sono trascorse più di 24 ore dalla creazione';
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
revoke all on function public.delete_match(uuid) from anon;
grant execute on function public.delete_match(uuid) to authenticated;
