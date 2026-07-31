-- Padel House · schema completo per Supabase
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
  rating_delta integer not null check (rating_delta > 0),
  notes text check (notes is null or char_length(notes) <= 240)
);

create table if not exists public.match_players (
  match_id uuid not null references public.matches(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  team smallint not null check (team in (1, 2)),
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

-- Crea il profilo al momento dell'iscrizione e impedisce l'undicesimo membro.
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
  perform pg_advisory_xact_lock(hashtext('padel_house_max_10_members'));
  select count(*) into member_count from public.profiles;

  if member_count >= 10 then
    raise exception 'Il gruppo ha raggiunto il limite di 10 giocatori';
  end if;

  requested_name := nullif(trim(new.raw_user_meta_data ->> 'display_name'), '');
  if requested_name is null then
    requested_name := split_part(coalesce(new.email, 'Giocatore'), '@', 1);
  end if;

  insert into public.profiles (id, display_name)
  values (new.id, left(requested_name, 40));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

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

alter table public.profiles enable row level security;
alter table public.matches enable row level security;
alter table public.match_players enable row level security;
alter table public.match_sets enable row level security;

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

-- I client possono leggere tutto il club, ma non alterare punti o risultati.
grant select on public.profiles, public.matches, public.match_players, public.match_sets to authenticated;
revoke insert, delete on public.profiles from anon, authenticated;
revoke update on public.profiles from anon, authenticated;
grant update (display_name, avatar_path) on public.profiles to authenticated;
revoke insert, update, delete on public.matches, public.match_players, public.match_sets from anon, authenticated;

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
