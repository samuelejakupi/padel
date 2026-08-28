-- TheBoyz · votazioni pizza basate sui partecipanti
-- Esegui questo file nel SQL Editor di Supabase anche se avevi già applicato
-- la precedente versione con timer. Lo script aggiorna i dati esistenti ed è
-- idempotente.

-- Ogni categoria si vota da 0 a 10 e Postgres applica i pesi storici:
--   location 7/31 · pizza 10/31 · dolce 4/31 · prezzo 10/31.
-- Se Fabio è tra i votanti la parte ordinaria vale 93 punti e si aggiunge il
-- suo bonus da 0 a 7; altrimenti viene ribasata direttamente a 100. Il
-- risultato finale è arrotondato all'intero più vicino, con 0,5 per eccesso.

create table if not exists public.pizza_sessions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.pizza_restaurants(id) on delete cascade,
  opened_by uuid not null references public.profiles(id) on delete cascade,
  opened_at timestamptz not null default now(),
  completed_at timestamptz,
  is_solo boolean not null default false,
  average_location numeric(4, 2),
  average_pizza numeric(4, 2),
  average_dessert numeric(4, 2),
  average_price numeric(4, 2),
  final_score smallint,
  -- Colonna temporanea per aggiornare le installazioni con il vecchio timer.
  closes_at timestamptz
);

alter table public.pizza_sessions
  add column if not exists completed_at timestamptz;

alter table public.pizza_sessions
  add column if not exists is_solo boolean not null default false;

alter table public.pizza_sessions
  add column if not exists average_location numeric(4, 2),
  add column if not exists average_pizza numeric(4, 2),
  add column if not exists average_dessert numeric(4, 2),
  add column if not exists average_price numeric(4, 2),
  add column if not exists final_score smallint;

alter table public.pizza_restaurants
  add column if not exists is_personal boolean not null default false;

alter table public.pizza_sessions
  add column if not exists closes_at timestamptz;

alter table public.pizza_sessions
  alter column closes_at drop not null,
  alter column closes_at drop default;

create index if not exists pizza_sessions_restaurant_idx
  on public.pizza_sessions (restaurant_id, opened_at desc);

create index if not exists pizza_sessions_owner_kind_idx
  on public.pizza_sessions (opened_by, is_solo, opened_at desc);

create index if not exists pizza_restaurants_personal_owner_idx
  on public.pizza_restaurants (is_personal, created_by);

create table if not exists public.pizza_session_participants (
  session_id uuid not null references public.pizza_sessions(id) on delete cascade,
  voter_id uuid not null references public.profiles(id) on delete cascade,
  voted_at timestamptz,
  primary key (session_id, voter_id)
);

create index if not exists pizza_session_participants_voter_idx
  on public.pizza_session_participants (voter_id, session_id);

create table if not exists public.pizza_session_votes (
  session_id uuid not null references public.pizza_sessions(id) on delete cascade,
  voter_id uuid not null references public.profiles(id) on delete cascade,
  location smallint not null check (location between 0 and 10),
  pizza smallint not null check (pizza between 0 and 10),
  dessert smallint not null check (dessert between 0 and 10),
  price smallint not null check (price between 0 and 10),
  bonus_fabio smallint not null default 0 check (bonus_fabio between 0 and 7),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (session_id, voter_id)
);

alter table public.pizza_session_votes
  add column if not exists bonus_fabio smallint not null default 0;

alter table public.pizza_session_votes
  drop constraint if exists pizza_session_votes_location_check,
  drop constraint if exists pizza_session_votes_pizza_check,
  drop constraint if exists pizza_session_votes_dessert_check,
  drop constraint if exists pizza_session_votes_price_check;

alter table public.pizza_session_votes
  add constraint pizza_session_votes_location_check check (location between 0 and 10),
  add constraint pizza_session_votes_pizza_check check (pizza between 0 and 10),
  add constraint pizza_session_votes_dessert_check check (dessert between 0 and 10),
  add constraint pizza_session_votes_price_check check (price between 0 and 10);

alter table public.pizza_sessions
  drop constraint if exists pizza_sessions_average_location_check,
  drop constraint if exists pizza_sessions_average_pizza_check,
  drop constraint if exists pizza_sessions_average_dessert_check,
  drop constraint if exists pizza_sessions_average_price_check,
  drop constraint if exists pizza_sessions_final_score_check;

