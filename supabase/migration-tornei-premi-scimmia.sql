-- La scelta della coppa e i relativi premi vengono salvati insieme al torneo.
-- Le funzioni esistenti restano disponibili per i client che non sono ancora aggiornati.

begin;

create or replace function public.set_tournament_award_image(
  p_tournament_id uuid, p_trophy_image_path text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_trophy_image_path is not null and p_trophy_image_path not in (
    'trophies/coppa-theboyz.png', 'trophies/scimmia-padel-banana.png'
  ) then
    raise exception 'Coppa non valida';
  end if;
  update public.padel_tournaments
  set trophy_image_path = p_trophy_image_path
  where id = p_tournament_id;
  if not found then
    raise exception 'Torneo non trovato';
  end if;
end;
$$;
revoke all on function public.set_tournament_award_image(uuid, text) from public, anon, authenticated;

create or replace function public.create_round_robin_tournament_with_trophy(
  p_name text, p_trophy_name text, p_trophy_badge text,
  p_elo_multiplier numeric, p_teams jsonb, p_sets_format smallint,
  p_legs smallint, p_trophy_image_path text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare result_id uuid;
begin
  result_id := public.create_round_robin_tournament(
    p_name, p_trophy_name, p_trophy_badge, p_elo_multiplier,
    p_teams, p_sets_format, p_legs
  );
  perform public.set_tournament_award_image(result_id, p_trophy_image_path);
  return result_id;
end;
$$;
revoke all on function public.create_round_robin_tournament_with_trophy(text, text, text, numeric, jsonb, smallint, smallint, text) from public, anon;
grant execute on function public.create_round_robin_tournament_with_trophy(text, text, text, numeric, jsonb, smallint, smallint, text) to authenticated;

create or replace function public.update_tournament_with_trophy(
  p_tournament_id uuid, p_name text, p_trophy_name text, p_trophy_badge text,
  p_elo_multiplier numeric, p_sets_format smallint, p_legs smallint,
  p_teams jsonb, p_trophy_image_path text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.update_tournament(
    p_tournament_id, p_name, p_trophy_name, p_trophy_badge,
    p_elo_multiplier, p_sets_format, p_legs, p_teams
  );
  perform public.set_tournament_award_image(p_tournament_id, p_trophy_image_path);
end;
$$;
revoke all on function public.update_tournament_with_trophy(uuid, text, text, text, numeric, smallint, smallint, jsonb, text) from public, anon;
grant execute on function public.update_tournament_with_trophy(uuid, text, text, text, numeric, smallint, smallint, jsonb, text) to authenticated;

create or replace function public.create_individual_tournament_with_trophy(
  p_name text, p_trophy_name text, p_trophy_badge text,
  p_elo_multiplier numeric, p_players uuid[], p_cycles smallint,
  p_trophy_image_path text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare result_id uuid;
begin
  result_id := public.create_individual_tournament(
    p_name, p_trophy_name, p_trophy_badge, p_elo_multiplier,
    p_players, p_cycles
  );
  perform public.set_tournament_award_image(result_id, p_trophy_image_path);
  return result_id;
end;
$$;
revoke all on function public.create_individual_tournament_with_trophy(text, text, text, numeric, uuid[], smallint, text) from public, anon;
grant execute on function public.create_individual_tournament_with_trophy(text, text, text, numeric, uuid[], smallint, text) to authenticated;

create or replace function public.create_complete_individual_tournament_with_trophy(
  p_name text, p_trophy_name text, p_trophy_badge text,
  p_elo_multiplier numeric, p_players uuid[], p_trophy_image_path text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare result_id uuid;
begin
  result_id := public.create_complete_individual_tournament(
    p_name, p_trophy_name, p_trophy_badge, p_elo_multiplier, p_players
  );
  perform public.set_tournament_award_image(result_id, p_trophy_image_path);
  return result_id;
end;
$$;
revoke all on function public.create_complete_individual_tournament_with_trophy(text, text, text, numeric, uuid[], text) from public, anon;
grant execute on function public.create_complete_individual_tournament_with_trophy(text, text, text, numeric, uuid[], text) to authenticated;

notify pgrst, 'reload schema';

commit;
