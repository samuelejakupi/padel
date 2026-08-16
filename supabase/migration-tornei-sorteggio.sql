-- TheBoyz · il calendario del torneo si sorteggia
--
-- Finora il girone usciva sempre nello stesso ordine, perché era un doppio
-- giro annidato sulle squadre come erano state iscritte: A-B, A-C, B-C. La
-- prima squadra del modulo apriva sempre il torneo e stava sempre a sinistra.
-- Con le stesse persone che si iscrivono più o meno nello stesso ordine, ogni
-- torneo veniva uguale al precedente.
--
-- Adesso si sorteggiano due cose: **quale incontro si gioca per primo** e
-- **da che parte sta ciascuna squadra**. Il ritorno no: quello è lo specchio
-- dell'andata, e deve restarlo — è il senso del ritorno.
--
-- Cambia solo il corpo di build_tournament_fixtures: la firma è la stessa, e
-- create_round_robin_tournament e update_tournament continuano a chiamarla
-- come prima.
--
-- Esegui questo file nel SQL Editor di Supabase, dopo
-- migration-tornei-formato.sql. È idempotente.

create or replace function public.build_tournament_fixtures(
  p_tournament_id uuid,
  p_team_ids uuid[],
  p_legs smallint,
  p_first_number integer default 1,
  p_first_leg smallint default 1
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  team_total integer := cardinality(p_team_ids);
  match_counter integer := p_first_number - 1;
  accoppiamento record;
begin
  -- Chiamata per il solo ritorno (si aggiunge a un torneo che ha già l'andata):
  -- si specchia quello che c'è, non si rifà il sorteggio. Le stesse partite,
  -- con le squadre scambiate di posto.
  if p_first_leg = 2 then
    insert into public.tournament_fixtures (
      tournament_id, match_number, team1_id, team2_id, leg
    )
    select
      p_tournament_id,
      match_counter + (row_number() over (order by match_number))::integer,
      andata.team2_id,
      andata.team1_id,
      2
    from public.tournament_fixtures as andata
    where andata.tournament_id = p_tournament_id and andata.leg = 1;
    return;
  end if;

  -- L'andata. `materialized` non è un vezzo: senza, il pianificatore può
  -- srotolare la sottoquery e rivalutare random() a ogni riferimento, cioè
  -- ordinare con un sorteggio e girare le squadre con un altro.
  for accoppiamento in
    with sorteggio as materialized (
      select
        p_team_ids[prima] as squadra_a,
        p_team_ids[seconda] as squadra_b,
        random() as ordine,
        random() < 0.5 as inverti
      from generate_series(1, team_total - 1) as prima
      cross join generate_series(2, team_total) as seconda
      where prima < seconda
    )
    select
      case when inverti then squadra_b else squadra_a end as casa,
      case when inverti then squadra_a else squadra_b end as ospite
    from sorteggio
    order by ordine
  loop
    match_counter := match_counter + 1;
    insert into public.tournament_fixtures (
      tournament_id, match_number, team1_id, team2_id, leg
    ) values (
      p_tournament_id, match_counter, accoppiamento.casa, accoppiamento.ospite, 1
    );
  end loop;

  if p_legs = 2 then
    perform public.build_tournament_fixtures(
      p_tournament_id, p_team_ids, 2::smallint, match_counter + 1, 2::smallint
    );
  end if;
end;
$$;

revoke all on function public.build_tournament_fixtures(uuid, uuid[], smallint, integer, smallint)
  from public, anon, authenticated;

notify pgrst, 'reload schema';