alter table public.pizza_sessions
  add constraint pizza_sessions_average_location_check check (average_location between 0 and 10),
  add constraint pizza_sessions_average_pizza_check check (average_pizza between 0 and 10),
  add constraint pizza_sessions_average_dessert_check check (average_dessert between 0 and 10),
  add constraint pizza_sessions_average_price_check check (average_price between 0 and 10),
  add constraint pizza_sessions_final_score_check check (final_score between 0 and 100);

-- Le vecchie sessioni non devono restare aperte per sempre dopo la rimozione
-- del timer. I votanti già presenti diventano partecipanti e la sessione viene
-- archiviata con il risultato disponibile.
insert into public.pizza_session_participants (session_id, voter_id, voted_at)
select vote.session_id, vote.voter_id, vote.updated_at
from public.pizza_session_votes as vote
join public.pizza_sessions as session on session.id = vote.session_id
where session.closes_at is not null
on conflict (session_id, voter_id) do update
set voted_at = excluded.voted_at;

insert into public.pizza_session_participants (session_id, voter_id, voted_at)
select session.id, session.opened_by, null
from public.pizza_sessions as session
where session.closes_at is not null
  and not exists (
    select 1 from public.pizza_session_participants as participant
    where participant.session_id = session.id
  )
on conflict (session_id, voter_id) do nothing;

update public.pizza_sessions
set completed_at = coalesce(completed_at, least(closes_at, now()))
where closes_at is not null;

-- Le sessioni con il solo autore, già ammesse dalla versione precedente,
-- diventano votazioni personali.
update public.pizza_sessions as session
set is_solo = true
where (
  select count(*)
  from public.pizza_session_participants as participant
  where participant.session_id = session.id
) = 1;

update public.pizza_restaurants as restaurant
set is_personal = true
where exists (
  select 1
  from public.pizza_sessions as solo_session
  where solo_session.restaurant_id = restaurant.id
    and solo_session.is_solo
)
and not exists (
  select 1
  from public.pizza_sessions as group_session
  where group_session.restaurant_id = restaurant.id
    and not group_session.is_solo
);

drop function if exists public.open_pizza_session(uuid);
drop policy if exists "Membri aprono le sessioni" on public.pizza_sessions;
drop policy if exists "Voti visibili a chi ha votato" on public.pizza_session_votes;
drop policy if exists "Ognuno vota per sé" on public.pizza_session_votes;
drop policy if exists "Il voto si corregge finché la sessione è aperta" on public.pizza_session_votes;
drop index if exists public.pizza_sessions_open_idx;

alter table public.pizza_sessions drop column if exists closes_at;

alter table public.pizza_sessions enable row level security;
alter table public.pizza_session_participants enable row level security;
alter table public.pizza_session_votes enable row level security;

drop policy if exists "Membri leggono le pizzerie" on public.pizza_restaurants;
create policy "Membri leggono le pizzerie"
on public.pizza_restaurants for select
to authenticated
using (
  not is_personal
  or created_by = (select auth.uid())
);

drop policy if exists "Membri leggono le sessioni" on public.pizza_sessions;
create policy "Membri leggono le sessioni"
on public.pizza_sessions for select
to authenticated
using (
  not is_solo
  or opened_by = (select auth.uid())
);

drop policy if exists "Membri leggono i partecipanti" on public.pizza_session_participants;
create policy "Membri leggono i partecipanti"
on public.pizza_session_participants for select
to authenticated
using (
  exists (
    select 1
    from public.pizza_sessions as visible_session
    where visible_session.id = pizza_session_participants.session_id
      and (
        not visible_session.is_solo
        or visible_session.opened_by = (select auth.uid())
      )
  )
);

drop policy if exists "Voti visibili alla chiusura" on public.pizza_session_votes;
create policy "Voti visibili alla chiusura"
on public.pizza_session_votes for select
to authenticated
using (
  voter_id = (select auth.uid())
  or exists (
    select 1 from public.pizza_sessions as shared_session
    where shared_session.id = pizza_session_votes.session_id
      and not shared_session.is_solo
      and shared_session.completed_at is not null
  )
);

revoke insert, update, delete on public.pizza_sessions from anon, authenticated;
revoke insert, update, delete on public.pizza_session_participants from anon, authenticated;
revoke insert, update, delete on public.pizza_session_votes from anon, authenticated;
grant select on public.pizza_sessions to authenticated;
grant select on public.pizza_session_participants to authenticated;
grant select on public.pizza_session_votes to authenticated;

