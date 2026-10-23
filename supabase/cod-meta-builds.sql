-- Build MW4 caricate dai membri, mostrate nella pagina Meta accanto a quelle
-- scritte nel codice. Si caricano in due modi:
-- - a mano: arma e accessori compilati nel modulo, pubblicata subito;
-- - da screenshot: la build resta 'pending' finche la routine notturna
--   (docs/cod-meta-builds-nightly.md) non legge l'immagine e la pubblica con
--   complete_cod_meta_build, oppure la manda in 'needs_review'.
-- Lo screenshot resta come prova e si cancella da solo 7 giorni dopo la
-- pubblicazione, cosi il database non cresce. Idempotente: si puo rieseguire.
create table if not exists public.cod_meta_builds (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  weapon text check (char_length(btrim(weapon)) between 1 and 40),
  category text check (category in ('assault','smg','sniper','marksman','lmg','shotgun','pistol')),
  attachments jsonb not null default '[]' check (jsonb_typeof(attachments) = 'array'),
  loadout jsonb not null default '[]' check (jsonb_typeof(loadout) = 'array'),
  has_screenshot boolean not null default false,
  screenshot_deleted_at timestamptz
);
-- Colonne della lettura automatica, aggiunte anche alle tabelle gia create.
alter table public.cod_meta_builds alter column weapon drop not null;
alter table public.cod_meta_builds alter column category drop not null;
alter table public.cod_meta_builds alter column attachments set default '[]';
alter table public.cod_meta_builds add column if not exists status text not null default 'published';
alter table public.cod_meta_builds add column if not exists weapon_hint text;
alter table public.cod_meta_builds add column if not exists claimed_at timestamptz;
alter table public.cod_meta_builds add column if not exists review_note text;
alter table public.cod_meta_builds add column if not exists processed_at timestamptz;
alter table public.cod_meta_builds drop constraint if exists cod_meta_builds_status_check;
alter table public.cod_meta_builds add constraint cod_meta_builds_status_check
  check (status in ('pending','processing','needs_review','published'));
-- Una build pubblicata ha sempre arma, categoria e almeno un accessorio.
alter table public.cod_meta_builds drop constraint if exists cod_meta_builds_published_complete;
alter table public.cod_meta_builds add constraint cod_meta_builds_published_complete
  check (status <> 'published' or (weapon is not null and category is not null and jsonb_array_length(attachments) > 0));

create table if not exists public.cod_meta_build_images (
  build_id uuid primary key references public.cod_meta_builds(id) on delete cascade,
  image bytea not null check (octet_length(image) between 100 and 1048576)
);
create index if not exists cod_meta_builds_recent on public.cod_meta_builds(created_at desc);
create index if not exists cod_meta_builds_queue on public.cod_meta_builds(status, created_at);
alter table public.cod_meta_builds enable row level security;
alter table public.cod_meta_build_images enable row level security;
revoke all on public.cod_meta_builds, public.cod_meta_build_images from anon, authenticated;
grant select on public.cod_meta_builds to authenticated;
drop policy if exists cod_read_meta_builds on public.cod_meta_builds;
create policy cod_read_meta_builds on public.cod_meta_builds for select to authenticated
  using (exists (select 1 from public.profiles where id = (select auth.uid())));

