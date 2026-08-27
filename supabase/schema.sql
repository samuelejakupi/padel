-- TheBoyz · schema Supabase della sezione Padel
-- Esegui questo file una sola volta nel SQL Editor del tuo progetto Supabase.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 40),
  avatar_path text,
  rating integer not null default 1000 check (rating >= 100),
  matches_played integer not null default 0 check (matches_played >= 0),
  wins integer not null default 0 check (wins >= 0),
  losses integer not null default 0 check (losses >= 0),
  current_streak integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  played_at timestamptz not null,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id),
  winner_team smallint not null check (winner_team in (1, 2)),
  rating_delta integer not null default 0 check (rating_delta >= 0),
  notes text check (notes is null or char_length(notes) <= 240)
);

create table if not exists public.match_players (
  match_id uuid not null references public.matches(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  team smallint not null check (team in (1, 2)),
  rating_delta integer not null default 0,
  primary key (match_id, profile_id)
);

create table if not exists public.match_sets (
  match_id uuid not null references public.matches(id) on delete cascade,
  set_number smallint not null check (set_number between 1 and 3),
  team1_games smallint not null check (team1_games between 0 and 20),
  team2_games smallint not null check (team2_games between 0 and 20),
  primary key (match_id, set_number),
  check (team1_games <> team2_games)
);

create index if not exists matches_played_at_idx on public.matches (played_at desc);
create index if not exists match_players_profile_idx on public.match_players (profile_id);
create index if not exists profiles_rating_idx on public.profiles (rating desc);

-- Ranking pizzerie interattivo: tre voti per ogni pizzeria, uno per Samu,
-- Fabio e Dani. Il bonus Fabio resta assegnabile solo da Fabio.
create table if not exists public.pizza_restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 80),
  place text check (place is null or char_length(trim(place)) <= 80),
  created_by uuid not null references public.profiles(id),
  is_personal boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.pizza_restaurants
  add column if not exists is_personal boolean not null default false;

create table if not exists public.pizza_votes (
  restaurant_id uuid not null references public.pizza_restaurants(id) on delete cascade,
  voter_id uuid not null references public.profiles(id) on delete restrict,
  location smallint not null check (location between 0 and 7),
  pizza smallint not null check (pizza between 0 and 10),
  dessert smallint not null check (dessert between 0 and 4),
  price smallint not null check (price between 0 and 10),
  bonus_fabio smallint not null default 0 check (bonus_fabio between 0 and 7),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (restaurant_id, voter_id)
);

create index if not exists pizza_restaurants_created_at_idx on public.pizza_restaurants (created_at desc);
create index if not exists pizza_votes_restaurant_idx on public.pizza_votes (restaurant_id);

alter table public.matches
  drop constraint if exists matches_rating_delta_check;
alter table public.matches
  add constraint matches_rating_delta_check check (rating_delta >= 0);
alter table public.match_players
  add column if not exists rating_delta integer not null default 0;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

-- Crea profili esclusivamente per gli account amministrati dai TheBoyz.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  member_count integer;
  requested_name text;
begin
  perform pg_advisory_xact_lock(hashtext('theboyz_members'));
  select count(*) into member_count from public.profiles;

  requested_name := case lower(coalesce(new.email, ''))
    when 'samu@theboyz.local' then 'Samu'
    when 'dani@theboyz.local' then 'Dani'
    when 'atti@theboyz.local' then 'Atti'
    when 'matte@theboyz.local' then 'Matte'
    when 'fabio@theboyz.local' then 'Fabio'
    when 'alban@theboyz.local' then 'Alban'
    when 'mattia@theboyz.local' then 'Mattia'
    when 'manu@theboyz.local' then 'Manu'
    when 'mene@theboyz.local' then 'Mene'
    else null
  end;

  if requested_name is null then
    raise exception 'Registrazione pubblica disabilitata';
  end if;

  if member_count >= 9 then
    raise exception 'Tutti i profili TheBoyz sono già stati creati';
  end if;

  insert into public.profiles (id, display_name)
  values (new.id, requested_name);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Recupera soltanto gli account TheBoyz creati prima dell'installazione.