drop function if exists public.open_pizza_session(text, text, uuid[]);
drop function if exists public.open_pizza_session(text, text, uuid[], boolean);

create function public.open_pizza_session(
  p_name text,
  p_place text,
  p_participant_ids uuid[],
  p_is_solo boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  clean_participants uuid[];
  new_restaurant_id uuid;
  new_session_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Devi accedere per aprire una votazione';
  end if;

  if nullif(trim(p_name), '') is null then
    raise exception 'Inserisci il nome della pizzeria';
  end if;

  select array_agg(distinct participant_id)
  into clean_participants
  from unnest(coalesce(p_participant_ids, array[]::uuid[])) as participant(participant_id);

  if p_is_solo then
    if coalesce(array_length(clean_participants, 1), 0) <> 1
      or clean_participants[1] <> auth.uid() then
      raise exception 'Una votazione personale può contenere soltanto chi la apre';
    end if;
  else
    if coalesce(array_length(clean_participants, 1), 0) < 2 then
      raise exception 'Una votazione di gruppo richiede almeno due partecipanti';
    end if;

    if not auth.uid() = any(clean_participants) then
      raise exception 'Chi apre la votazione deve essere tra i partecipanti';
    end if;
  end if;

  if (
    select count(*) from public.profiles where id = any(clean_participants)
  ) <> array_length(clean_participants, 1) then
    raise exception 'Uno o più partecipanti non sono validi';
  end if;

  insert into public.pizza_restaurants (name, place, created_by, is_personal)
  values (trim(p_name), nullif(trim(p_place), ''), auth.uid(), p_is_solo)
  returning id into new_restaurant_id;

  insert into public.pizza_sessions (restaurant_id, opened_by, is_solo)
  values (new_restaurant_id, auth.uid(), p_is_solo)
  returning id into new_session_id;

  insert into public.pizza_session_participants (session_id, voter_id)
  select new_session_id, participant_id
  from unnest(clean_participants) as participant(participant_id);

  return new_session_id;
end;
$$;

create or replace function public.save_pizza_session_vote(
  p_session_id uuid,
  p_location smallint,
  p_pizza smallint,
  p_dessert smallint,
  p_price smallint,
  p_bonus_fabio smallint default 0
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  is_complete boolean;
  current_name text;
  result_location numeric;
  result_pizza numeric;
  result_dessert numeric;
  result_price numeric;
  weighted_average numeric;
  has_fabio boolean;
  fabio_bonus smallint;
  result_score smallint;
begin
  if auth.uid() is null then
    raise exception 'Devi accedere per votare';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_session_id::text));

  if not exists (
    select 1 from public.pizza_sessions
    where id = p_session_id and completed_at is null
  ) then
    raise exception 'La votazione è già chiusa o non esiste';
  end if;

  if not exists (
    select 1 from public.pizza_session_participants
    where session_id = p_session_id and voter_id = auth.uid()
  ) then
    raise exception 'Non sei tra i partecipanti di questa votazione';
  end if;

  if p_location not between 0 and 10
    or p_pizza not between 0 and 10
    or p_dessert not between 0 and 10
    or p_price not between 0 and 10
    or p_bonus_fabio not between 0 and 7 then
    raise exception 'Uno o più voti non sono validi';
  end if;

  select lower(display_name) into current_name
  from public.profiles where id = auth.uid();

  if current_name <> 'fabio' and p_bonus_fabio <> 0 then
    raise exception 'I punti Fabio possono essere assegnati solo da Fabio';
  end if;

  insert into public.pizza_session_votes (
    session_id, voter_id, location, pizza, dessert, price, bonus_fabio
  ) values (
    p_session_id, auth.uid(), p_location, p_pizza, p_dessert, p_price, p_bonus_fabio
  )
  on conflict (session_id, voter_id) do update set
    location = excluded.location,
    pizza = excluded.pizza,
    dessert = excluded.dessert,
    price = excluded.price,
    bonus_fabio = excluded.bonus_fabio,
    updated_at = now();

  update public.pizza_session_participants
  set voted_at = now()
  where session_id = p_session_id and voter_id = auth.uid();

  select not exists (
    select 1 from public.pizza_session_participants
    where session_id = p_session_id and voted_at is null
  ) into is_complete;

  if is_complete then
    select
      avg(vote.location),
      avg(vote.pizza),
      avg(vote.dessert),
      avg(vote.price),
      coalesce(bool_or(lower(profile.display_name) = 'fabio'), false),
      coalesce(max(vote.bonus_fabio) filter (where lower(profile.display_name) = 'fabio'), 0)
    into
      result_location,
      result_pizza,
      result_dessert,
      result_price,
      has_fabio,
      fabio_bonus
    from public.pizza_session_votes as vote
    join public.profiles as profile on profile.id = vote.voter_id
    where vote.session_id = p_session_id;

    weighted_average := (
      result_location * 7
      + result_pizza * 10
      + result_dessert * 4
      + result_price * 10
    ) / 31.0;

    result_score := floor(
      weighted_average * (case when has_fabio then 9.3 else 10 end)
      + (case when has_fabio then fabio_bonus else 0 end)
      + 0.5
    )::smallint;

    update public.pizza_sessions
    set
      completed_at = now(),
      average_location = result_location,
      average_pizza = result_pizza,
      average_dessert = result_dessert,
      average_price = result_price,
      final_score = result_score
    where id = p_session_id;
  end if;

  return is_complete;
