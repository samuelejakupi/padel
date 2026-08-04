-- TheBoyz · migrazione: le "plays", spezzoni brevi presi dai video YouTube
-- Esegui questo file UNA SOLA VOLTA nel SQL Editor del progetto Supabase.
-- È idempotente: rilanciarlo non rompe nulla.
--
-- Non si salva nessun video: si salva solo dove guardare. Un indirizzo
-- YouTube, il secondo di partenza e quanto dura lo spezzone. La riproduzione
-- avviene sul player di YouTube con start ed end, quindi non c'è nulla da
-- ospitare e nulla da ricodificare.

create table if not exists public.player_plays (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  match_id uuid references public.matches(id) on delete set null,
  title text check (title is null or char_length(trim(title)) <= 80),
  video_url text not null check (video_url ~* '^https?://'),
  start_seconds integer not null check (start_seconds >= 0 and start_seconds <= 86400),
  duration_seconds integer not null default 8 check (duration_seconds between 2 and 30),
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists player_plays_profile_idx
  on public.player_plays (profile_id, created_at desc);

alter table public.player_plays enable row level security;

drop policy if exists "Membri leggono le plays" on public.player_plays;
create policy "Membri leggono le plays"
on public.player_plays for select
to authenticated
using (true);

-- Ognuno cura la propria bacheca: si aggiunge e si toglie solo dalla
-- propria scheda, e sempre a proprio nome.
drop policy if exists "Ognuno aggiunge le proprie plays" on public.player_plays;
create policy "Ognuno aggiunge le proprie plays"
on public.player_plays for insert
to authenticated
with check (created_by = auth.uid() and profile_id = auth.uid());

drop policy if exists "Ognuno rimuove le proprie plays" on public.player_plays;
create policy "Ognuno rimuove le proprie plays"
on public.player_plays for delete
to authenticated
using (profile_id = auth.uid());

revoke update on public.player_plays from anon, authenticated;
grant select, insert, delete on public.player_plays to authenticated;

notify pgrst, 'reload schema';
