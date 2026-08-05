-- TheBoyz · tornei a girone all'italiana
-- Esegui questo file nel SQL Editor di Supabase.
-- È idempotente: può essere rilanciato senza duplicare tornei o partite.

alter table public.matches
  add column if not exists elo_multiplier numeric not null default 1;

alter table public.match_players
  add column if not exists rating_before integer;

alter table public.match_players
  add column if not exists rating_after integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'matches_elo_multiplier_check'
  ) then
    alter table public.matches
      add constraint matches_elo_multiplier_check check (elo_multiplier in (1, 2));
  end if;
end;
$$;

create table if not exists public.padel_tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 70),
  status text not null default 'active' check (status in ('active', 'completed')),
  trophy_name text not null check (char_length(trim(trophy_name)) between 2 and 60),
  trophy_badge text not null default 'cup' check (trophy_badge in ('cup', 'crown', 'shield', 'star')),
  elo_multiplier numeric not null default 2 check (elo_multiplier in (1, 2)),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.tournament_teams (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.padel_tournaments(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 50),
  player_a uuid not null references public.profiles(id) on delete restrict,
  player_b uuid not null references public.profiles(id) on delete restrict,
  sort_order smallint not null check (sort_order between 1 and 4),
  check (player_a <> player_b),
  unique (tournament_id, sort_order)
);

create table if not exists public.tournament_fixtures (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.padel_tournaments(id) on delete cascade,
  match_number smallint not null check (match_number between 1 and 6),
  team1_id uuid not null references public.tournament_teams(id) on delete cascade,
  team2_id uuid not null references public.tournament_teams(id) on delete cascade,
  match_id uuid references public.matches(id) on delete set null,
  check (team1_id <> team2_id),
  unique (tournament_id, match_number),
  unique (match_id)
);

create index if not exists tournament_teams_tournament_idx
  on public.tournament_teams (tournament_id, sort_order);
create index if not exists tournament_fixtures_tournament_idx
  on public.tournament_fixtures (tournament_id, match_number);

alter table public.padel_tournaments enable row level security;
alter table public.tournament_teams enable row level security;
alter table public.tournament_fixtures enable row level security;

drop policy if exists "Membri leggono i tornei" on public.padel_tournaments;
create policy "Membri leggono i tornei"
on public.padel_tournaments for select to authenticated using (true);

drop policy if exists "Membri leggono le squadre torneo" on public.tournament_teams;
create policy "Membri leggono le squadre torneo"
on public.tournament_teams for select to authenticated using (true);

drop policy if exists "Membri leggono il calendario torneo" on public.tournament_fixtures;
create policy "Membri leggono il calendario torneo"
on public.tournament_fixtures for select to authenticated using (true);

grant select on public.padel_tournaments, public.tournament_teams, public.tournament_fixtures to authenticated;