with existing_users as (
  select
    user_account.id,
    case lower(user_account.email)
      when 'samu@theboyz.local' then 'Samu'
      when 'dani@theboyz.local' then 'Dani'
      when 'atti@theboyz.local' then 'Atti'
      when 'matte@theboyz.local' then 'Matte'
      when 'fabio@theboyz.local' then 'Fabio'
      when 'alban@theboyz.local' then 'Alban'
      when 'mattia@theboyz.local' then 'Mattia'
      when 'manu@theboyz.local' then 'Manu'
      when 'mene@theboyz.local' then 'Mene'
    end as requested_name
  from auth.users as user_account
  where not exists (
    select 1 from public.profiles as profile where profile.id = user_account.id
  )
    and lower(user_account.email) in (
      'samu@theboyz.local',
      'dani@theboyz.local',
      'atti@theboyz.local',
      'matte@theboyz.local',
      'fabio@theboyz.local',
      'alban@theboyz.local',
      'mattia@theboyz.local',
      'manu@theboyz.local',
      'mene@theboyz.local'
    )
  order by user_account.created_at
)
insert into public.profiles (id, display_name)
select id, requested_name
from existing_users
on conflict (id) do nothing;

-- Registra un risultato e aggiorna il ranking Elo in una sola transazione.
create or replace function public.record_match(
  p_played_at timestamptz,
  p_team1 uuid[],
  p_team2 uuid[],
  p_sets jsonb,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  all_players uuid[];
  team1_rating numeric;
  team2_rating numeric;
  expected_team1 numeric;
  team1_wins integer;
  team2_wins integer;
  winner smallint;
  delta integer;
  new_match_id uuid := gen_random_uuid();
begin
  if current_user_id is null then
    raise exception 'Devi accedere per registrare una partita';
  end if;

  if not exists (select 1 from public.profiles where id = current_user_id) then
    raise exception 'Profilo giocatore non trovato';
  end if;

  perform pg_advisory_xact_lock(hashtext('theboyz_padel_results'));

  if cardinality(p_team1) <> 2 or cardinality(p_team2) <> 2 then
    raise exception 'Ogni squadra deve avere esattamente due giocatori';
  end if;

  all_players := p_team1 || p_team2;
  if (select count(distinct player_id) from unnest(all_players) as player_id) <> 4 then
    raise exception 'I quattro giocatori devono essere diversi';
  end if;

  if (select count(*) from public.profiles where id = any(all_players)) <> 4 then
    raise exception 'Uno o più giocatori non appartengono al gruppo';
  end if;

  if jsonb_typeof(p_sets) <> 'array' or jsonb_array_length(p_sets) not between 2 and 3 then
    raise exception 'Inserisci due o tre set';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_sets) as item
    where (item ->> 'team1_games') is null
       or (item ->> 'team2_games') is null
       or (item ->> 'team1_games')::integer not between 0 and 20
       or (item ->> 'team2_games')::integer not between 0 and 20
       or (item ->> 'team1_games')::integer = (item ->> 'team2_games')::integer
  ) then
    raise exception 'Il punteggio dei set non è valido';
  end if;

  select
    count(*) filter (where (item ->> 'team1_games')::integer > (item ->> 'team2_games')::integer),
    count(*) filter (where (item ->> 'team2_games')::integer > (item ->> 'team1_games')::integer)
  into team1_wins, team2_wins
  from jsonb_array_elements(p_sets) as item;

  if greatest(team1_wins, team2_wins) <> 2 or team1_wins = team2_wins then
    raise exception 'La partita deve terminare con due set vinti';
  end if;

  winner := case when team1_wins > team2_wins then 1 else 2 end;

  -- Blocca i quattro profili così due risultati contemporanei non perdono punti.
  perform 1 from public.profiles where id = any(all_players) order by id for update;
  select avg(rating) into team1_rating from public.profiles where id = any(p_team1);
  select avg(rating) into team2_rating from public.profiles where id = any(p_team2);
  expected_team1 := 1.0 / (1.0 + power(10.0, (team2_rating - team1_rating) / 400.0));
  delta := greatest(6, round(32.0 * ((case when winner = 1 then 1.0 else 0.0 end) - expected_team1))::integer);
  if winner = 2 then
    delta := greatest(6, abs(round(32.0 * (0.0 - expected_team1))::integer));
  end if;

  insert into public.matches (id, played_at, created_by, winner_team, rating_delta, notes)
  values (new_match_id, p_played_at, current_user_id, winner, delta, nullif(trim(p_notes), ''));

  insert into public.match_players (match_id, profile_id, team)
  select new_match_id, player_id, 1 from unnest(p_team1) as player_id
  union all
  select new_match_id, player_id, 2 from unnest(p_team2) as player_id;

  insert into public.match_sets (match_id, set_number, team1_games, team2_games)
  select
    new_match_id,
    ordinality::smallint,
    (item ->> 'team1_games')::smallint,
    (item ->> 'team2_games')::smallint
  from jsonb_array_elements(p_sets) with ordinality as parsed(item, ordinality);

  update public.profiles
  set
    rating = greatest(100, rating + case
      when (winner = 1 and id = any(p_team1)) or (winner = 2 and id = any(p_team2)) then delta
      else -delta
    end),
    matches_played = matches_played + 1,
    wins = wins + case
      when (winner = 1 and id = any(p_team1)) or (winner = 2 and id = any(p_team2)) then 1 else 0
    end,
    losses = losses + case
      when (winner = 1 and id = any(p_team2)) or (winner = 2 and id = any(p_team1)) then 1 else 0
    end,
    current_streak = case
      when (winner = 1 and id = any(p_team1)) or (winner = 2 and id = any(p_team2))
        then case when current_streak >= 0 then current_streak + 1 else 1 end
      else case when current_streak <= 0 then current_streak - 1 else -1 end
    end
  where id = any(all_players);

  return new_match_id;
