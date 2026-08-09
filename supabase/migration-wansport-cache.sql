-- TheBoyz · migrazione: cache del tabellone Wansport
-- Esegui questo file UNA SOLA VOLTA nel SQL Editor del progetto Supabase.
-- E idempotente: rilanciarlo non rompe nulla.
--
-- A cosa serve. La Edge Function `wansport-slots` interroga il sito del club a
-- ogni apertura della vista. Senza cache, tre persone che guardano lo stesso
-- campo nello stesso minuto sono tre chiamate identiche; con un minuto di
-- memoria diventano una. Non e un'ottimizzazione di velocita ma di educazione:
-- il tabellone lo leggiamo da un sito che non e nostro.
--
-- Cosa NON ci finisce dentro. La risposta di Wansport contiene nome e cognome
-- di chi ha prenotato. La funzione li scarta prima di arrivare qui: in
-- `payload` c'e solo la griglia libero/occupato. Se un giorno il contenuto di
-- questa tabella dovesse cambiare forma, e la prima cosa da ricontrollare.

create table if not exists public.wansport_cache (
  club text not null,
  giorno date not null,
  payload jsonb not null,
  fetched_at timestamptz not null default now(),
  primary key (club, giorno)
);

comment on table public.wansport_cache is
  'Cache a un minuto del tabellone Wansport. Solo dati liberi/occupati: nessun dato personale.';

-- Nessuno la legge dal client, nemmeno da autenticato: ci parla solo la Edge
-- Function, che usa la service role key e scavalca le policy. RLS attiva senza
-- nessuna policy significa esattamente questo — porta chiusa per tutti gli
-- altri. E il motivo per cui non serve un `grant` a `authenticated`.
alter table public.wansport_cache enable row level security;

-- Le righe vecchie non servono a niente: il tabellone di ieri non lo guarda
-- nessuno. Non c'e un job schedulato, quindi la pulizia la fa la funzione
-- stessa quando le capita di passare — o si lancia a mano questa riga.
create or replace function public.pulisci_wansport_cache()
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.wansport_cache where giorno < current_date;
$$;

revoke all on function public.pulisci_wansport_cache() from public;
