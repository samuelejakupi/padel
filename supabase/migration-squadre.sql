-- TheBoyz · migrazione: nome e immagine delle squadre di padel
-- Esegui questo file UNA SOLA VOLTA nel SQL Editor del progetto Supabase.
-- È idempotente: rilanciarlo non rompe nulla.
--
-- Le squadre restano ricavate dalle partite: qui salviamo soltanto il nome e
-- la foto che i due membri decidono di darsi. Per le immagini riusiamo il
-- bucket "avatars" già esistente, così non servono nuovi permessi di storage.

create table if not exists public.padel_teams (
  id uuid primary key default gen_random_uuid(),
  player_a uuid not null references public.profiles(id) on delete cascade,
  player_b uuid not null references public.profiles(id) on delete cascade,
  name text,
  image_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- I due riferimenti sono ordinati, così la coppia (A,B) e la coppia (B,A)
-- non possono esistere entrambe.
alter table public.padel_teams drop constraint if exists padel_teams_pair_order;
alter table public.padel_teams
  add constraint padel_teams_pair_order check (player_a < player_b);

alter table public.padel_teams drop constraint if exists padel_teams_name_len;
alter table public.padel_teams
  add constraint padel_teams_name_len
  check (name is null or char_length(trim(name)) between 2 and 40);

create unique index if not exists padel_teams_pair_idx
  on public.padel_teams (player_a, player_b);

drop trigger if exists padel_teams_touch_updated_at on public.padel_teams;
create trigger padel_teams_touch_updated_at
before update on public.padel_teams
for each row execute function public.touch_updated_at();

alter table public.padel_teams enable row level security;

drop policy if exists "Membri leggono le squadre" on public.padel_teams;
create policy "Membri leggono le squadre"
on public.padel_teams for select
to authenticated
using (true);

-- Solo chi fa parte della coppia può crearla o modificarla.
drop policy if exists "I membri creano la propria squadra" on public.padel_teams;
create policy "I membri creano la propria squadra"
on public.padel_teams for insert
to authenticated
with check (auth.uid() in (player_a, player_b));

drop policy if exists "I membri aggiornano la propria squadra" on public.padel_teams;
create policy "I membri aggiornano la propria squadra"
on public.padel_teams for update
to authenticated
using (auth.uid() in (player_a, player_b))
with check (auth.uid() in (player_a, player_b));

grant select, insert, update on public.padel_teams to authenticated;
revoke delete on public.padel_teams from anon, authenticated;

notify pgrst, 'reload schema';
