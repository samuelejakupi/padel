-- TheBoyz · migrazione: votazioni pizza a sessione, con timer e pesi
-- Esegui questo file UNA SOLA VOLTA nel SQL Editor del progetto Supabase.
-- È idempotente: rilanciarlo non rompe nulla.
--
-- Cosa cambia rispetto a prima.
-- Prima ogni pizzeria aveva tre voti fissi, uno a testa per Samu, Fabio e
-- Dani, e il totale era la somma dei loro punteggi su scale diverse
-- (location 0-7, pizza 0-10, dolce 0-4, prezzo 0-10) più il bonus Fabio.
-- Adesso si apre una sessione di voto che dura due ore, chiunque del gruppo
-- vota da 1 a 10 in ogni campo, e il totale è la media dei votanti pesata
-- sull'importanza dei campi.
--
-- I pesi vengono dalle vecchie scale, riportate a 100 senza il bonus:
--   location 21, pizza 30, dolce 12, prezzo 30  →  totale 93
--   riscalati:  23        32        13       32  →  totale 100
-- Un voto pieno (10 ovunque) fa quindi esattamente 100.

-- ---------------------------------------------------------------------------
-- Sessioni di voto
-- ---------------------------------------------------------------------------

create table if not exists public.pizza_sessions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.pizza_restaurants(id) on delete cascade,
  opened_by uuid not null references public.profiles(id) on delete cascade,
  opened_at timestamptz not null default now(),
  closes_at timestamptz not null default now() + interval '2 hours'
);

create index if not exists pizza_sessions_restaurant_idx
  on public.pizza_sessions (restaurant_id, opened_at desc);

create index if not exists pizza_sessions_open_idx
  on public.pizza_sessions (closes_at desc);

alter table public.pizza_sessions enable row level security;

drop policy if exists "Membri leggono le sessioni" on public.pizza_sessions;
create policy "Membri leggono le sessioni"
on public.pizza_sessions for select
to authenticated
using (true);

drop policy if exists "Membri aprono le sessioni" on public.pizza_sessions;
create policy "Membri aprono le sessioni"
on public.pizza_sessions for insert
to authenticated
with check (opened_by = auth.uid());

revoke update, delete on public.pizza_sessions from anon, authenticated;
grant select, insert on public.pizza_sessions to authenticated;

-- ---------------------------------------------------------------------------
-- Voti della sessione
-- ---------------------------------------------------------------------------

