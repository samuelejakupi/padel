-- TheBoyz · migrazione: campo da gioco della partita
-- Esegui questo file UNA SOLA VOLTA nel SQL Editor del progetto Supabase.
-- È idempotente: rilanciarlo non rompe nulla.
--
-- Perché una RPC dedicata invece di cambiare record_match.
-- record_match ricalcola l'Elo di tutti i giocatori: è la funzione più
-- delicata dello schema e riscriverla per aggiungere un parametro
-- significherebbe sostituirne il corpo per intero. Il campo da gioco è
-- solo un'etichetta e non entra in nessun calcolo, quindi segue lo stesso
-- schema già usato da set_match_lineage: si scrive subito dopo aver
-- registrato la partita, con una funzione piccola e isolata.

alter table public.matches
  add column if not exists court text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'matches_court_length'
  ) then
    alter table public.matches
      add constraint matches_court_length
      check (court is null or char_length(court) <= 60);
  end if;
end;
$$;

create or replace function public.set_match_court(p_match_id uuid, p_court text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Devi accedere per modificare una partita';
  end if;

  update public.matches
  set court = nullif(trim(p_court), '')
  where id = p_match_id;
end;
$$;

revoke all on function public.set_match_court(uuid, text) from public;
grant execute on function public.set_match_court(uuid, text) to authenticated;
