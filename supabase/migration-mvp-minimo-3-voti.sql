-- TheBoyz · un MVP richiede sempre almeno tre voti.
--
-- Corregge i due casi che prima potevano assegnare un MVP con meno voti:
-- la chiusura dopo il voto di tutti e la scadenza automatica dopo 12 ore.
-- Ricalcola inoltre gli MVP gia chiusi, mantenendo soltanto il leader unico
-- che abbia ricevuto almeno tre voti.

create or replace function public.enforce_match_mvp_minimum_votes()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if (
    select count(*)
    from public.match_mvp_votes
    where match_id = new.match_id
      and target_id = new.profile_id
  ) < 3 then
    raise exception 'Per assegnare l''MVP servono almeno 3 voti';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_match_mvp_minimum_votes on public.match_mvps;
create trigger enforce_match_mvp_minimum_votes
before insert or update on public.match_mvps
for each row execute function public.enforce_match_mvp_minimum_votes();

create or replace function public.vote_match_mvp(
  p_match_id uuid,
  p_target_id uuid
)
returns table (
  is_awarded boolean,
  is_closed boolean,
  winner_ids uuid[],
  votes_cast integer,
  total_voters integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  current_winners uuid[] := array[]::uuid[];
  v_votes_cast integer;
  v_total_voters integer;
  v_top_votes integer;
  v_leader_count integer;
begin
  if current_user_id is null then
    raise exception 'Devi accedere per votare l''MVP';
  end if;

  perform pg_advisory_xact_lock(hashtext('match_mvp:' || p_match_id::text));

  if not exists (
    select 1 from public.matches
    where id = p_match_id
      and mvp_voting_enabled
      and mvp_voting_closed_at is null
  ) then
    raise exception 'La votazione MVP non è disponibile o è già chiusa';
  end if;

  select coalesce(array_agg(profile_id order by profile_id), array[]::uuid[])
  into current_winners
  from public.match_mvps
  where match_id = p_match_id;

  if cardinality(current_winners) > 0 then
    raise exception 'L''MVP di questa partita è già stato assegnato';
  end if;

  if not exists (
    select 1 from public.match_players
    where match_id = p_match_id and profile_id = current_user_id
  ) then
    raise exception 'Solo chi ha giocato la partita può votare';
  end if;

  if not exists (
    select 1 from public.match_players
    where match_id = p_match_id and profile_id = p_target_id
  ) then
    raise exception 'Puoi votare soltanto uno dei partecipanti alla partita';
  end if;

  if p_target_id = current_user_id then
    raise exception 'Non puoi votare te stesso come MVP';
  end if;

  insert into public.match_mvp_votes (match_id, voter_id, target_id)
  values (p_match_id, current_user_id, p_target_id)
  on conflict (match_id, voter_id) do update set
    target_id = excluded.target_id,
    updated_at = now();

  select count(*)::integer
  into v_votes_cast
  from public.match_mvp_votes
  where match_id = p_match_id;

  select count(*)::integer
  into v_total_voters
  from public.match_players
  where match_id = p_match_id;

  select coalesce(max(target_votes), 0)::integer
  into v_top_votes
  from (
    select count(*)::integer as target_votes
    from public.match_mvp_votes
    where match_id = p_match_id
    group by target_id
  ) as totals;

  if v_top_votes >= 3 then
    select count(*)::integer, array_agg(target_id order by target_id)
    into v_leader_count, current_winners
    from (
      select target_id
      from public.match_mvp_votes
      where match_id = p_match_id
      group by target_id
      having count(*) = v_top_votes
    ) as leaders;

    if v_leader_count = 1 then
      insert into public.match_mvps (match_id, profile_id)
      values (p_match_id, current_winners[1])
      on conflict do nothing;
    else
      current_winners := array[]::uuid[];
    end if;

    update public.matches
    set mvp_voting_closed_at = now()
    where id = p_match_id;
  elsif v_votes_cast >= v_total_voters then
    current_winners := array[]::uuid[];

    update public.matches
    set mvp_voting_closed_at = now()
    where id = p_match_id;
  end if;

  return query select
    cardinality(current_winners) > 0,
    v_top_votes >= 3 or v_votes_cast >= v_total_voters,
    current_winners,
    v_votes_cast,
    v_total_voters;
end;
$$;

create or replace function public.close_expired_mvp_votings()
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  expired_match record;
  winner_ids uuid[];
  top_votes integer;
  leader_count integer;
  closed_count integer := 0;
begin
  for expired_match in
    select id
    from public.matches
    where mvp_voting_enabled
      and mvp_voting_closed_at is null
      and coalesce(mvp_voting_opened_at, created_at) + interval '12 hours' <= now()
    for update skip locked
  loop
    perform pg_advisory_xact_lock(hashtext('match_mvp:' || expired_match.id::text));

    select coalesce(max(candidate_votes), 0)::integer
    into top_votes
    from (
      select count(*)::integer as candidate_votes
      from public.match_mvp_votes
      where match_id = expired_match.id
      group by target_id
    ) as totals;

    winner_ids := array[]::uuid[];

    if top_votes >= 3 then
      select count(*)::integer, array_agg(target_id order by target_id)
      into leader_count, winner_ids
      from (
        select target_id
        from public.match_mvp_votes
        where match_id = expired_match.id
        group by target_id
        having count(*) = top_votes
      ) as leaders;

      if leader_count = 1 then
        insert into public.match_mvps (match_id, profile_id)
        values (expired_match.id, winner_ids[1])
        on conflict do nothing;
      end if;
    end if;

    update public.matches
    set mvp_voting_closed_at = now()
    where id = expired_match.id
      and mvp_voting_closed_at is null;

    closed_count := closed_count + 1;
  end loop;

  return closed_count;
end;
$$;

-- Togli gli MVP che non rispettano la nuova regola o che non sono piu il
-- leader unico della propria votazione.
with vote_totals as (
  select match_id, target_id, count(*)::integer as votes
  from public.match_mvp_votes
  group by match_id, target_id
), ranked as (
  select
    vote_totals.*,
    max(votes) over (partition by match_id) as top_votes
  from vote_totals
), eligible as (
  select
    ranked.match_id,
    (array_agg(ranked.target_id order by ranked.target_id))[1] as profile_id
  from ranked
  join public.matches on matches.id = ranked.match_id
  where matches.mvp_voting_enabled
    and matches.mvp_voting_closed_at is not null
    and ranked.votes = ranked.top_votes
    and ranked.top_votes >= 3
  group by ranked.match_id
  having count(*) = 1
)
delete from public.match_mvps
using public.matches
where matches.id = match_mvps.match_id
  and matches.mvp_voting_enabled
  and not exists (
    select 1
    from eligible
    where eligible.match_id = match_mvps.match_id
      and eligible.profile_id = match_mvps.profile_id
  );

-- Ripristina eventuali MVP mancanti che invece rispettano la regola.
with vote_totals as (
  select match_id, target_id, count(*)::integer as votes
  from public.match_mvp_votes
  group by match_id, target_id
), ranked as (
  select
    vote_totals.*,
    max(votes) over (partition by match_id) as top_votes
  from vote_totals
), eligible as (
  select
    ranked.match_id,
    (array_agg(ranked.target_id order by ranked.target_id))[1] as profile_id
  from ranked
  join public.matches on matches.id = ranked.match_id
  where matches.mvp_voting_enabled
    and matches.mvp_voting_closed_at is not null
    and ranked.votes = ranked.top_votes
    and ranked.top_votes >= 3
  group by ranked.match_id
  having count(*) = 1
)
insert into public.match_mvps (match_id, profile_id)
select match_id, profile_id
from eligible
on conflict do nothing;

revoke all on function public.enforce_match_mvp_minimum_votes()
  from public, anon, authenticated;
revoke all on function public.vote_match_mvp(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.close_expired_mvp_votings()
  from public, anon, authenticated;
grant execute on function public.vote_match_mvp(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
