-- TheBoyz · migrazione: i titoli votati dal gruppo
-- Esegui questo file UNA SOLA VOLTA nel SQL Editor del progetto Supabase.
-- È idempotente: rilanciarlo non rompe nulla.
--
-- Otto titoli, uno per volta: ognuno indica chi secondo lui merita il titolo.
-- Non c'è una sessione e non c'è una scadenza — la votazione è sempre aperta e
-- il voto si cambia quando si vuole, come si cambia idea su una persona.
--
-- Due regole vengono dal gruppo e stanno scritte qui, non nel frontend, perché
-- un vincolo che vive solo nel telefono non è un vincolo:
--   · non ci si vota da soli (`title_votes_no_self`);
--   · si può lasciare bianco, ed è una scelta diversa dal non aver votato —
--     bianco è una riga con `target_id` nullo, non votato è nessuna riga.
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
  -- Nullo = scheda bianca: "per questo titolo non voto nessuno".
  target_id uuid references public.profiles(id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (title, voter_id),
  constraint title_votes_no_self check (target_id is null or target_id <> voter_id)
);

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

-- I totali. Le righe con `target_id` nullo sono le schede bianche di quel
-- titolo: il frontend le mostra come astensioni invece di farle sparire, così
-- si capisce se un titolo è poco votato o solo poco sentito.
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

  if p_target_id is not null then
    if p_target_id = auth.uid() then
      raise exception 'Non puoi votare te stesso';
    end if;

    if not exists (select 1 from public.profiles where id = p_target_id) then
      raise exception 'Il giocatore votato non esiste';
    end if;
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
