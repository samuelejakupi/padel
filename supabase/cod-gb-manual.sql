-- Inserimento manuale: usa le stesse validazioni e pubblica subito la classifica.
alter table public.cod_gbs drop constraint if exists cod_gbs_image_count_check;
alter table public.cod_gbs add constraint cod_gbs_image_count_check check (image_count between 0 and 4);
alter table public.cod_gbs add column if not exists input_method text not null default 'photo' check (input_method in ('photo','manual'));

create or replace function public.record_cod_gb_manual(p_mode text, p_map text, p_played_at timestamptz, p_result jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare gb uuid; player jsonb; nick text; players jsonb := '[]';
begin
  if auth.uid() is null or not exists(select 1 from profiles where id=auth.uid()) then raise exception 'Accesso richiesto'; end if;
  if p_played_at > now()+interval '10 minutes' then raise exception 'La partita non può essere nel futuro'; end if;
  if (select count(*) from cod_gbs where created_by=auth.uid() and created_at>now()-interval '1 day')>=30 then raise exception 'Limite giornaliero raggiunto'; end if;
  if jsonb_typeof(p_result->'players') is distinct from 'array' then raise exception 'Giocatori richiesti'; end if;
  for player in select * from jsonb_array_elements(p_result->'players') loop
    if nullif(player->>'profile_id','') is not null then
      select nickname into nick from cod_identities where profile_id=(player->>'profile_id')::uuid order by created_at,id limit 1;
      if nick is null then raise exception 'Associa prima il nick COD dei giocatori selezionati'; end if;
      player := player || jsonb_build_object('nickname',nick);
    end if;
    players := players || jsonb_build_array(player);
  end loop;
  insert into cod_gbs(created_by,played_at,mode,map_name,image_count,status,input_method)
    values(auth.uid(),p_played_at,p_mode,btrim(p_map),0,'processing','manual') returning id into gb;
  perform complete_cod_gb(gb,p_result || jsonb_build_object('mode',p_mode,'players',players));
  return gb;
end; $$;
revoke all on function public.record_cod_gb_manual(text,text,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.record_cod_gb_manual(text,text,timestamptz,jsonb) to authenticated;
notify pgrst,'reload schema';
