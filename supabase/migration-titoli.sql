-- TheBoyz · migrazione: i titoli votati dal gruppo
-- Esegui questo file UNA SOLA VOLTA nel SQL Editor del progetto Supabase.
-- È idempotente: rilanciarlo non rompe nulla.
--
-- Otto titoli, uno per volta: ognuno indica chi secondo lui merita il titolo.
-- Non c'è una sessione e non c'è una scadenza — la votazione è sempre aperta e
-- il voto si cambia quando si vuole, come si cambia idea su una persona.
--
-- Non ci si vota da soli, e il vincolo sta qui e non nel frontend, perché un
-- vincolo che vive solo nel telefono non è un vincolo (`title_votes_no_self`).
--
-- Non esiste una scheda bianca: o c'è la riga, o non hai votato. Il voto si
-- toglie ripremendo il nome già scelto, e `save_title_vote` con `p_target_id`
-- nullo cancella la riga invece di salvarne una vuota.
--
-- I voti sono ANONIMI. Non basta una policy per ottenerlo: se il telefono
-- potesse leggere i voti per contarli, chi legge potrebbe anche guardarli. Per
-- questo la policy di lettura lascia vedere a ognuno **solo la propria riga**, e
-- i totali arrivano già sommati da `title_standings()`, che gira come il
-- proprietario della funzione e restituisce numeri, mai nomi di votanti.

create table if not exists public.title_votes (
  title text not null check (title in (
    'ego', 'intimidator', 'showman', 'clutcher',
    'consistency', 'cheater', 'trash_talker', 'goat'
  )),
  voter_id uuid not null references public.profiles(id) on delete cascade,
  target_id uuid not null references public.profiles(id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (title, voter_id),
  constraint title_votes_no_self check (target_id <> voter_id)
);

-- Recupero per chi ha già eseguito la prima versione di questo file, quando la
-- scheda bianca esisteva: le righe vuote spariscono e la colonna diventa
-- obbligatoria. Su un'installazione nuova non trova niente da fare.
delete from public.title_votes where target_id is null;

alter table public.title_votes
  alter column target_id set not null;

alter table public.title_votes
  drop constraint if exists title_votes_no_self;

alter table public.title_votes
  add constraint title_votes_no_self check (target_id <> voter_id);

create index if not exists title_votes_target_idx
  on public.title_votes (title, target_id);

alter table public.title_votes enable row level security;

-- Ognuno rivede il proprio voto — serve a ripresentarlo selezionato quando si
-- riapre il foglio. Quelli degli altri non escono da qui in nessun caso.
drop policy if exists "Ognuno rilegge il proprio voto" on public.title_votes;
create policy "Ognuno rilegge il proprio voto"
on public.title_votes for select
to authenticated
using (voter_id = auth.uid());

-- Si scrive solo passando dalla funzione qui sotto, come per le partite e per
-- la pizza: è lì che stanno i controlli.
revoke insert, update, delete on public.title_votes from anon, authenticated;
grant select on public.title_votes to authenticated;

-- I totali, un riga per ogni giocatore che ha ricevuto almeno un voto.
create or replace function public.title_standings()
returns table (title text, target_id uuid, votes integer)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select vote.title, vote.target_id, count(*)::integer as votes
  from public.title_votes as vote
  group by vote.title, vote.target_id
  order by vote.title, count(*) desc;
$$;

create or replace function public.save_title_vote(
  p_title text,
  p_target_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Devi accedere per votare';
  end if;

  if p_title not in (
    'ego', 'intimidator', 'showman', 'clutcher',
    'consistency', 'cheater', 'trash_talker', 'goat'
  ) then
    raise exception 'Titolo non riconosciuto';
  end if;

  -- Nessun destinatario: si sta togliendo il voto, non salvandone uno vuoto.
  if p_target_id is null then
    delete from public.title_votes
    where title = p_title and voter_id = auth.uid();
    return;
  end if;

  if p_target_id = auth.uid() then
    raise exception 'Non puoi votare te stesso';
  end if;

  if not exists (select 1 from public.profiles where id = p_target_id) then
    raise exception 'Il giocatore votato non esiste';
  end if;

  insert into public.title_votes (title, voter_id, target_id)
  values (p_title, auth.uid(), p_target_id)
  on conflict (title, voter_id) do update set
    target_id = excluded.target_id,
    updated_at = now();
end;
$$;

revoke all on function public.title_standings() from public;
revoke all on function public.save_title_vote(text, uuid) from public;
grant execute on function public.title_standings() to authenticated;
grant execute on function public.save_title_vote(text, uuid) to authenticated;

notify pgrst, 'reload schema';