-- Gli stessi controlli per la build scritta a mano e per quella letta dalla
-- routine: slot ammessi, un accessorio per slot, nomi e perk di lunghezza
-- sensata.
create schema if not exists private;
create or replace function private.check_cod_meta_build(p_weapon text, p_category text, p_attachments jsonb, p_loadout jsonb)
returns void language plpgsql immutable as $$
declare item jsonb;
begin
  if char_length(btrim(coalesce(p_weapon, ''))) not between 1 and 40 then raise exception 'Arma mancante'; end if;
  if p_category is null or p_category not in ('assault','smg','sniper','marksman','lmg','shotgun','pistol') then raise exception 'Categoria non valida'; end if;
  if jsonb_typeof(p_attachments) is distinct from 'array' or jsonb_array_length(p_attachments) not between 1 and 6 then
    raise exception 'Da 1 a 6 accessori';
  end if;
  for item in select * from jsonb_array_elements(p_attachments) loop
    if item->>'slot' is null or item->>'slot' not in ('Volata','Canna','Laser','Ottica','Calcio','Sottocanna','Caricatore','Impugnatura','Munizioni','Poggiaguancia','Otturatore','Guardia','Apex')
      or char_length(btrim(coalesce(item->>'name', ''))) not between 1 and 60 then
      raise exception 'Accessorio non valido';
    end if;
  end loop;
  if (select count(distinct value->>'slot') from jsonb_array_elements(p_attachments)) <> jsonb_array_length(p_attachments) then
    raise exception 'Un solo accessorio per slot';
  end if;
  if jsonb_typeof(coalesce(p_loadout, '[]')) <> 'array' or jsonb_array_length(coalesce(p_loadout, '[]')) > 5 then
    raise exception 'Equipaggiamento non valido';
  end if;
end; $$;

create or replace function private.cod_meta_image(p_image text) returns bytea
language plpgsql immutable as $$
declare payload bytea;
begin
  if p_image is null then return null; end if;
  if length(p_image) > 1400000 then raise exception 'Immagine troppo grande'; end if;
  payload := decode(p_image, 'base64');
  if payload is null or substring(payload from 1 for 3) <> decode('ffd8ff', 'hex') then raise exception 'Serve un JPEG compresso'; end if;
  return payload;
end; $$;

