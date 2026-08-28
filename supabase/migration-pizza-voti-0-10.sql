-- Tutti i criteri ordinari passano alla stessa scala 0-10.
-- Il risultato definitivo viene calcolato e salvato da Postgres con i pesi
-- storici: location 7/31, pizza 10/31, dolce 4/31, prezzo 10/31.

begin;

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
  add column if not exists average_location numeric(4, 2),
  add column if not exists average_pizza numeric(4, 2),
  add column if not exists average_dessert numeric(4, 2),
  add column if not exists average_price numeric(4, 2),
  add column if not exists final_score smallint;

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

revoke all on function public.save_pizza_session_vote(uuid, smallint, smallint, smallint, smallint, smallint) from public, anon;
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

-- Le sessioni già concluse ricevono lo stesso risultato autorevole del
-- backend senza cambiare i voti grezzi registrati.
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

notify pgrst, 'reload schema';

commit;
