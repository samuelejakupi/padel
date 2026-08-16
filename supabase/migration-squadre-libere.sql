-- TheBoyz · squadre che nascono prima delle partite
--
-- Fino a qui una coppia esisteva solo se aveva giocato: le squadre si
-- ricavavano dalle partite e `padel_teams` serviva solo a darle un nome e una
-- foto. Chi non aveva ancora giocato con qualcuno non poteva formare la
-- squadra — che è esattamente il momento in cui uno la vuole formare.
--
-- Il permesso di creare c'era già (basta far parte della coppia): quello che
-- manca è poterla togliere. Serve perché adesso una squadra si crea a mano, e
-- una squadra creata per sbaglio non deve restare lì per sempre.
--
-- Le partite non c'entrano e non si toccano: sono appese ai giocatori, non
-- alla riga di `padel_teams`. Togliere una squadra toglie nome, foto e la riga
-- in classifica; i risultati restano dove sono.
--
-- Esegui questo file nel SQL Editor di Supabase. È idempotente.

drop policy if exists "I membri eliminano la propria squadra" on public.padel_teams;
create policy "I membri eliminano la propria squadra"
on public.padel_teams for delete
to authenticated
using (auth.uid() in (player_a, player_b));

grant delete on public.padel_teams to authenticated;

notify pgrst, 'reload schema';