create or replace function private.cod_meta_quota() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not exists (select 1 from profiles where id = auth.uid()) then raise exception 'Accesso richiesto'; end if;
  if (select count(*) from cod_meta_builds where created_by = auth.uid() and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Limite giornaliero raggiunto';
  end if;
end; $$;

-- Build scritta a mano: pubblicata subito.
create or replace function public.create_cod_meta_build(
  p_weapon text, p_category text, p_attachments jsonb, p_loadout jsonb, p_image text
) returns uuid
language plpgsql security definer set search_path = public, private as $$
declare build uuid; payload bytea;
begin
  perform private.cod_meta_quota();
  perform private.check_cod_meta_build(p_weapon, p_category, p_attachments, p_loadout);
  payload := private.cod_meta_image(p_image);
  insert into cod_meta_builds(created_by, weapon, category, attachments, loadout, has_screenshot, status, processed_at)
    values (auth.uid(), btrim(p_weapon), p_category, p_attachments, coalesce(p_loadout, '[]'), payload is not null, 'published', now())
    returning id into build;
  if payload is not null then insert into cod_meta_build_images(build_id, image) values (build, payload); end if;
  return build;
end; $$;

-- Build da screenshot: entra in coda per la routine. Il nome dell'arma e
-- facoltativo e serve solo da suggerimento a chi legge.
create or replace function public.submit_cod_meta_build_photo(p_image text, p_weapon_hint text default null) returns uuid
language plpgsql security definer set search_path = public, private as $$
declare build uuid; payload bytea;
begin
  perform private.cod_meta_quota();
  payload := private.cod_meta_image(p_image);
  if payload is null then raise exception 'Screenshot richiesto'; end if;
  if char_length(coalesce(p_weapon_hint, '')) > 40 then raise exception 'Nome arma troppo lungo'; end if;
  insert into cod_meta_builds(created_by, has_screenshot, status, weapon_hint)
    values (auth.uid(), true, 'pending', nullif(btrim(p_weapon_hint), ''))
    returning id into build;
  insert into cod_meta_build_images(build_id, image) values (build, payload);
  return build;
end; $$;

-- Chi l'ha caricata la rimette in coda dopo una revisione.
create or replace function public.retry_cod_meta_build(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update cod_meta_builds set status = 'pending', review_note = null, claimed_at = null
    where id = p_id and created_by = auth.uid() and status = 'needs_review';
  if not found then raise exception 'Build non ripresentabile'; end if;
end; $$;

-- Solo la routine privilegiata pubblica una build letta, con gli stessi
-- controlli del modulo. Un secondo completamento viene ignorato.
create or replace function public.complete_cod_meta_build(p_id uuid, p_result jsonb) returns void
language plpgsql security definer set search_path = public, private as $$
declare build cod_meta_builds;
begin
  select * into build from cod_meta_builds where id = p_id for update;
  if not found then raise exception 'Build inesistente'; end if;
  if build.status = 'published' then return; end if;
  if build.status <> 'processing' then raise exception 'La build va prima acquisita'; end if;
  perform private.check_cod_meta_build(p_result->>'weapon', p_result->>'category', p_result->'attachments', coalesce(p_result->'loadout', '[]'));
  update cod_meta_builds set status = 'published', weapon = btrim(p_result->>'weapon'), category = p_result->>'category',
    attachments = p_result->'attachments', loadout = coalesce(p_result->'loadout', '[]'),
    processed_at = now(), review_note = null
    where id = p_id;
end; $$;

-- Lo screenshot si scarica solo quando qualcuno lo apre: l'elenco non lo porta.
create or replace function public.cod_meta_build_screenshot(p_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select encode(image, 'base64') from cod_meta_build_images
  where build_id = p_id and exists (select 1 from profiles where id = auth.uid());
$$;

-- La toglie chi l'ha caricata, oppure un admin.
create or replace function public.delete_cod_meta_build(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from cod_meta_builds where id = p_id
    and (created_by = auth.uid() or exists (select 1 from admin_members where profile_id = auth.uid()));
  if not found then raise exception 'Build non eliminabile'; end if;
end; $$;

revoke all on function public.create_cod_meta_build(text, text, jsonb, jsonb, text), public.submit_cod_meta_build_photo(text, text),
  public.retry_cod_meta_build(uuid), public.complete_cod_meta_build(uuid, jsonb),
  public.cod_meta_build_screenshot(uuid), public.delete_cod_meta_build(uuid) from public, anon, authenticated;
revoke all on function private.check_cod_meta_build(text, text, jsonb, jsonb), private.cod_meta_image(text), private.cod_meta_quota() from public, anon, authenticated;
grant execute on function public.create_cod_meta_build(text, text, jsonb, jsonb, text), public.submit_cod_meta_build_photo(text, text),
  public.retry_cod_meta_build(uuid), public.cod_meta_build_screenshot(uuid), public.delete_cod_meta_build(uuid) to authenticated;
grant execute on function public.complete_cod_meta_build(uuid, jsonb) to service_role;

-- Pulizia: lo screenshot di una build pubblicata sparisce dopo 7 giorni.
-- Quelle in coda o da verificare lo tengono, servira a chi le legge.
create or replace function private.purge_cod_meta_screenshots() returns integer
language plpgsql security definer set search_path = public, private as $$
declare cleaned integer;
begin
  with expired as (
    delete from public.cod_meta_build_images photo
    using public.cod_meta_builds build
    where photo.build_id = build.id and build.status = 'published'
      and coalesce(build.processed_at, build.created_at) <= now() - interval '7 days'
    returning build.id
  ), marked as (
    update public.cod_meta_builds build set screenshot_deleted_at = now()
    from expired where build.id = expired.id returning build.id
  ) select count(*) into cleaned from marked;
  return cleaned;
end; $$;
revoke all on function private.purge_cod_meta_screenshots() from public, anon, authenticated;
select cron.unschedule('purge-cod-meta-screenshots') where exists (select 1 from cron.job where jobname = 'purge-cod-meta-screenshots');
select cron.schedule('purge-cod-meta-screenshots', '15 * * * *', 'select private.purge_cod_meta_screenshots();');
notify pgrst, 'reload schema';