create table if not exists public.pizza_session_votes (
  session_id uuid not null references public.pizza_sessions(id) on delete cascade,
  voter_id uuid not null references public.profiles(id) on delete cascade,
  location smallint not null check (location between 1 and 10),
  pizza smallint not null check (pizza between 1 and 10),
  dessert smallint not null check (dessert between 1 and 10),
  price smallint not null check (price between 1 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (session_id, voter_id)
);

create index if not exists pizza_session_votes_session_idx
  on public.pizza_session_votes (session_id);

alter table public.pizza_session_votes enable row level security;

-- Il cuore della regola: finché la sessione è aperta i voti degli altri si
-- vedono solo se hai votato anche tu. A timer scaduto si vedono tutti. Questo
-- sta nel database e non nell'interfaccia, altrimenti basterebbe guardare le
-- chiamate di rete per sbirciare.
drop policy if exists "Voti visibili a chi ha votato" on public.pizza_session_votes;
create policy "Voti visibili a chi ha votato"
on public.pizza_session_votes for select
to authenticated
using (
  voter_id = auth.uid()
  or exists (
    select 1 from public.pizza_sessions as session
    where session.id = pizza_session_votes.session_id
      and session.closes_at <= now()
  )
  or exists (
    select 1 from public.pizza_session_votes as own
    where own.session_id = pizza_session_votes.session_id
      and own.voter_id = auth.uid()
  )
);

-- Si vota solo per sé e solo a sessione aperta.
drop policy if exists "Ognuno vota per sé" on public.pizza_session_votes;
create policy "Ognuno vota per sé"
on public.pizza_session_votes for insert
to authenticated
with check (
  voter_id = auth.uid()
  and exists (
    select 1 from public.pizza_sessions as session
    where session.id = session_id and session.closes_at > now()
  )
);

drop policy if exists "Il voto si corregge finché la sessione è aperta" on public.pizza_session_votes;
create policy "Il voto si corregge finché la sessione è aperta"
on public.pizza_session_votes for update
to authenticated
using (
  voter_id = auth.uid()
  and exists (
    select 1 from public.pizza_sessions as session
    where session.id = session_id and session.closes_at > now()
  )
)
with check (voter_id = auth.uid());

revoke delete on public.pizza_session_votes from anon, authenticated;
grant select, insert, update on public.pizza_session_votes to authenticated;

-- ---------------------------------------------------------------------------
-- Badge Fabio
-- ---------------------------------------------------------------------------
-- Non è più un punteggio: è un giudizio a parte, che Fabio mette o toglie
-- quando vuole, in positivo o in negativo. Non entra nel totale.

create table if not exists public.pizza_fabio_badges (
  restaurant_id uuid primary key references public.pizza_restaurants(id) on delete cascade,
  positive boolean not null,
  assigned_by uuid not null references public.profiles(id) on delete cascade,
  assigned_at timestamptz not null default now()
);

alter table public.pizza_fabio_badges enable row level security;

create or replace function public.is_fabio()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = 'fabio@theboyz.local'
    or exists (
      select 1 from public.profiles
      where id = auth.uid() and lower(display_name) = 'fabio'
    );
$$;

revoke all on function public.is_fabio() from public;
grant execute on function public.is_fabio() to authenticated;

drop policy if exists "Membri leggono i badge" on public.pizza_fabio_badges;
create policy "Membri leggono i badge"
on public.pizza_fabio_badges for select
to authenticated
using (true);

drop policy if exists "Solo Fabio assegna" on public.pizza_fabio_badges;
create policy "Solo Fabio assegna"
on public.pizza_fabio_badges for insert
to authenticated
with check (public.is_fabio() and assigned_by = auth.uid());

drop policy if exists "Solo Fabio cambia" on public.pizza_fabio_badges;
create policy "Solo Fabio cambia"
on public.pizza_fabio_badges for update
to authenticated
using (public.is_fabio())
with check (public.is_fabio() and assigned_by = auth.uid());

drop policy if exists "Solo Fabio toglie" on public.pizza_fabio_badges;
create policy "Solo Fabio toglie"
on public.pizza_fabio_badges for delete
to authenticated
using (public.is_fabio());

grant select, insert, update, delete on public.pizza_fabio_badges to authenticated;

-- ---------------------------------------------------------------------------
-- Apertura di una sessione
-- ---------------------------------------------------------------------------
-- Una funzione invece di un semplice insert: serve a impedire che due persone
-- aprano due votazioni per la stessa pizzeria nello stesso momento.

create or replace function public.open_pizza_session(p_restaurant_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  existing_id uuid;
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Devi accedere per aprire una votazione';
  end if;

  select id into existing_id
  from public.pizza_sessions
  where restaurant_id = p_restaurant_id and closes_at > now()
  limit 1;

  if existing_id is not null then
    return existing_id;
  end if;

  insert into public.pizza_sessions (restaurant_id, opened_by)
  values (p_restaurant_id, auth.uid())
  returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.open_pizza_session(uuid) from public;
grant execute on function public.open_pizza_session(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Chiunque può creare una pizzeria e votare, non più i soli tre di prima.
-- ---------------------------------------------------------------------------

create or replace function public.create_pizza_restaurant(p_name text, p_place text default null)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Devi accedere per aggiungere una pizzeria';
  end if;

  insert into public.pizza_restaurants (name, place, created_by)
  values (trim(p_name), nullif(trim(p_place), ''), auth.uid())
  returning id into new_id;
  return new_id;
end;
$$;

revoke all on function public.create_pizza_restaurant(text, text) from public;
grant execute on function public.create_pizza_restaurant(text, text) to authenticated;

notify pgrst, 'reload schema';
