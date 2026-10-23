-- Cashout: eliminare una spesa o un saldo registrati per errore.
-- Prima non si poteva: uno sbaglio restava nei conti per sempre.
-- Puo eliminare chi l'ha inserito, oppure un admin. Chi ha pagato e le quote
-- della spesa se ne vanno in cascata (on delete cascade), e i saldi del
-- gruppo si ricalcolano da soli perche sono calcolati, non salvati.
-- Idempotente: si puo rieseguire. Va eseguita dopo migration-cashout.sql.

create or replace function public.delete_cashout_expense(p_expense_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.cashout_expenses
  where id = p_expense_id
    and (created_by = auth.uid() or exists (select 1 from public.admin_members where profile_id = auth.uid()));
  if not found then raise exception 'Spesa non eliminabile: puo farlo solo chi l''ha inserita'; end if;
end;
$$;

create or replace function public.delete_cashout_settlement(p_settlement_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.cashout_settlements
  where id = p_settlement_id
    and (created_by = auth.uid() or exists (select 1 from public.admin_members where profile_id = auth.uid()));
  if not found then raise exception 'Saldo non eliminabile: puo farlo solo chi l''ha registrato'; end if;
end;
$$;

revoke all on function public.delete_cashout_expense(uuid) from public, anon;
revoke all on function public.delete_cashout_settlement(uuid) from public, anon;
grant execute on function public.delete_cashout_expense(uuid) to authenticated;
grant execute on function public.delete_cashout_settlement(uuid) to authenticated;
notify pgrst, 'reload schema';
