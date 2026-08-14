-- TheBoyz · migrazione: la votazione MVP sopravvive alla correzione
-- Esegui questo file UNA SOLA VOLTA nel SQL Editor del progetto Supabase.
-- E idempotente: rilanciarlo non rompe nulla.
-- Richiede migration-mvp.sql e migration-mvp-scadenza-12h.sql, gia eseguite.
--
-- Il problema. Correggere una partita significa cancellarla e riregistrarla —
-- e l'unico modo per far ricalcolare l'Elo in ordine cronologico. Ma
-- `match_mvps` e `match_mvp_votes` sono appese all'id della partita con
-- `on delete cascade`: alla cancellazione sparivano, e la riga nuova nasceva
-- con `mvp_voting_enabled` a true e `mvp_voting_closed_at` a null. Risultato:
-- aggiungere il campo o il link del video a una partita gia votata faceva
-- ripartire la votazione da zero e cancellava l'MVP assegnato.
--
-- La soluzione. Prima di cancellare si mette da parte lo stato della
-- votazione (`stash_match_mvp`), dopo la riregistrazione lo si rimette sulla
-- riga nuova (`restore_match_mvp`). Passano di li voti, MVP assegnato,
-- chiusura e istante di apertura.

-- L'istante in cui la votazione si e aperta, che non e piu per forza
-- `created_at`: dopo una correzione la riga e nuova ma la votazione e la
-- stessa, e le 12 ore devono continuare a contare da quando si e aperta.
-- Null significa "vale created_at", cioe tutte le partite di prima.
alter table public.matches
  add column if not exists mvp_voting_opened_at timestamptz;

-- Il ripostiglio della correzione. Non ha vincoli verso `matches` di
-- proposito: la riga deve sopravvivere alla cancellazione della partita, che
-- e tutto il punto. Nessuno la legge dal client — RLS accesa e nessuna
-- policy — e le righe vecchie si buttano da sole.
create table if not exists public.match_mvp_carry (
  old_match_id uuid primary key,
  voting_enabled boolean not null,
  voting_opened_at timestamptz not null,
  voting_closed_at timestamptz,
  winners uuid[] not null default array[]::uuid[],
  votes jsonb not null default '[]'::jsonb,
  stashed_at timestamptz not null default now()
);

alter table public.match_mvp_carry enable row level security;
revoke all on public.match_mvp_carry from anon, authenticated;

