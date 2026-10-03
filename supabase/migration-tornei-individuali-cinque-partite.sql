-- Corregge il girone individuale completo a cinque giocatori:
-- cinque partite, un riposo a testa, ogni coppia insieme una volta e contro
-- due volte. Eseguire dopo migration-tornei-individuali-completi-cinque.sql.

begin;

alter table public.padel_tournaments
  drop constraint if exists padel_tournaments_individual_schedule_check;
alter table public.padel_tournaments
  add constraint padel_tournaments_individual_schedule_check check (
    individual_schedule = 'adaptive'
    or (individual_schedule = 'complete' and mode = 'individual'
        and target_matches = 5 and sets_format = 1)
  );

create or replace function public.create_complete_individual_tournament(
  p_name text, p_trophy_name text, p_trophy_badge text,
  p_elo_multiplier numeric, p_players uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  result_id uuid;
  shuffled_ids uuid[];
  rest_order integer[];
  turn integer;
  resting integer;
  a uuid;
  b uuid;
  c uuid;
  d uuid;
  player1 uuid;
  player2 uuid;
  player3 uuid;
  player4 uuid;
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles where id = auth.uid()
  ) then
    raise exception 'Devi accedere per creare un torneo';
  end if;
  if p_players is null or cardinality(p_players) <> 5 then
    raise exception 'Il girone completo richiede esattamente cinque partecipanti';
  end if;
  if (select count(distinct player_id) from unnest(p_players) as participant(player_id)) <> 5
    or exists (
      select 1 from unnest(p_players) as participant(player_id)
      where not exists (select 1 from public.profiles where id = participant.player_id)
    ) then
    raise exception 'I partecipanti devono essere distinti e registrati';
  end if;
  if nullif(trim(p_name), '') is null or nullif(trim(p_trophy_name), '') is null
    or length(trim(p_name)) > 70 or length(trim(p_trophy_name)) > 60 then
    raise exception 'Inserisci un nome valido per il torneo e per il trofeo';
  end if;
  if p_elo_multiplier is null or p_elo_multiplier not in (1, 2) then
    raise exception 'Il moltiplicatore Elo deve essere 1 o 2';
  end if;

  insert into public.padel_tournaments
    (name, trophy_name, trophy_badge, elo_multiplier, sets_format, legs,
     created_by, mode, target_matches, individual_schedule)
  values
    (trim(p_name), trim(p_trophy_name), p_trophy_badge, p_elo_multiplier, 1, 1,
     auth.uid(), 'individual', 5, 'complete')
  returning id into result_id;

  insert into public.tournament_participants (tournament_id, profile_id, sort_order)
  select result_id, participant.player_id, participant.ordinality::smallint
  from unnest(p_players) with ordinality as participant(player_id, ordinality);

  select array_agg(player_id order by random()) into shuffled_ids
  from unnest(p_players) as participant(player_id);
  select array_agg(index_no order by random()) into rest_order
  from generate_series(0, 4) as rest(index_no);

  for turn in 1..5 loop
    resting := rest_order[turn];
    a := shuffled_ids[((resting + 1) % 5) + 1];
    b := shuffled_ids[((resting + 4) % 5) + 1];
    c := shuffled_ids[((resting + 2) % 5) + 1];
    d := shuffled_ids[((resting + 3) % 5) + 1];

    if random() < 0.5 then
      player1 := a; player2 := b; player3 := c; player4 := d;
    else
      player1 := c; player2 := d; player3 := a; player4 := b;
    end if;

    insert into public.tournament_fixtures
      (tournament_id, match_number, team1_id, team2_id,
       player1_id, player2_id, player3_id, player4_id)
    values
      (result_id, turn::smallint, null, null,
       player1, player2, player3, player4);
  end loop;

  return result_id;
end;
$$;

revoke all on function public.create_complete_individual_tournament(text,text,text,numeric,uuid[])
  from public, anon, authenticated;
grant execute on function public.create_complete_individual_tournament(text,text,text,numeric,uuid[])
  to authenticated;

notify pgrst, 'reload schema';

commit;
