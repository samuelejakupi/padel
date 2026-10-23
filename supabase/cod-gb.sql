-- GB MW4: immagini JPEG private nel database, lette dalla routine Codex via MCP.
-- Il payload binario è separato dal registro: la home non scarica le immagini.
create table if not exists public.cod_identities (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  nickname text not null check (char_length(btrim(nickname)) between 2 and 80),
  created_at timestamptz not null default now()
);
create unique index if not exists cod_nickname_unique on public.cod_identities (lower(btrim(nickname)));
create table if not exists public.cod_gbs (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  played_at timestamptz not null,
  mode text not null check (mode in ('hardpoint','search_destroy','overload')),
  map_name text not null check (char_length(map_name) between 1 and 80),
  image_count integer not null check (image_count between 1 and 4),
  status text not null default 'pending' check (status in ('pending','processing','needs_review','processed')),
  claimed_at timestamptz,
  review_note text,
  team1_score integer check (team1_score >= 0),
  team2_score integer check (team2_score >= 0),
  players jsonb not null default '[]',
  processed_at timestamptz
);
create table if not exists public.cod_gb_images (
  id uuid primary key default gen_random_uuid(),
  gb_id uuid not null references public.cod_gbs(id) on delete cascade,
  image bytea not null check (octet_length(image) between 100 and 1048576),
  digest text not null unique
);
create index if not exists cod_gbs_queue on public.cod_gbs(status, created_at);
alter table public.cod_identities enable row level security;
alter table public.cod_gbs enable row level security;
alter table public.cod_gb_images enable row level security;
revoke all on public.cod_identities, public.cod_gbs, public.cod_gb_images from anon, authenticated;
grant select on public.cod_identities, public.cod_gbs to authenticated;
drop policy if exists cod_read_nicknames on public.cod_identities;
create policy cod_read_nicknames on public.cod_identities for select to authenticated using (exists (select 1 from public.profiles where id = (select auth.uid())));
drop policy if exists cod_read_gbs on public.cod_gbs;
create policy cod_read_gbs on public.cod_gbs for select to authenticated using (exists (select 1 from public.profiles where id = (select auth.uid())));