end;
$$;

revoke all on function public.record_match(timestamptz, uuid[], uuid[], jsonb, text) from public;
grant execute on function public.record_match(timestamptz, uuid[], uuid[], jsonb, text) to authenticated;

-- Elimina una partita e ricalcola da zero ranking e statistiche in ordine cronologico.
create or replace function public.delete_match(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  replay_match record;
  match_creator_id uuid;
  match_created_at timestamptz;
  replay_team1 uuid[];
  replay_team2 uuid[];
  all_players uuid[];
  team1_rating numeric;
  team2_rating numeric;
  expected_team1 numeric;
  delta integer;
begin
  if current_user_id is null then
    raise exception 'Devi accedere per eliminare una partita';
  end if;

  if not exists (select 1 from public.profiles where id = current_user_id) then
    raise exception 'Profilo giocatore non trovato';
  end if;

  perform pg_advisory_xact_lock(hashtext('theboyz_padel_results'));
  perform 1 from public.profiles order by id for update;

  select created_by, created_at
  into match_creator_id, match_created_at
  from public.matches
  where id = p_match_id;

  if not found then
    raise exception 'Partita non trovata';
  end if;

  if match_creator_id is distinct from current_user_id then
    raise exception 'Solo chi ha creato la partita può modificarla o eliminarla';
  end if;

  if match_created_at + interval '24 hours' <= now() then
    raise exception 'La partita è bloccata: sono trascorse più di 24 ore dalla creazione';
  end if;

  delete from public.matches where id = p_match_id;

  update public.profiles
  set
    rating = 1000,
    matches_played = 0,
    wins = 0,
    losses = 0,
    current_streak = 0
  where true;

  for replay_match in
    select id, winner_team
    from public.matches
    order by played_at, created_at, id
  loop
    select
      array_agg(profile_id order by profile_id) filter (where team = 1),
      array_agg(profile_id order by profile_id) filter (where team = 2)
    into replay_team1, replay_team2
    from public.match_players
    where match_id = replay_match.id;

    if cardinality(replay_team1) <> 2 or cardinality(replay_team2) <> 2 then
      raise exception 'La partita % non contiene quattro giocatori validi', replay_match.id;
    end if;

    all_players := replay_team1 || replay_team2;
    select avg(rating) into team1_rating from public.profiles where id = any(replay_team1);
    select avg(rating) into team2_rating from public.profiles where id = any(replay_team2);
    expected_team1 := 1.0 / (1.0 + power(10.0, (team2_rating - team1_rating) / 400.0));

    if replay_match.winner_team = 1 then
      delta := greatest(6, round(32.0 * (1.0 - expected_team1))::integer);
    else
      delta := greatest(6, abs(round(32.0 * (0.0 - expected_team1))::integer));
    end if;

    update public.matches
    set rating_delta = delta
    where id = replay_match.id;

    update public.profiles
    set
      rating = greatest(100, rating + case
        when (replay_match.winner_team = 1 and id = any(replay_team1))
          or (replay_match.winner_team = 2 and id = any(replay_team2))
          then delta
        else -delta
      end),
      matches_played = matches_played + 1,
      wins = wins + case
        when (replay_match.winner_team = 1 and id = any(replay_team1))
          or (replay_match.winner_team = 2 and id = any(replay_team2))
          then 1
        else 0
      end,
      losses = losses + case
        when (replay_match.winner_team = 1 and id = any(replay_team2))
          or (replay_match.winner_team = 2 and id = any(replay_team1))
          then 1
        else 0
      end,
      current_streak = case
        when (replay_match.winner_team = 1 and id = any(replay_team1))
          or (replay_match.winner_team = 2 and id = any(replay_team2))
          then case when current_streak >= 0 then current_streak + 1 else 1 end
        else case when current_streak <= 0 then current_streak - 1 else -1 end
      end
    where id = any(all_players);
  end loop;
end;
$$;

revoke all on function public.delete_match(uuid) from public;
revoke all on function public.delete_match(uuid) from anon;
grant execute on function public.delete_match(uuid) to authenticated;

-- ELO V2: vale soltanto per le nuove partite registrate nel sito.
-- Nessun risultato esterno o storico viene importato o ricalcolato.
create or replace function public.padel_margin_factor(p_sets jsonb, p_winner smallint)
returns numeric
language sql
immutable
security invoker
set search_path = public, pg_temp
as $$
  with parsed as (
    select
      (item ->> 'team1_games')::numeric as team1_games,
      (item ->> 'team2_games')::numeric as team2_games
    from jsonb_array_elements(p_sets) as item
  ),
  summary as (
    select
      count(*) filter (where team1_games > team2_games) as team1_sets,
      count(*) filter (where team2_games > team1_games) as team2_sets,
      avg(
        case
          when p_winner = 1
            then (team1_games - team2_games) / greatest(team1_games + team2_games, 1.0)
          else (team2_games - team1_games) / greatest(team1_games + team2_games, 1.0)
        end
      ) as game_dominance
    from parsed
  )
  select least(
    1.25::numeric,
    greatest(
      0.85::numeric,
      1.0
        + 0.08 * greatest(0, abs(team1_sets - team2_sets) - 1)
        + 0.12 * coalesce(game_dominance, 0)
    )
  )
  from summary;
$$;

revoke all on function public.padel_margin_factor(jsonb, smallint) from public;

-- Le partite gia presenti conservano esattamente il vecchio punteggio comune.
update public.match_players as match_player
set rating_delta = case
  when match_player.team = match_record.winner_team then match_record.rating_delta
  else -match_record.rating_delta
end
from public.matches as match_record
where match_player.match_id = match_record.id
  and match_player.rating_delta = 0;

create or replace function public.record_match(
  p_played_at timestamptz,
  p_team1 uuid[],
  p_team2 uuid[],
  p_sets jsonb,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  all_players uuid[];
  team1_rating numeric;
  team2_rating numeric;
  expected_team1 numeric;
  team1_wins integer;
  team2_wins integer;
  winner smallint;
  margin_factor numeric;
  current_player record;
  expected_score numeric;
  player_won boolean;
  raw_delta integer;
  applied_delta integer;
  absolute_delta_total integer := 0;
  new_match_id uuid := gen_random_uuid();
begin
  if current_user_id is null then
    raise exception 'Devi accedere per registrare una partita';
  end if;

  if not exists (select 1 from public.profiles where id = current_user_id) then
    raise exception 'Profilo giocatore non trovato';
  end if;

  perform pg_advisory_xact_lock(hashtext('theboyz_padel_results'));

  if cardinality(p_team1) <> 2 or cardinality(p_team2) <> 2 then
    raise exception 'Ogni squadra deve avere esattamente due giocatori';
  end if;

  all_players := p_team1 || p_team2;
  if (select count(distinct player_id) from unnest(all_players) as player_id) <> 4 then
    raise exception 'I quattro giocatori devono essere diversi';
  end if;

  if (select count(*) from public.profiles where id = any(all_players)) <> 4 then
    raise exception 'Uno o piu giocatori non appartengono al gruppo';
  end if;

  if jsonb_typeof(p_sets) <> 'array' or jsonb_array_length(p_sets) not between 2 and 3 then
    raise exception 'Inserisci due o tre set';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_sets) as item
    where (item ->> 'team1_games') is null
       or (item ->> 'team2_games') is null
       or (item ->> 'team1_games')::integer not between 0 and 20
       or (item ->> 'team2_games')::integer not between 0 and 20
       or (item ->> 'team1_games')::integer = (item ->> 'team2_games')::integer
  ) then
    raise exception 'Il punteggio dei set non e valido';
  end if;

  select
    count(*) filter (where (item ->> 'team1_games')::integer > (item ->> 'team2_games')::integer),
    count(*) filter (where (item ->> 'team2_games')::integer > (item ->> 'team1_games')::integer)
  into team1_wins, team2_wins
  from jsonb_array_elements(p_sets) as item;

  if greatest(team1_wins, team2_wins) <> 2 or team1_wins = team2_wins then
    raise exception 'La partita deve terminare con due set vinti';
  end if;

  winner := case when team1_wins > team2_wins then 1 else 2 end;

  perform 1 from public.profiles where id = any(all_players) order by id for update;
  select avg(rating) into team1_rating from public.profiles where id = any(p_team1);
  select avg(rating) into team2_rating from public.profiles where id = any(p_team2);
  -- ELO V3: la probabilita attesa appartiene alla coppia. In questo modo
  -- l'Elo del compagno pesa quanto quello del singolo giocatore.
  expected_team1 := 1.0 / (
    1.0 + power(10.0, (team2_rating - team1_rating) / 400.0)
  );
  margin_factor := public.padel_margin_factor(p_sets, winner);

  insert into public.matches (id, played_at, created_by, winner_team, rating_delta, notes)
  values (new_match_id, p_played_at, current_user_id, winner, 0, nullif(trim(p_notes), ''));

  insert into public.match_sets (match_id, set_number, team1_games, team2_games)
  select
    new_match_id,
    ordinality::smallint,
    (item ->> 'team1_games')::smallint,
    (item ->> 'team2_games')::smallint
  from jsonb_array_elements(p_sets) with ordinality as parsed(item, ordinality);

  for current_player in
    select id, rating
    from public.profiles
    where id = any(all_players)
    order by id
  loop
    if current_player.id = any(p_team1) then
      expected_score := expected_team1;
      player_won := winner = 1;
    else
      expected_score := 1.0 - expected_team1;
      player_won := winner = 2;
    end if;

    raw_delta := round(
      32.0
        * margin_factor
        * ((case when player_won then 1.0 else 0.0 end) - expected_score)
    )::integer;
    applied_delta := greatest(100, current_player.rating + raw_delta) - current_player.rating;

    insert into public.match_players (match_id, profile_id, team, rating_delta)
    values (
      new_match_id,
      current_player.id,
      case when current_player.id = any(p_team1) then 1 else 2 end,
      applied_delta
    );

    update public.profiles
    set
      rating = rating + applied_delta,
      matches_played = matches_played + 1,
      wins = wins + case when player_won then 1 else 0 end,
      losses = losses + case when player_won then 0 else 1 end,
      current_streak = case
        when player_won
          then case when current_streak >= 0 then current_streak + 1 else 1 end
        else case when current_streak <= 0 then current_streak - 1 else -1 end
      end
    where id = current_player.id;

    absolute_delta_total := absolute_delta_total + abs(applied_delta);
  end loop;

  update public.matches
  set rating_delta = round(absolute_delta_total / 4.0)::integer
  where id = new_match_id;

  return new_match_id;
