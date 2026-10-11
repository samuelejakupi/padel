-- Eseguire dopo supabase/friendly-matches.sql. Nessun dato di prova viene conservato.
begin;
select set_config('request.jwt.claim.sub','2a3d16f1-0240-4d47-8139-a915a508bfd9',true);
do $test$
declare ids uuid[]; mid uuid; planned_id uuid; baseline jsonb; after_friendly jsonb; blocked boolean := false; played_before bigint;
begin
  select array_agg(id order by id) into ids from (select id from public.profiles order by id limit 4) p;
  if cardinality(ids) <> 4 then raise exception 'Servono quattro profili'; end if;
  perform public.recalculate_padel_ratings();
  select jsonb_agg(jsonb_build_array(id,rating,matches_played,wins,losses,draws,current_streak) order by id),
    sum(matches_played) into baseline,played_before from public.profiles;
  mid := public.record_friendly_match(now()-interval '2 days',ids[1:2],ids[3:4],
    '[{"team1_games":6,"team2_games":2},{"team1_games":6,"team2_games":3}]');
  if not exists(select 1 from public.matches where id=mid and is_friendly and rating_delta=0 and not mvp_voting_enabled)
    or exists(select 1 from public.match_players where match_id=mid and (rating_delta<>0 or rating_before<>rating_after)) then
    raise exception 'Amichevole con Elo o MVP';
  end if;
  select jsonb_agg(jsonb_build_array(id,rating,matches_played,wins,losses,draws,current_streak) order by id)
    into after_friendly from public.profiles;
  if baseline<>after_friendly then raise exception 'Amichevole cambia classifica o statistiche'; end if;
  perform public.recalculate_padel_ratings();
  select jsonb_agg(jsonb_build_array(id,rating,matches_played,wins,losses,draws,current_streak) order by id)
    into after_friendly from public.profiles;
  if baseline<>after_friendly then raise exception 'Ricalcolo include amichevoli'; end if;
  begin
    update public.tournament_fixtures set match_id=mid where id=(select id from public.tournament_fixtures limit 1);
  exception when raise_exception then
    if sqlerrm='Una partita amichevole non può essere assegnata a un torneo' then blocked:=true; else raise; end if;
  end;
  if exists(select 1 from public.tournament_fixtures) and not blocked then raise exception 'Amichevole ammessa al torneo'; end if;
  perform public.delete_match(mid);
  select jsonb_agg(jsonb_build_array(id,rating,matches_played,wins,losses,draws,current_streak) order by id)
    into after_friendly from public.profiles;
  if baseline<>after_friendly then raise exception 'Eliminazione amichevole cambia classifica'; end if;
  planned_id := public.create_random_match(now(),ids,'Campo di prova',null);
  mid := public.complete_random_friendly_match(planned_id,'[{"team1_games":6,"team2_games":2}]');
  if exists(select 1 from public.planned_matches where id=planned_id)
    or not exists(select 1 from public.matches where id=mid and is_friendly and court='Campo di prova') then
    raise exception 'Completamento casuale amichevole non riuscito';
  end if;
  select jsonb_agg(jsonb_build_array(id,rating,matches_played,wins,losses,draws,current_streak) order by id)
    into after_friendly from public.profiles;
  if baseline<>after_friendly then raise exception 'Squadre casuali amichevoli cambiano classifica'; end if;
  mid := public.record_match(now(),ids[1:2],ids[3:4],'[{"team1_games":6,"team2_games":2}]');
  if (select sum(matches_played) from public.profiles)<>played_before+4 then raise exception 'Regressione conteggio partita competitiva'; end if;
end $test$;
select 'Amichevoli escluse; creazione, ricalcolo, eliminazione e blocco tornei verificati' as risultato;
rollback;
