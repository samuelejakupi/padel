-- Eseguire dopo migration-partite-casuali.sql.
-- Al salvataggio del risultato complete_random_match rimuove la riga
-- programmata nella stessa transazione. Il risultato vive in public.matches.
begin;

drop policy if exists "planned matches deletable by members" on public.planned_matches;
create policy "planned matches deletable by members"
on public.planned_matches for delete
to authenticated
using (exists (select 1 from public.profiles where id = (select auth.uid())));

grant delete on public.planned_matches to authenticated;

commit;