end;
$$;

revoke all on function public.record_match(timestamptz, uuid[], uuid[], jsonb, text) from public;
grant execute on function public.record_match(timestamptz, uuid[], uuid[], jsonb, text) to authenticated;

create or replace function public.delete_match(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  replay_match record;
  match_creator_id uuid;
  match_created_at timestamptz;
begin
  if current_user_id is null then
    raise exception 'Devi accedere per eliminare una partita';
  end if;

  if not exists (select 1 from public.profiles where id = current_user_id) then
    raise exception 'Profilo giocatore non trovato';
  end if;

  perform pg_advisory_xact_lock(hashtext('theboyz_padel_results'));
  perform 1 from public.profiles order by id for update;

  select created_by, created_at
  into match_creator_id, match_created_at
  from public.matches
  where id = p_match_id;

  if not found then
    raise exception 'Partita non trovata';
  end if;

  if match_creator_id is distinct from current_user_id then
    raise exception 'Solo chi ha creato la partita può modificarla o eliminarla';
  end if;

  if match_created_at + interval '24 hours' <= now() then
    raise exception 'La partita è bloccata: sono trascorse più di 24 ore dalla creazione';
  end if;

  update public.profiles as profile
  set rating = greatest(100, profile.rating - match_player.rating_delta)
  from public.match_players as match_player
  where match_player.match_id = p_match_id
    and profile.id = match_player.profile_id;

  delete from public.matches where id = p_match_id;

  update public.profiles
  set
    matches_played = 0,
    wins = 0,
    losses = 0,
    current_streak = 0
  where true;

  for replay_match in
    select id, winner_team
    from public.matches
    order by played_at, created_at, id
  loop
    update public.profiles as profile
    set
      matches_played = matches_played + 1,
      wins = wins + case when match_player.team = replay_match.winner_team then 1 else 0 end,
      losses = losses + case when match_player.team = replay_match.winner_team then 0 else 1 end,
      current_streak = case
        when match_player.team = replay_match.winner_team
          then case when current_streak >= 0 then current_streak + 1 else 1 end
        else case when current_streak <= 0 then current_streak - 1 else -1 end
      end
    from public.match_players as match_player
    where match_player.match_id = replay_match.id
      and profile.id = match_player.profile_id;
  end loop;
end;
$$;

revoke all on function public.delete_match(uuid) from public;
revoke all on function public.delete_match(uuid) from anon;
grant execute on function public.delete_match(uuid) to authenticated;

create or replace function public.is_pizza_editor()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) in (
    'samu@theboyz.local',
    'fabio@theboyz.local',
    'dani@theboyz.local'
  );
