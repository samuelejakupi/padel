-- Votazioni personali delle pizzerie.
-- Le sessioni in solitaria sono visibili soltanto a chi le apre e non
-- contribuiscono alle classifiche Contemporanea e Nostalgica.

begin;

alter table public.pizza_sessions
  add column if not exists is_solo boolean not null default false;

alter table public.pizza_restaurants
  add column if not exists is_personal boolean not null default false;

-- Prima di questa migrazione era già possibile aprire una sessione con il solo
-- autore. Quelle sessioni sono a tutti gli effetti votazioni personali.
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

create index if not exists pizza_sessions_owner_kind_idx
  on public.pizza_sessions (opened_by, is_solo, opened_at desc);

create index if not exists pizza_restaurants_personal_owner_idx
  on public.pizza_restaurants (is_personal, created_by);

-- Una pizzeria personale non deve rivelare neppure nome e località agli altri
-- membri. Il flag sulla pizzeria evita che questa decisione dipenda da una
-- sottoquery su una tabella a sua volta protetta da RLS.
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
    select 1
    from public.pizza_sessions as shared_session
    where shared_session.id = pizza_session_votes.session_id
      and not shared_session.is_solo
      and shared_session.completed_at is not null
  )
);

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

revoke all on function public.open_pizza_session(text, text, uuid[], boolean) from public, anon;
grant execute on function public.open_pizza_session(text, text, uuid[], boolean) to authenticated;

-- Compatibilità con il frontend precedente alla pubblicazione di questa
-- modifica: le chiamate senza p_is_solo restano votazioni di gruppo.
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

notify pgrst, 'reload schema';

commit;
