-- GB MW4: le morti diventano facoltative.
--
-- Questo Call of Duty nello scoreboard mostra le morti solo per alcuni
-- giocatori: per ora una GB si pubblica con le sole uccisioni, e le morti
-- (quindi il K/D) restano vuote. Le uccisioni restano obbligatorie.
-- Vale per la lettura notturna delle foto e per l'inserimento a mano, che
-- passano entrambi da complete_cod_gb.
--
-- Si cambia solo quel controllo, dentro la funzione com'e adesso nel
-- database; se non lo trova si ferma. Va eseguita dopo cod-gb.sql.
-- Idempotente.

begin;
do $$
declare
  definition text := pg_get_functiondef('public.complete_cod_gb(uuid,jsonb)'::regprocedure);
  old_check text := 'foreach key in array array[''kills'',''deaths''] loop
      if (player->>key) is null or (player->>key)::int not between 0 and 10000 then raise exception ''K/D non valido''; end if;
    end loop;';
  new_check text := 'if (player->>''kills'') is null or (player->>''kills'')::int not between 0 and 10000 then raise exception ''Uccisioni non valide''; end if;
    if player->>''deaths'' is not null and (player->>''deaths'')::int not between 0 and 10000 then raise exception ''Morti non valide''; end if;
    if not (player ? ''deaths'') then player := player || jsonb_build_object(''deaths'', null); end if;';
begin
  if position('Morti non valide' in definition) > 0 then
    return; -- gia applicata
  end if;
  if position(old_check in definition) = 0 then
    raise exception 'Controllo delle morti non trovato: verificare complete_cod_gb prima di applicare';
  end if;
  execute replace(definition, old_check, new_check);
end;
$$;
notify pgrst, 'reload schema';
commit;
