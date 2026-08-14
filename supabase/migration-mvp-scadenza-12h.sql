-- TheBoyz · chiusura automatica delle votazioni MVP dopo 12 ore.
-- Alla scadenza viene assegnato l'MVP soltanto se esiste un leader unico.

create extension if not exists pg_cron with schema pg_catalog;

create or replace function public.reject_expired_match_mvp_vote()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1
    from public.matches
    where id = new.match_id
      and created_at + interval '12 hours' <= now()
  ) then
    raise exception 'La votazione MVP è scaduta dopo 12 ore';
  end if;

  return new;
end;
$$;

drop trigger if exists reject_expired_match_mvp_vote on public.match_mvp_votes;
create trigger reject_expired_match_mvp_vote
before insert or update on public.match_mvp_votes
for each row execute function public.reject_expired_match_mvp_vote();

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
      and created_at + interval '12 hours' <= now()
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

    if top_votes > 0 then
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

revoke all on function public.reject_expired_match_mvp_vote() from public, anon, authenticated;
revoke all on function public.close_expired_mvp_votings() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'close-expired-mvp-votings') then
    perform cron.unschedule('close-expired-mvp-votings');
  end if;
end;
$$;

select cron.schedule(
  'close-expired-mvp-votings',
  '* * * * *',
  'select public.close_expired_mvp_votings();'
);

-- Chiude subito anche eventuali votazioni già scadute al momento della migrazione.
select public.close_expired_mvp_votings();