create or replace function public.create_round_robin_tournament(
  p_name text,
  p_trophy_name text,
  p_trophy_badge text,
  p_elo_multiplier numeric,
  p_teams jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  new_tournament_id uuid;
  new_team_id uuid;
  team_ids uuid[] := array[]::uuid[];
  team_item record;
  participant_count integer;
  distinct_participant_count integer;
  team_total integer;
  match_counter integer := 0;
  first_index integer;
  second_index integer;
begin
  if current_user_id is null or not exists (select 1 from public.profiles where id = current_user_id) then
    raise exception 'Devi accedere per creare un torneo';
  end if;

  if jsonb_typeof(p_teams) <> 'array' then
    raise exception 'Le squadre del torneo non sono valide';
  end if;
  team_total := jsonb_array_length(p_teams);
  if team_total not between 3 and 4 then
    raise exception 'Il torneo richiede da tre a quattro squadre';
  end if;
  if p_trophy_badge not in ('cup', 'crown', 'shield', 'star') then
    raise exception 'Il simbolo del trofeo non è valido';
  end if;
  if p_elo_multiplier not in (1, 2) then
    raise exception 'Il moltiplicatore Elo deve essere 1 oppure 2';
  end if;

  select count(*), count(distinct participant_id)
  into participant_count, distinct_participant_count
  from (
    select (item ->> 'player_a')::uuid as participant_id from jsonb_array_elements(p_teams) as item
    union all
    select (item ->> 'player_b')::uuid as participant_id from jsonb_array_elements(p_teams) as item
  ) as participants;

  if participant_count <> team_total * 2 or distinct_participant_count <> participant_count then
    raise exception 'Ogni partecipante deve comparire in una sola squadra';
  end if;
  if (
    select count(*)
    from public.profiles
    where id in (
      select (item ->> 'player_a')::uuid from jsonb_array_elements(p_teams) as item
      union
      select (item ->> 'player_b')::uuid from jsonb_array_elements(p_teams) as item
    )
  ) <> participant_count then
    raise exception 'Uno o più partecipanti non appartengono al gruppo';
  end if;

  insert into public.padel_tournaments (
    name, trophy_name, trophy_badge, elo_multiplier, created_by
  ) values (
    trim(p_name), trim(p_trophy_name), p_trophy_badge, p_elo_multiplier, current_user_id
  ) returning id into new_tournament_id;

  for team_item in
    select item, ordinality
    from jsonb_array_elements(p_teams) with ordinality as team_data(item, ordinality)
    order by ordinality
  loop
    insert into public.tournament_teams (
      tournament_id, name, player_a, player_b, sort_order
    ) values (
      new_tournament_id,
      trim(team_item.item ->> 'name'),
      (team_item.item ->> 'player_a')::uuid,
      (team_item.item ->> 'player_b')::uuid,
      team_item.ordinality::smallint
    ) returning id into new_team_id;
    team_ids := array_append(team_ids, new_team_id);
  end loop;

  for first_index in 1..team_total - 1 loop
    for second_index in first_index + 1..team_total loop
      match_counter := match_counter + 1;
      insert into public.tournament_fixtures (
        tournament_id, match_number, team1_id, team2_id
      ) values (
        new_tournament_id,
        match_counter,
        team_ids[first_index],
        team_ids[second_index]
      );
    end loop;
  end loop;

  return new_tournament_id;
end;
$$;

revoke all on function public.create_round_robin_tournament(text, text, text, numeric, jsonb) from public;
grant execute on function public.create_round_robin_tournament(text, text, text, numeric, jsonb) to authenticated;

-- Il ricalcolo storico legge il moltiplicatore salvato sul match. Una
-- partita normale resta a ×1; una partita di torneo può valere ×2.
create or replace function public.recalculate_padel_ratings()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  replay_match record;
  replay_team1 uuid[];
  replay_team2 uuid[];
  match_sets_json jsonb;
  team1_rating numeric;
  team2_rating numeric;
  expected_team1 numeric;
  margin_factor numeric;
  current_player record;
  expected_score numeric;
  player_won boolean;
  raw_delta integer;
  applied_delta integer;
  absolute_delta_total integer;
begin
  perform pg_advisory_xact_lock(hashtext('theboyz_padel_results'));
  perform 1 from public.profiles order by id for update;

  update public.profiles
  set rating = 1000, matches_played = 0, wins = 0, losses = 0, current_streak = 0
  where true;

  for replay_match in
    select id, winner_team, coalesce(elo_multiplier, 1) as elo_multiplier
    from public.matches
    order by played_at, created_at, id
  loop
    select
      array_agg(profile_id order by profile_id) filter (where team = 1),
      array_agg(profile_id order by profile_id) filter (where team = 2)
    into replay_team1, replay_team2
    from public.match_players
    where match_id = replay_match.id;

    continue when replay_team1 is null or replay_team2 is null
      or cardinality(replay_team1) <> 2 or cardinality(replay_team2) <> 2;

    select jsonb_agg(
      jsonb_build_object('team1_games', team1_games, 'team2_games', team2_games)
      order by set_number
    ) into match_sets_json
    from public.match_sets
    where match_id = replay_match.id;

    margin_factor := case
      when match_sets_json is null then 1.0
      else public.padel_margin_factor(match_sets_json, replay_match.winner_team)
    end;

    select avg(rating) into team1_rating from public.profiles where id = any(replay_team1);
    select avg(rating) into team2_rating from public.profiles where id = any(replay_team2);
    expected_team1 := 1.0 / (1.0 + power(10.0, (team2_rating - team1_rating) / 400.0));
    absolute_delta_total := 0;

    for current_player in
      select id, rating from public.profiles
      where id = any(replay_team1 || replay_team2)
      order by id
    loop
      if current_player.id = any(replay_team1) then
        expected_score := expected_team1;
        player_won := replay_match.winner_team = 1;
      else
        expected_score := 1.0 - expected_team1;
        player_won := replay_match.winner_team = 2;
      end if;

      raw_delta := round(
        32.0 * replay_match.elo_multiplier * margin_factor
          * ((case when player_won then 1.0 else 0.0 end) - expected_score)
      )::integer;
      applied_delta := greatest(100, current_player.rating + raw_delta) - current_player.rating;

      update public.match_players
      set
        rating_delta = applied_delta,
        rating_before = current_player.rating,
        rating_after = current_player.rating + applied_delta
      where match_id = replay_match.id and profile_id = current_player.id;

      update public.profiles
      set
        rating = rating + applied_delta,
        matches_played = matches_played + 1,
        wins = wins + case when player_won then 1 else 0 end,
        losses = losses + case when player_won then 0 else 1 end,
        current_streak = case
          when player_won then case when current_streak >= 0 then current_streak + 1 else 1 end
          else case when current_streak <= 0 then current_streak - 1 else -1 end
        end
      where id = current_player.id;

      absolute_delta_total := absolute_delta_total + abs(applied_delta);
    end loop;

    update public.matches
    set rating_delta = round(absolute_delta_total / 4.0)::integer
    where id = replay_match.id;
  end loop;
end;
$$;

revoke all on function public.recalculate_padel_ratings() from public;
grant execute on function public.recalculate_padel_ratings() to authenticated;

create or replace function public.assign_tournament_match(p_fixture_id uuid, p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  fixture_record record;
  expected_team1 uuid[];
  expected_team2 uuid[];
  actual_team1 uuid[];
  actual_team2 uuid[];
begin
  if auth.uid() is null or not exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'Devi accedere per registrare il risultato del torneo';
  end if;

  select fixture.*, tournament.elo_multiplier
  into fixture_record
  from public.tournament_fixtures as fixture
  join public.padel_tournaments as tournament on tournament.id = fixture.tournament_id
  where fixture.id = p_fixture_id;

  if not found then raise exception 'Partita del torneo non trovata'; end if;
  if fixture_record.match_id is not null and fixture_record.match_id <> p_match_id then
    raise exception 'Questa partita del torneo ha già un risultato';
  end if;

  select array[player_a, player_b] into expected_team1
  from public.tournament_teams where id = fixture_record.team1_id;
  select array[player_a, player_b] into expected_team2
  from public.tournament_teams where id = fixture_record.team2_id;
  select
    array_agg(profile_id order by profile_id) filter (where team = 1),
    array_agg(profile_id order by profile_id) filter (where team = 2)
  into actual_team1, actual_team2
  from public.match_players where match_id = p_match_id;

  if actual_team1 is null or actual_team2 is null
    or not (actual_team1 @> expected_team1 and expected_team1 @> actual_team1)
    or not (actual_team2 @> expected_team2 and expected_team2 @> actual_team2)
  then
    raise exception 'I giocatori del risultato non corrispondono alle squadre del torneo';
  end if;

  update public.tournament_fixtures set match_id = p_match_id where id = p_fixture_id;
  update public.matches set elo_multiplier = fixture_record.elo_multiplier where id = p_match_id;
  perform public.recalculate_padel_ratings();
end;
$$;

revoke all on function public.assign_tournament_match(uuid, uuid) from public;
grant execute on function public.assign_tournament_match(uuid, uuid) to authenticated;

create or replace function public.refresh_tournament_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.padel_tournaments
  set status = case
    when exists (
      select 1 from public.tournament_fixtures
      where tournament_id = new.tournament_id and match_id is null
    ) then 'active'
    else 'completed'
  end
  where id = new.tournament_id;
  return new;
end;
$$;

drop trigger if exists tournament_fixture_refresh_status on public.tournament_fixtures;
create trigger tournament_fixture_refresh_status
after update of match_id on public.tournament_fixtures
for each row execute function public.refresh_tournament_status();

notify pgrst, 'reload schema';
