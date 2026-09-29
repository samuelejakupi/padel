-- Tornei individuali a coppie variabili. Eseguire dopo migration-tornei-premio-elo.sql.
-- Il calendario nasce una partita per volta; ogni ciclo finisce con lo stesso
-- numero di presenze per tutti. Il premio totale resta 90 Elo.

alter table public.padel_tournaments
  add column if not exists mode text not null default 'teams'
    check (mode in ('teams', 'individual'));
alter table public.padel_tournaments
  add column if not exists target_matches smallint;

create table if not exists public.tournament_participants (
  tournament_id uuid not null references public.padel_tournaments(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  sort_order smallint not null,
  primary key (tournament_id, profile_id),
  unique (tournament_id, sort_order)
);
alter table public.tournament_participants enable row level security;
create policy "Membri leggono partecipanti torneo" on public.tournament_participants
  for select to authenticated using (true);
grant select on public.tournament_participants to authenticated;

alter table public.tournament_fixtures alter column team1_id drop not null;
alter table public.tournament_fixtures alter column team2_id drop not null;
alter table public.tournament_fixtures
  add column if not exists player1_id uuid references public.profiles(id) on delete restrict;
alter table public.tournament_fixtures
  add column if not exists player2_id uuid references public.profiles(id) on delete restrict;
alter table public.tournament_fixtures
  add column if not exists player3_id uuid references public.profiles(id) on delete restrict;
alter table public.tournament_fixtures
  add column if not exists player4_id uuid references public.profiles(id) on delete restrict;
alter table public.tournament_fixtures
  drop constraint if exists tournament_fixtures_match_number_check;
alter table public.tournament_fixtures
  add constraint tournament_fixtures_match_number_check check (match_number between 1 and 42);
alter table public.tournament_fixtures
  add constraint tournament_fixture_pairing_check check (
    (team1_id is not null and team2_id is not null
      and player1_id is null and player2_id is null and player3_id is null and player4_id is null)
    or
    (team1_id is null and team2_id is null
      and player1_id is not null and player2_id is not null
      and player3_id is not null and player4_id is not null
      and player1_id<>player2_id and player1_id<>player3_id and player1_id<>player4_id
      and player2_id<>player3_id and player2_id<>player4_id and player3_id<>player4_id)
  );

create or replace function public.draw_individual_fixture(p_tournament_id uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  t record;
  ids uuid[];
  a uuid; b uuid; c uuid; d uuid;
  next_number integer;
  result_id uuid;
  best_pair integer;
begin
  if auth.uid() is null then raise exception 'Devi accedere'; end if;
  select * into t from public.padel_tournaments where id = p_tournament_id for update;
  if not found or t.mode <> 'individual' then raise exception 'Torneo individuale non trovato'; end if;
  if not exists (select 1 from public.tournament_participants
                 where tournament_id = t.id and profile_id = auth.uid())
    and t.created_by <> auth.uid() then
    raise exception 'Solo partecipanti e creatore possono sorteggiare';
  end if;
  select count(*) + 1 into next_number from public.tournament_fixtures where tournament_id = t.id;
  if next_number > t.target_matches then raise exception 'Torneo già concluso'; end if;
  if exists (select 1 from public.tournament_fixtures
             where tournament_id = t.id and match_id is null) then
    raise exception 'Inserisci prima il risultato della partita corrente';
  end if;

  -- I quattro con meno presenze: dopo qualunque partita lo scarto resta <= 1.
  -- A parità di presenze la casualità evita un ordine fisso.
  select array_agg(profile_id order by played, tie_break) into ids
  from (
    select p.profile_id, count(f.id) as played, random() as tie_break
    from public.tournament_participants p
    left join public.tournament_fixtures f on f.tournament_id = p.tournament_id
      and f.match_id is not null and p.profile_id in
        (f.player1_id, f.player2_id, f.player3_id, f.player4_id)
    where p.tournament_id = t.id
    group by p.profile_id
    order by played, tie_break
    limit 4
  ) chosen;
  if cardinality(ids) <> 4 then raise exception 'Servono almeno quattro partecipanti'; end if;
  a := ids[1]; b := ids[2]; c := ids[3]; d := ids[4];

  -- Fra le tre coppie possibili si preferisce quella già vista meno volte.
  -- A parità conta la vicinanza in classifica dei due lati.
  select option_no into best_pair
  from (
    select v.option_no,
      (select count(*) from public.tournament_fixtures f
       where f.tournament_id = t.id and f.match_id is not null
         and ((f.player1_id in (v.x, v.y) and f.player2_id in (v.x, v.y))
           or (f.player3_id in (v.x, v.y) and f.player4_id in (v.x, v.y))))
      + (select count(*) from public.tournament_fixtures f
         where f.tournament_id = t.id and f.match_id is not null
           and ((f.player1_id in (v.z, v.w) and f.player2_id in (v.z, v.w))
             or (f.player3_id in (v.z, v.w) and f.player4_id in (v.z, v.w)))) as repeated_pairs,
      random() as tie_break
    from (values (1,a,b,c,d), (2,a,c,b,d), (3,a,d,b,c)) v(option_no,x,y,z,w)
  ) options order by repeated_pairs, tie_break limit 1;
  if best_pair = 2 then b := ids[3]; c := ids[2]; end if;
  if best_pair = 3 then b := ids[4]; c := ids[2]; d := ids[3]; end if;
  insert into public.tournament_fixtures
    (tournament_id, match_number, team1_id, team2_id,
     player1_id, player2_id, player3_id, player4_id)
  values (t.id, next_number, null, null, a, b, c, d)
  returning id into result_id;
  return result_id;
end;
$$;
revoke all on function public.draw_individual_fixture(uuid) from public, anon;
grant execute on function public.draw_individual_fixture(uuid) to authenticated;

create or replace function public.create_individual_tournament(
  p_name text, p_trophy_name text, p_trophy_badge text,
  p_elo_multiplier numeric, p_players uuid[], p_cycles smallint
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  result_id uuid;
  n integer;
  i integer;
begin
  if auth.uid() is null or not exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'Devi accedere';
  end if;
  n := cardinality(p_players);
  if n not between 4 and 8 or p_cycles not between 1 and 3 then
    raise exception 'Seleziona 4–8 partecipanti e 1–3 cicli';
  end if;
  if (select count(distinct id) from unnest(p_players) id) <> n
     or exists (select 1 from unnest(p_players) id
                where not exists (select 1 from public.profiles p where p.id = id)) then
    raise exception 'I partecipanti devono essere distinti e registrati';
  end if;
  insert into public.padel_tournaments
    (name, trophy_name, trophy_badge, elo_multiplier, sets_format, legs,
     created_by, mode, target_matches)
  values (trim(p_name), trim(p_trophy_name), p_trophy_badge,
          p_elo_multiplier, 1, 1, auth.uid(), 'individual',
          (p_cycles * n / (case when n % 4 = 0 then 4 when n % 2 = 0 then 2 else 1 end))::smallint)
  returning id into result_id;
  for i in 1..n loop
    insert into public.tournament_participants(tournament_id, profile_id, sort_order)
    values (result_id, p_players[i], i);
  end loop;
  perform public.draw_individual_fixture(result_id);
  return result_id;
end;
$$;
revoke all on function public.create_individual_tournament(text,text,text,numeric,uuid[],smallint) from public, anon;
grant execute on function public.create_individual_tournament(text,text,text,numeric,uuid[],smallint) to authenticated;

-- La classifica individuale usa vittorie, differenza game e game fatti.
create or replace function public.individual_tournament_standings(p_tournament_id uuid)
returns table(profile_id uuid, rank_position integer, played bigint, wins bigint,
              games_won bigint, games_lost bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  with scores as (
    select f.*, m.winner_team, s.team1_games, s.team2_games
    from public.tournament_fixtures f
    join public.matches m on m.id = f.match_id
    join public.match_sets s on s.match_id = m.id and s.set_number = 1
    where f.tournament_id = p_tournament_id
  ), totals as (
    select p.profile_id, p.sort_order,
      count(s.id) as played,
      count(s.id) filter (where
        (p.profile_id in (s.player1_id,s.player2_id) and s.winner_team = 1)
        or (p.profile_id in (s.player3_id,s.player4_id) and s.winner_team = 2)) as wins,
      coalesce(sum(case when p.profile_id in (s.player1_id,s.player2_id) then s.team1_games
                        when p.profile_id in (s.player3_id,s.player4_id) then s.team2_games end),0)::bigint as games_won,
      coalesce(sum(case when p.profile_id in (s.player1_id,s.player2_id) then s.team2_games
                        when p.profile_id in (s.player3_id,s.player4_id) then s.team1_games end),0)::bigint as games_lost
    from public.tournament_participants p
    left join scores s on p.profile_id in (s.player1_id,s.player2_id,s.player3_id,s.player4_id)
    where p.tournament_id = p_tournament_id
    group by p.profile_id,p.sort_order
  )
  select profile_id,
    row_number() over (order by wins desc, games_won-games_lost desc,
                      games_won desc, sort_order)::integer,
    played,wins,games_won,games_lost from totals;
$$;
revoke all on function public.individual_tournament_standings(uuid) from public, anon;
grant execute on function public.individual_tournament_standings(uuid) to authenticated;

-- Il replay Elo esistente richiama questa funzione alla partita conclusiva:
-- basta aggiungere la diramazione individuale, senza bonus fuori cronologia.
create or replace function public.tournament_elo_awards(p_tournament_id uuid)
returns table(profile_id uuid, points integer)
language sql stable security definer set search_path = public, pg_temp as $$
  with t as (select mode,target_matches from public.padel_tournaments where id=p_tournament_id),
  finished as (
    select 1 from public.tournament_fixtures f, t
    where f.tournament_id=p_tournament_id
    having count(*)>0 and count(*) filter(where f.match_id is null)=0
      and count(*)=coalesce(max(t.target_matches),count(*))
  )
  select team_player.id, case standing.team_position when 1 then 30 else 15 end
  from public.tournament_standings(p_tournament_id) standing
  join public.tournament_teams team on team.id=standing.team_id
  cross join lateral (values(team.player_a),(team.player_b)) team_player(id)
  where standing.team_position in (1,2) and exists(select 1 from finished)
    and exists(select 1 from t where mode='teams')
  union all
  select standing.profile_id, case standing.rank_position when 1 then 45 when 2 then 30 else 15 end
  from public.individual_tournament_standings(p_tournament_id) standing
  where standing.rank_position in (1,2,3) and exists(select 1 from finished)
    and exists(select 1 from t where mode='individual');
$$;
revoke all on function public.tournament_elo_awards(uuid) from public, anon;
grant execute on function public.tournament_elo_awards(uuid) to authenticated;

create or replace function public.tournament_closing_match(p_tournament_id uuid)
returns uuid language sql stable security definer set search_path = public, pg_temp as $$
  select m.id from public.tournament_fixtures f
  join public.matches m on m.id=f.match_id
  join public.padel_tournaments t on t.id=f.tournament_id
  where f.tournament_id=p_tournament_id
    and (select count(*) from public.tournament_fixtures where tournament_id=t.id)
        = coalesce(t.target_matches,(select count(*) from public.tournament_fixtures where tournament_id=t.id))
    and not exists(select 1 from public.tournament_fixtures
                   where tournament_id=t.id and match_id is null)
  order by m.played_at desc,m.created_at desc,m.id desc limit 1;
$$;
revoke all on function public.tournament_closing_match(uuid) from public, anon;
grant execute on function public.tournament_closing_match(uuid) to authenticated;

create or replace function public.assign_tournament_match(p_fixture_id uuid,p_match_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  f record; actual1 uuid[]; actual2 uuid[]; expected1 uuid[]; expected2 uuid[];
  set_total integer; winner integer;
begin
  if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid()) then
    raise exception 'Devi accedere';
  end if;
  select fixture.*,t.mode,t.elo_multiplier,t.sets_format,t.created_by as tournament_owner into f
  from public.tournament_fixtures fixture
  join public.padel_tournaments t on t.id=fixture.tournament_id
  where fixture.id=p_fixture_id for update of fixture;
  if not found then raise exception 'Partita del torneo non trovata'; end if;
  if f.match_id is not null and f.match_id<>p_match_id then
    raise exception 'Questa partita ha già un risultato';
  end if;
  if exists(select 1 from public.tournament_fixtures
            where tournament_id=f.tournament_id and match_number<f.match_number and match_id is null) then
    raise exception 'Inserisci prima i risultati precedenti';
  end if;
  if f.mode='individual' then
    expected1:=array[f.player1_id,f.player2_id];
    expected2:=array[f.player3_id,f.player4_id];
  else
    select array[player_a,player_b] into expected1 from public.tournament_teams where id=f.team1_id;
    select array[player_a,player_b] into expected2 from public.tournament_teams where id=f.team2_id;
  end if;
  select array_agg(profile_id order by profile_id) filter(where team=1),
         array_agg(profile_id order by profile_id) filter(where team=2)
    into actual1,actual2 from public.match_players where match_id=p_match_id;
  if actual1 is null or actual2 is null or
     not(actual1 @> expected1 and expected1 @> actual1) or
     not(actual2 @> expected2 and expected2 @> actual2) then
    raise exception 'I giocatori non corrispondono all’abbinamento';
  end if;
  if auth.uid() <> f.tournament_owner
     and auth.uid() <> all(expected1 || expected2) then
    raise exception 'Solo chi partecipa alla partita o chi ha creato il torneo può registrarla';
  end if;
  if not exists(select 1 from public.matches
                where id=p_match_id and created_by=auth.uid()) then
    raise exception 'Puoi collegare solo una partita registrata da te';
  end if;
  select count(*) into set_total from public.match_sets where match_id=p_match_id;
  select winner_team into winner from public.matches where id=p_match_id;
  if (f.mode='individual' and (set_total<>1 or winner not in (1,2))) or
     (f.sets_format=1 and set_total<>1) or
     (f.sets_format=3 and set_total not between 2 and 3) then
    raise exception 'Formato risultato non valido: il torneo individuale richiede un set concluso';
  end if;
  update public.tournament_fixtures set match_id=p_match_id where id=p_fixture_id;
  update public.matches set elo_multiplier=f.elo_multiplier where id=p_match_id;
  perform public.recalculate_padel_ratings();
end;
$$;
revoke all on function public.assign_tournament_match(uuid,uuid) from public, anon;
grant execute on function public.assign_tournament_match(uuid,uuid) to authenticated;

create or replace function public.refresh_tournament_status()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.padel_tournaments t set status = case when
    (select count(*) from public.tournament_fixtures f where f.tournament_id=t.id)
      = coalesce(t.target_matches,
          (select count(*) from public.tournament_fixtures f where f.tournament_id=t.id))
    and not exists(select 1 from public.tournament_fixtures f
                   where f.tournament_id=t.id and f.match_id is null)
    then 'completed' else 'active' end
  where t.id=new.tournament_id;
  return new;
end;
$$;
drop trigger if exists tournament_fixture_refresh_status on public.tournament_fixtures;
create trigger tournament_fixture_refresh_status
after insert or update of match_id on public.tournament_fixtures
for each row execute function public.refresh_tournament_status();

notify pgrst, 'reload schema';