-- Mette da parte lo stato della votazione. La chiama il frontend subito prima
-- di `delete_match_for_edit`, e puo chiamarla solo chi quella partita la puo
-- correggere davvero: gli stessi controlli della porta della correzione.
create or replace function public.stash_match_mvp(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Devi accedere per correggere una partita';
  end if;

  if not exists (select 1 from public.matches where id = p_match_id) then
    raise exception 'Partita non trovata';
  end if;

  if not exists (
    select 1 from public.matches
    where id = p_match_id and created_by = current_user_id
  ) and not exists (
    select 1 from public.match_players
    where match_id = p_match_id and profile_id = current_user_id
  ) then
    raise exception 'Può correggere il risultato solo chi ha giocato la partita';
  end if;

  delete from public.match_mvp_carry where stashed_at < now() - interval '1 day';

  insert into public.match_mvp_carry (
    old_match_id, voting_enabled, voting_opened_at, voting_closed_at, winners, votes
  )
  select
    partita.id,
    partita.mvp_voting_enabled,
    coalesce(partita.mvp_voting_opened_at, partita.created_at),
    partita.mvp_voting_closed_at,
    coalesce((
      select array_agg(profile_id order by profile_id)
      from public.match_mvps where match_id = partita.id
    ), array[]::uuid[]),
    coalesce((
      select jsonb_agg(jsonb_build_object('voter', voter_id, 'target', target_id))
      from public.match_mvp_votes where match_id = partita.id
    ), '[]'::jsonb)
  from public.matches as partita
  where partita.id = p_match_id
  on conflict (old_match_id) do update set
    voting_enabled = excluded.voting_enabled,
    voting_opened_at = excluded.voting_opened_at,
    voting_closed_at = excluded.voting_closed_at,
    winners = excluded.winners,
    votes = excluded.votes,
    stashed_at = now();
end;
$$;

-- Rimette lo stato sulla riga nuova. Voti e MVP passano solo se chi li
-- riguarda e ancora in campo: una correzione puo anche aver cambiato i
-- giocatori, e un voto per chi non ha piu giocato non vuol dire niente.
create or replace function public.restore_match_mvp(
  p_old_match_id uuid,
  p_new_match_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  stato public.match_mvp_carry;
begin
  if current_user_id is null then
    raise exception 'Devi accedere per correggere una partita';
  end if;

  -- Una correzione e immediata: un ripostiglio vecchio di un'ora non e la
  -- correzione che sta finendo adesso, e non deve finire su una partita a
  -- caso.
  select * into stato
  from public.match_mvp_carry
  where old_match_id = p_old_match_id
    and stashed_at > now() - interval '1 hour';

  if not found then
    return;
  end if;

  if not exists (
    select 1 from public.matches
    where id = p_new_match_id and created_by = current_user_id
  ) and not exists (
    select 1 from public.match_players
    where match_id = p_new_match_id and profile_id = current_user_id
  ) then
    raise exception 'Può correggere il risultato solo chi ha giocato la partita';
  end if;

  -- Solo su una partita appena registrata: se qualcosa e gia stato votato
  -- li sopra, quello che c'e vale piu di quello che portiamo.
  if exists (select 1 from public.match_mvp_votes where match_id = p_new_match_id)
    or exists (select 1 from public.match_mvps where match_id = p_new_match_id)
  then
    delete from public.match_mvp_carry where old_match_id = p_old_match_id;
    return;
  end if;

  -- I voti prima dello stato: il grilletto delle 12 ore guarda l'apertura
  -- della votazione, e appena scritta sarebbe quella vecchia.
  insert into public.match_mvp_votes (match_id, voter_id, target_id)
  select
    p_new_match_id,
    (voto ->> 'voter')::uuid,
    (voto ->> 'target')::uuid
  from jsonb_array_elements(stato.votes) as voto
  where exists (
    select 1 from public.match_players
    where match_id = p_new_match_id and profile_id = (voto ->> 'voter')::uuid
  ) and exists (
    select 1 from public.match_players
    where match_id = p_new_match_id and profile_id = (voto ->> 'target')::uuid
  )
  on conflict (match_id, voter_id) do nothing;

  insert into public.match_mvps (match_id, profile_id)
  select p_new_match_id, vincitore
  from unnest(stato.winners) as vincitore
  where exists (
    select 1 from public.match_players
    where match_id = p_new_match_id and profile_id = vincitore
  )
  on conflict do nothing;

  update public.matches
  set
    mvp_voting_enabled = stato.voting_enabled,
    mvp_voting_opened_at = stato.voting_opened_at,
    -- Una votazione chiusa resta chiusa. Se l'MVP c'era e chi l'aveva vinto
    -- non e piu in campo, la chiusura cade insieme al suo nome.
    mvp_voting_closed_at = case
      when stato.voting_closed_at is null then null
      when coalesce(cardinality(stato.winners), 0) = 0 then stato.voting_closed_at
      when exists (select 1 from public.match_mvps where match_id = p_new_match_id)
        then stato.voting_closed_at
      else null
    end
  where id = p_new_match_id;

  delete from public.match_mvp_carry where old_match_id = p_old_match_id;
end;
$$;

-- Le 12 ore contano dall'apertura della votazione, non dalla riga: dopo una
-- correzione la riga e nuova ma la votazione e la stessa di prima.
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
      and coalesce(mvp_voting_opened_at, created_at) + interval '12 hours' <= now()
  ) then
    raise exception 'La votazione MVP è scaduta dopo 12 ore';
  end if;

  return new;
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

revoke all on function public.stash_match_mvp(uuid) from public;
revoke all on function public.restore_match_mvp(uuid, uuid) from public;
revoke all on function public.reject_expired_match_mvp_vote() from public, anon, authenticated;
revoke all on function public.close_expired_mvp_votings() from public, anon, authenticated;
grant execute on function public.stash_match_mvp(uuid) to authenticated;
grant execute on function public.restore_match_mvp(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
