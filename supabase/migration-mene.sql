-- TheBoyz · migrazione: nono profilo del gruppo (Mene)
-- Esegui questo file nel SQL Editor di Supabase **prima** di creare l'account
-- di Mene. È idempotente: rilanciarlo non rompe nulla.
--
-- Il roster è fisso e vive in due punti che devono restare allineati: l'array
-- `groupUsers` in `app/page.tsx` e l'elenco di email dentro
-- `handle_new_user()`. Questo file porta nel database la stessa modifica già
-- fatta in `supabase/schema.sql`, senza dover rieseguire tutto lo schema su un
-- progetto vivo.
--
-- L'ordine conta. Il trigger `on_auth_user_created` rifiuta qualsiasi account
-- che non sia in elenco, quindi finché questo file non gira la creazione di
-- `mene@theboyz.local` dal Dashboard fallisce con "Registrazione pubblica
-- disabilitata". Se l'account è già stato creato e il profilo manca, ci pensa
-- il recupero in fondo.
--
-- Il limite passa da 8 a 9 profili: era la rete di sicurezza contro le
-- registrazioni non volute, e va spostata insieme al roster o il nono profilo
-- non entra.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  member_count integer;
  requested_name text;
begin
  perform pg_advisory_xact_lock(hashtext('theboyz_members'));
  select count(*) into member_count from public.profiles;

  requested_name := case lower(coalesce(new.email, ''))
    when 'samu@theboyz.local' then 'Samu'
    when 'dani@theboyz.local' then 'Dani'
    when 'atti@theboyz.local' then 'Atti'
    when 'matte@theboyz.local' then 'Matte'
    when 'fabio@theboyz.local' then 'Fabio'
    when 'alban@theboyz.local' then 'Alban'
    when 'mattia@theboyz.local' then 'Mattia'
    when 'manu@theboyz.local' then 'Manu'
    when 'mene@theboyz.local' then 'Mene'
    else null
  end;

  if requested_name is null then
    raise exception 'Registrazione pubblica disabilitata';
  end if;

  if member_count >= 9 then
    raise exception 'Tutti i profili TheBoyz sono già stati creati';
  end if;

  insert into public.profiles (id, display_name)
  values (new.id, requested_name);
  return new;
end;
$$;

-- Recupero: se l'account di Mene esiste già ma il profilo no — perché il
-- Dashboard è stato usato prima di questo file — il profilo viene creato
-- adesso. Se l'account non c'è, non trova niente da fare.
insert into public.profiles (id, display_name)
select user_account.id, 'Mene'
from auth.users as user_account
where lower(user_account.email) = 'mene@theboyz.local'
  and not exists (
    select 1 from public.profiles as profile where profile.id = user_account.id
  )
on conflict (id) do nothing;

notify pgrst, 'reload schema';