$$;

create or replace function public.create_pizza_restaurant(p_name text, p_place text default null)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_id uuid;
begin
  if auth.uid() is null or not public.is_pizza_editor() then
    raise exception 'Solo Samu, Fabio e Dani possono aggiungere pizzerie';
  end if;

  insert into public.pizza_restaurants (name, place, created_by)
  values (trim(p_name), nullif(trim(p_place), ''), auth.uid())
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.save_pizza_vote(
  p_restaurant_id uuid,
  p_location smallint,
  p_pizza smallint,
  p_dessert smallint,
  p_price smallint,
  p_bonus_fabio smallint default 0
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_pizza_editor() then
    raise exception 'Solo Samu, Fabio e Dani possono votare';
  end if;

  if not exists (select 1 from public.pizza_restaurants where id = p_restaurant_id) then
    raise exception 'Pizzeria non trovata';
  end if;

  if lower(coalesce(auth.jwt() ->> 'email', '')) <> 'fabio@theboyz.local' and p_bonus_fabio <> 0 then
    raise exception 'Il bonus Fabio può essere assegnato solo da Fabio';
  end if;

  insert into public.pizza_votes (restaurant_id, voter_id, location, pizza, dessert, price, bonus_fabio)
  values (p_restaurant_id, auth.uid(), p_location, p_pizza, p_dessert, p_price, p_bonus_fabio)
  on conflict (restaurant_id, voter_id) do update set
    location = excluded.location,
    pizza = excluded.pizza,
    dessert = excluded.dessert,
    price = excluded.price,
    bonus_fabio = excluded.bonus_fabio,
    updated_at = now();
end;
$$;

revoke all on function public.is_pizza_editor() from public;
revoke all on function public.create_pizza_restaurant(text, text) from public;
revoke all on function public.save_pizza_vote(uuid, smallint, smallint, smallint, smallint, smallint) from public;
grant execute on function public.is_pizza_editor() to authenticated;
grant execute on function public.create_pizza_restaurant(text, text) to authenticated;
grant execute on function public.save_pizza_vote(uuid, smallint, smallint, smallint, smallint, smallint) to authenticated;

alter table public.profiles enable row level security;
alter table public.matches enable row level security;
alter table public.match_players enable row level security;
alter table public.match_sets enable row level security;
alter table public.pizza_restaurants enable row level security;
alter table public.pizza_votes enable row level security;

drop policy if exists "Membri leggono i profili" on public.profiles;
create policy "Membri leggono i profili"
on public.profiles for select
to authenticated
using (true);

drop policy if exists "Ognuno aggiorna il proprio profilo" on public.profiles;
create policy "Ognuno aggiorna il proprio profilo"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "Membri leggono le partite" on public.matches;
create policy "Membri leggono le partite"
on public.matches for select
to authenticated
using (true);

drop policy if exists "Membri leggono i giocatori delle partite" on public.match_players;
create policy "Membri leggono i giocatori delle partite"
on public.match_players for select
to authenticated
using (true);

drop policy if exists "Membri leggono i set" on public.match_sets;
create policy "Membri leggono i set"
on public.match_sets for select
to authenticated
using (true);

drop policy if exists "Membri leggono le pizzerie" on public.pizza_restaurants;
create policy "Membri leggono le pizzerie"
on public.pizza_restaurants for select
to authenticated
using (
  not is_personal
  or created_by = (select auth.uid())
);

drop policy if exists "Membri leggono i voti pizzeria" on public.pizza_votes;
create policy "Membri leggono i voti pizzeria"
on public.pizza_votes for select
to authenticated
using (true);

-- I client possono leggere tutto il club, ma non alterare punti o risultati.
grant select on public.profiles, public.matches, public.match_players, public.match_sets to authenticated;
grant select on public.pizza_restaurants, public.pizza_votes to authenticated;
revoke insert, delete on public.profiles from anon, authenticated;
revoke update on public.profiles from anon, authenticated;
grant update (display_name, avatar_path) on public.profiles to authenticated;
revoke insert, update, delete on public.matches, public.match_players, public.match_sets from anon, authenticated;
revoke insert, update, delete on public.pizza_restaurants, public.pizza_votes from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Foto profilo pubbliche" on storage.objects;
create policy "Foto profilo pubbliche"
on storage.objects for select
to public
using (bucket_id = 'avatars');

drop policy if exists "Carica la propria foto" on storage.objects;
create policy "Carica la propria foto"
on storage.objects for insert
to authenticated
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Aggiorna la propria foto" on storage.objects;
create policy "Aggiorna la propria foto"
on storage.objects for update
to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Elimina la propria foto" on storage.objects;
create policy "Elimina la propria foto"
on storage.objects for delete
to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Aggiorna immediatamente la cache delle API Supabase.
notify pgrst, 'reload schema';
