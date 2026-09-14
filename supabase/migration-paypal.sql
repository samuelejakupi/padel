-- TheBoyz · PayPal.Me nei profili e nei saldi Cashout
-- Esegui questo file nel SQL Editor di Supabase. È idempotente.

alter table public.profiles
  add column if not exists paypal_me_username text;

alter table public.profiles
  drop constraint if exists profiles_paypal_me_username_check;
alter table public.profiles
  add constraint profiles_paypal_me_username_check
  check (paypal_me_username is null or paypal_me_username ~ '^[A-Za-z0-9]{1,20}$');

-- La policy esistente limita già l'update alla riga dell'utente autenticato.
-- Il grant per colonna impedisce di usare questo permesso per cambiare Elo o
-- statistiche del profilo.
grant update (paypal_me_username) on public.profiles to authenticated;