create or replace function public.save_cod_nickname(p_nickname text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not exists (select 1 from profiles where id=auth.uid()) then raise exception 'Accesso richiesto'; end if;
  insert into cod_identities(profile_id, nickname) values(auth.uid(), btrim(p_nickname));
end; $$;

create or replace function public.submit_cod_gb(p_mode text, p_map text, p_played_at timestamptz, p_images jsonb) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare gb uuid; photo jsonb; payload bytea; n integer;
begin
  if auth.uid() is null or not exists (select 1 from cod_identities where profile_id=auth.uid()) then raise exception 'Associa prima il tuo nick COD'; end if;
  if p_played_at > now() + interval '10 minutes' then raise exception 'La partita non può essere nel futuro'; end if;
  if (select count(*) from cod_gbs where created_by=auth.uid() and created_at > now() - interval '1 day') >= 30 then raise exception 'Limite giornaliero raggiunto'; end if;
  if jsonb_typeof(p_images) <> 'array' then raise exception 'Immagini richieste'; end if;
  n := jsonb_array_length(p_images);
  if n is null or n not between 1 and 4 then raise exception 'Scegli da 1 a 4 foto'; end if;
  insert into cod_gbs(created_by, mode, map_name, played_at, image_count) values(auth.uid(), p_mode, btrim(p_map), p_played_at, n) returning id into gb;
  for photo in select * from jsonb_array_elements(p_images) loop
    if length(photo->>'data') > 1400000 then raise exception 'Immagine troppo grande'; end if;
    payload := decode(photo->>'data', 'base64');
    if payload is null or substring(payload from 1 for 3) <> decode('ffd8ff','hex') then raise exception 'Serve un JPEG compresso'; end if;
    insert into cod_gb_images(gb_id,image,digest) values(gb,payload,encode(digest(payload,'sha256'),'hex'));
  end loop;
  return gb;
end; $$;

create or replace function public.retry_cod_gb(p_id uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
  update cod_gbs set status='pending', review_note=null, claimed_at=null
    where id=p_id and created_by=auth.uid() and status='needs_review';
  if not found then raise exception 'GB non ripresentabile'; end if;
end; $$;

-- Solo la routine privilegiata può pubblicare risultati, con validazione atomica.
create or replace function public.complete_cod_gb(p_id uuid, p_result jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare gb cod_gbs; player jsonb; known uuid; normalized jsonb := '[]'; seen text[] := '{}'; key text;
begin
  select * into gb from cod_gbs where id=p_id for update;
  if not found then raise exception 'GB inesistente'; end if;
  if gb.status='processed' then return; end if;
  if gb.status <> 'processing' then raise exception 'La GB va prima acquisita'; end if;
  if p_result->>'mode' is distinct from gb.mode then raise exception 'Modalità diversa dallo scoreboard'; end if;
  if (p_result->>'team1_score') is null or (p_result->>'team2_score') is null
     or (p_result->>'team1_score')::int < 0 or (p_result->>'team2_score')::int < 0
     or (p_result->>'team1_score')::int = (p_result->>'team2_score')::int then raise exception 'Risultato non conclusivo'; end if;
  if jsonb_typeof(p_result->'players') is distinct from 'array' or jsonb_array_length(p_result->'players') not between 2 and 16 then raise exception 'Giocatori mancanti'; end if;
  for player in select * from jsonb_array_elements(p_result->'players') loop
    if length(btrim(coalesce(player->>'nickname',''))) < 2 or lower(btrim(player->>'nickname')) = any(seen) then raise exception 'Nick mancante o duplicato'; end if;
    seen := array_append(seen, lower(btrim(player->>'nickname')));
    if (player->>'team') is null or (player->>'team')::int not in (1,2) then raise exception 'Squadra mancante'; end if;
    foreach key in array array['kills','deaths'] loop
      if (player->>key) is null or (player->>key)::int not between 0 and 10000 then raise exception 'K/D non valido'; end if;
    end loop;
    foreach key in array array['score','damage','hill_seconds','objective_kills','plants','defuses','first_bloods','overloads','carries'] loop
      if player->>key is not null and (player->>key)::int not between 0 and 1000000 then raise exception 'Statistica non valida'; end if;
      if not (player ? key) then player := player || jsonb_build_object(key,null); end if;
    end loop;
    select profile_id into known from cod_identities where lower(btrim(nickname))=lower(btrim(player->>'nickname'));
    if known is not null and exists (select 1 from jsonb_array_elements(normalized) p where p->>'profile_id'=known::text) then raise exception 'Profilo duplicato'; end if;
    normalized := normalized || jsonb_build_array(player || jsonb_build_object('profile_id', known));
  end loop;
  if not exists (select 1 from jsonb_array_elements(normalized) p where p->>'profile_id'=gb.created_by::text) then raise exception 'Nick autore non riconosciuto'; end if;
  if not exists (select 1 from jsonb_array_elements(normalized) p where (p->>'team')::int=1) or not exists (select 1 from jsonb_array_elements(normalized) p where (p->>'team')::int=2) then raise exception 'Manca una squadra'; end if;
  update cod_gbs set status='processed', team1_score=(p_result->>'team1_score')::int, team2_score=(p_result->>'team2_score')::int,
    players=normalized, processed_at=now(), review_note=null where id=p_id;
end; $$;
revoke all on function public.save_cod_nickname(text), public.submit_cod_gb(text,text,timestamptz,jsonb), public.retry_cod_gb(uuid), public.complete_cod_gb(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.save_cod_nickname(text), public.submit_cod_gb(text,text,timestamptz,jsonb), public.retry_cod_gb(uuid) to authenticated;
grant execute on function public.complete_cod_gb(uuid,jsonb) to service_role;
notify pgrst, 'reload schema';
