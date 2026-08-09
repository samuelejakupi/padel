-- TheBoyz · migrazione: sessioni Wansport
-- Esegui questo file UNA SOLA VOLTA nel SQL Editor del progetto Supabase.
-- E idempotente: rilanciarlo non rompe nulla.
--
-- A cosa serve. Alcuni centri mostrano il tabellone solo ai propri iscritti.
-- Dove abbiamo un'iscrizione, la Edge Function `wansport-slots` fa il login e
-- da quel momento ha una sessione: qui la parcheggia per riusarla. Senza,
-- ogni apertura della vista sarebbe un accesso nuovo, e nel registro del club
-- comparirebbero centinaia di login a nome nostro nel giro di una settimana.
-- Con quindici minuti di riuso ne restano una manciata al giorno.
--
-- Cosa c'e dentro. Un cookie di sessione Joomla, che vale finche vale e poi
-- diventa una stringa inutile. NON ci sono credenziali: utente e password
-- stanno nei secret della funzione (`supabase secrets set`) e non toccano mai
-- il database.

create table if not exists public.wansport_sessioni (
  club text primary key,
  cookie text not null,
  creata_il timestamptz not null default now()
);

comment on table public.wansport_sessioni is
  'Cookie di sessione Wansport per i club dove siamo iscritti. Nessuna credenziale: quelle stanno nei secret della Edge Function.';

-- Come per la cache: RLS attiva e nessuna policy. Ci parla solo la Edge
-- Function con la service role key, che scavalca le policy. Qui la porta
-- chiusa conta piu che altrove — un cookie di sessione e a tutti gli effetti
-- una chiave, e chi ce l'ha entra come noi.
alter table public.wansport_sessioni enable row level security;

-- Per invalidare tutto a mano, il giorno che serve (password cambiata, club
-- che ci toglie l'iscrizione, sospetto di qualsiasi genere):
--   delete from public.wansport_sessioni;
