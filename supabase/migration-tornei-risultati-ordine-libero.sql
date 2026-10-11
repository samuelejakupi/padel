-- Rimuove il vincolo d'ordine soltanto nei calendari già completi.
-- Conserva la funzione corrente e tutti i controlli di accesso e risultato.
begin;
do $$
declare
  definition text := pg_get_functiondef('public.assign_tournament_match(uuid,uuid)'::regprocedure);
  old_guard text := 'if exists(select 1 from public.tournament_fixtures
            where tournament_id=f.tournament_id and match_number<f.match_number and match_id is null) then';
begin
  if position(old_guard in definition)=0 then
    raise exception 'Controllo ordine non trovato: verificare assign_tournament_match prima di applicare';
  end if;
  definition := replace(definition,
    'fixture.*,t.mode,t.elo_multiplier,t.sets_format,t.created_by',
    'fixture.*,t.mode,t.individual_schedule,t.elo_multiplier,t.sets_format,t.created_by');
  definition := replace(definition, old_guard,
    'if f.mode=''individual'' and coalesce(f.individual_schedule,''adaptive'')<>''complete''
     and exists(select 1 from public.tournament_fixtures
            where tournament_id=f.tournament_id and match_number<f.match_number and match_id is null) then');
  execute definition;
end;
$$;
notify pgrst, 'reload schema';
commit;
