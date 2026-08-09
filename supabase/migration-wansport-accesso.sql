-- TheBoyz · migrazione: accesso Wansport salvato dall'app
-- Esegui questo file UNA SOLA VOLTA nel SQL Editor del progetto Supabase.
-- E idempotente: rilanciarlo non rompe nulla.
--
-- A cosa serve. Le credenziali dell'account Wansport del gruppo si mettono dal
-- profilo, dentro l'app, invece che dal Dashboard. Qui c'e il posto dove
-- finiscono e le due sole porte per arrivarci.
--
-- Dove finiscono: nel Vault, non in una tabella normale. Il Vault cifra sul
-- disco e tiene la chiave di cifratura FUORI dal database, sui sistemi di
-- Supabase: un dump del database, un backup o uno stream di replica non
-- contengono niente di leggibile. Con una tabella comune, chiunque riuscisse a
-- leggere il database si porterebbe via la password in chiaro.
--
-- Chi puo passarci. Le due funzioni sono `security definer` e l'esecuzione e
-- revocata a `anon` e `authenticated`: dal telefono non si chiamano, nemmeno
-- da loggati. Ci arriva solo la Edge Function `wansport-slots`, che usa la
-- service role key. In particolare `accesso_wansport()` — quella che
-- restituisce la password in chiaro — non deve MAI diventare chiamabile dal
-- client: e l'unico punto di questo file in cui un errore si paga caro.

create extension if not exists supabase_vault with schema vault;

-- Salva (o aggiorna) la coppia. I due valori stanno in due segreti distinti
-- con nome fisso, cosi non serve tenere da nessuna parte gli id del Vault.
create or replace function public.salva_accesso_wansport(utente text, segreto text)
returns void
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  id_utente uuid;
  id_segreto uuid;
begin
  if coalesce(trim(utente), '') = '' or coalesce(segreto, '') = '' then
    raise exception 'Utente e password non possono essere vuoti';
  end if;

  select id into id_utente from vault.secrets where name = 'wansport_user';
  if id_utente is null then
    perform vault.create_secret(trim(utente), 'wansport_user', 'Account Wansport del gruppo · utente');
  else
    perform vault.update_secret(id_utente, trim(utente), 'wansport_user', 'Account Wansport del gruppo · utente');
  end if;

  select id into id_segreto from vault.secrets where name = 'wansport_pass';
  if id_segreto is null then
    perform vault.create_secret(segreto, 'wansport_pass', 'Account Wansport del gruppo · password');
  else
    perform vault.update_secret(id_segreto, segreto, 'wansport_pass', 'Account Wansport del gruppo · password');
  end if;
end;
$$;

-- Rilegge la coppia. Torna `null` se non e mai stata salvata.
create or replace function public.accesso_wansport()
returns table (utente text, segreto text)
language sql
security definer
set search_path = public, vault, pg_temp
as $$
  select
    (select decrypted_secret from vault.decrypted_secrets where name = 'wansport_user'),
    (select decrypted_secret from vault.decrypted_secrets where name = 'wansport_pass');
$$;

-- Dice solo se c'e o non c'e. Serve al profilo per scrivere "configurato"
-- senza farsi passare niente di sensibile.
create or replace function public.accesso_wansport_configurato()
returns boolean
language sql
security definer
set search_path = public, vault, pg_temp
as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'wansport_pass');
$$;

-- La porta si chiude qui. `revoke ... from public` toglie il permesso che
-- Postgres darebbe in automatico a chiunque; i due ruoli dell'API sono
-- nominati a parte perche e quello che si legge male quando si rilegge il
-- file fra sei mesi.
revoke all on function public.salva_accesso_wansport(text, text) from public, anon, authenticated;
revoke all on function public.accesso_wansport() from public, anon, authenticated;
revoke all on function public.accesso_wansport_configurato() from public, anon, authenticated;

-- Per cancellare tutto a mano, il giorno che serve:
--   delete from vault.secrets where name in ('wansport_user', 'wansport_pass');
--   delete from public.wansport_sessioni;