end;
$$;

revoke all on function public.open_pizza_session(text, text, uuid[], boolean) from public, anon;
revoke all on function public.save_pizza_session_vote(uuid, smallint, smallint, smallint, smallint, smallint) from public, anon;
grant execute on function public.open_pizza_session(text, text, uuid[], boolean) to authenticated;
grant execute on function public.save_pizza_session_vote(uuid, smallint, smallint, smallint, smallint, smallint) to authenticated;

create or replace function public.delete_open_pizza_session(p_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  owned_restaurant_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Devi accedere per eliminare una votazione';
  end if;

  select restaurant_id
  into owned_restaurant_id
  from public.pizza_sessions
  where id = p_session_id
    and opened_by = auth.uid()
    and completed_at is null
  for update;

  if owned_restaurant_id is null then
    raise exception 'Puoi eliminare soltanto una tua votazione ancora aperta';
  end if;

  delete from public.pizza_sessions where id = p_session_id;

  delete from public.pizza_restaurants as restaurant
  where restaurant.id = owned_restaurant_id
    and not exists (
      select 1 from public.pizza_sessions as remaining_session
      where remaining_session.restaurant_id = restaurant.id
    );

  return true;
end;
$$;

revoke all on function public.delete_open_pizza_session(uuid) from public, anon;
grant execute on function public.delete_open_pizza_session(uuid) to authenticated;

-- Compatibilità con il frontend precedente: le chiamate senza p_is_solo
-- restano votazioni di gruppo.
create function public.open_pizza_session(
  p_name text,
  p_place text,
  p_participant_ids uuid[]
)
returns uuid
language sql
security invoker
set search_path = public, pg_temp
as $$
  select public.open_pizza_session(p_name, p_place, p_participant_ids, false);
$$;

revoke all on function public.open_pizza_session(text, text, uuid[]) from public, anon;
grant execute on function public.open_pizza_session(text, text, uuid[]) to authenticated;

with aggregates as (
  select
    vote.session_id,
    avg(vote.location) as average_location,
    avg(vote.pizza) as average_pizza,
    avg(vote.dessert) as average_dessert,
    avg(vote.price) as average_price,
    coalesce(bool_or(lower(profile.display_name) = 'fabio'), false) as has_fabio,
    coalesce(max(vote.bonus_fabio) filter (where lower(profile.display_name) = 'fabio'), 0) as fabio_bonus
  from public.pizza_session_votes as vote
  join public.profiles as profile on profile.id = vote.voter_id
  group by vote.session_id
)
update public.pizza_sessions as session
set
  average_location = aggregate.average_location,
  average_pizza = aggregate.average_pizza,
  average_dessert = aggregate.average_dessert,
  average_price = aggregate.average_price,
  final_score = floor(
    (
      aggregate.average_location * 7
      + aggregate.average_pizza * 10
      + aggregate.average_dessert * 4
      + aggregate.average_price * 10
    ) / 31.0
    * (case when aggregate.has_fabio then 9.3 else 10 end)
    + (case when aggregate.has_fabio then aggregate.fabio_bonus else 0 end)
    + 0.5
  )::smallint
from aggregates as aggregate
where session.id = aggregate.session_id
  and session.completed_at is not null;

-- Rimozione richiesta: le tabelle collegate usano ON DELETE CASCADE.
delete from public.pizza_restaurants
where name ilike '%spizza%';

notify pgrst, 'reload schema';
