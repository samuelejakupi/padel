-- Account di servizio: account che entrano in TheBoyz per conto di un'altra
-- app (oggi PlayPro, che sincronizza partite e tornei ogni 10 minuti) e che
-- non giocano.
--
-- 1. Non si vedono: spariscono dagli elenchi dei profili (scelta dei
--    giocatori, tornei, Cashout, pizza) e dalla lista dei nomi della pagina
--    di accesso. Ognuno vede comunque se stesso, e le funzioni del database
--    (Elo, classifiche) non cambiano.
-- 2. Possono agganciare a un incontro di torneo una partita che hanno
--    registrato loro, anche se non hanno creato il torneo e non giocano
--    nell'incontro. Tutti gli altri controlli restano: i giocatori devono
--    essere quelli dell'abbinamento e il formato del risultato quello del
--    torneo.
--
-- Chi e un account di servizio sta in una tabella a parte, scrivibile solo
-- dal backend (come admin_members): non e un campo del profilo, che ognuno
-- puo in parte modificare.
--
-- Va eseguita dopo admin.sql, migration-tornei-individuali.sql e
-- migration-tornei-risultati-ordine-libero.sql. Idempotente.

begin;

create table if not exists public.service_accounts (
  profile_id uuid primary key references public.profiles(id) on delete cascade
);
alter table public.service_accounts enable row level security;
revoke all on public.service_accounts from public, anon, authenticated;
grant all on public.service_accounts to service_role;

-- Letta dalle regole di sicurezza con i permessi di chi fa la richiesta: per
-- questo e security definer, cosi la tabella resta chiusa.
create or replace function public.is_service_account(p_profile_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.service_accounts where profile_id = p_profile_id) $$;
revoke all on function public.is_service_account(uuid) from public;
grant execute on function public.is_service_account(uuid) to authenticated, service_role;

-- 1a. Profili: ognuno vede tutti tranne gli account di servizio, e se stesso.
drop policy if exists "Membri leggono i profili" on public.profiles;
create policy "Membri leggono i profili"
on public.profiles for select
to authenticated
using (id = (select auth.uid()) or not public.is_service_account(id));

-- 1b. Pagina di accesso: la lista dei nomi non li mostra. Si entra con
-- l'email, non scegliendo il nome.
create or replace function private.login_directory()
returns table(username text, display_name text)
language sql stable security definer set search_path = ''
as $$ select l.username, p.display_name from public.member_logins l
join public.profiles p on p.id = l.profile_id
where not public.is_service_account(l.profile_id)
order by lower(p.display_name), l.username $$;

-- 2. Aggancio ai tornei. Si cambia solo la condizione su chi puo farlo,
-- dentro la funzione com'e adesso nel database (altre migrazioni l'hanno gia
-- modificata sul posto); se la condizione non si trova, ci si ferma.
do $$
declare
  definition text := pg_get_functiondef('public.assign_tournament_match(uuid,uuid)'::regprocedure);
  old_guard text := 'auth.uid() <> all(expected1 || expected2) then';
  new_guard text := 'auth.uid() <> all(expected1 || expected2)
     and not public.is_service_account(auth.uid()) then';
begin
  if position('is_service_account' in definition) > 0 then
    return; -- gia applicata
  end if;
  if position(old_guard in definition) = 0 then
    raise exception 'Controllo dei permessi non trovato: verificare assign_tournament_match prima di applicare';
  end if;
  execute replace(definition, old_guard, new_guard);
end;
$$;

-- L'account di PlayPro, creato dal pannello Admin.
insert into public.service_accounts(profile_id)
select u.id from auth.users u
join public.profiles p on p.id = u.id
where lower(u.email) = 'playpro@theboyz.local'
on conflict do nothing;

notify pgrst, 'reload schema';
commit;
