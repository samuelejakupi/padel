-- Le partite dei tornei non aprono votazioni MVP. I riconoscimenti e i voti
-- storici vengono conservati: si disabilita soltanto la possibilità di votare.
begin;

create or replace function public.disable_tournament_fixture_mvp()
returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if new.match_id is not null then
    update public.matches set mvp_voting_enabled=false where id=new.match_id;
  end if;
  return new;
end;
$$;
revoke all on function public.disable_tournament_fixture_mvp() from public, anon, authenticated;

create trigger tournament_fixture_disable_mvp
after insert or update of match_id on public.tournament_fixtures
for each row execute function public.disable_tournament_fixture_mvp();

-- Anche una correzione/restore dello stato MVP non deve riaprire i voti.
create or replace function public.prevent_tournament_mvp_voting()
returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if new.mvp_voting_enabled and exists (
    select 1 from public.tournament_fixtures where match_id=new.id
  ) then
    new.mvp_voting_enabled := false;
  end if;
  return new;
end;
$$;
revoke all on function public.prevent_tournament_mvp_voting() from public, anon, authenticated;

create trigger matches_prevent_tournament_mvp
before update of mvp_voting_enabled on public.matches
for each row execute function public.prevent_tournament_mvp_voting();

update public.matches m set mvp_voting_enabled=false
where m.mvp_voting_enabled and exists (
  select 1 from public.tournament_fixtures f where f.match_id=m.id
);

commit;
