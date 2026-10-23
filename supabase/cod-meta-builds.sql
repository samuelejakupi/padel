-- Build MW4 caricate dai membri, mostrate nella pagina Meta accanto a quelle
-- scritte nel codice. Nessuna immagine dell'arma: la pagina disegna la sagoma
-- della categoria. Lo screenshot del gioco resta solo come prova e si
-- cancella da solo dopo 7 giorni, cosi il database non cresce.
-- Idempotente: si puo rieseguire.
create table if not exists public.cod_meta_builds (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  weapon text not null check (char_length(btrim(weapon)) between 1 and 40),
  category text not null check (category in ('assault','smg','sniper','marksman','lmg','shotgun','pistol')),
  attachments jsonb not null check (jsonb_typeof(attachments) = 'array'),
  loadout jsonb not null default '[]' check (jsonb_typeof(loadout) = 'array'),
  has_screenshot boolean not null default false,
  screenshot_deleted_at timestamptz
);
create table if not exists public.cod_meta_build_images (
  build_id uuid primary key references public.cod_meta_builds(id) on delete cascade,
  image bytea not null check (octet_length(image) between 100 and 1048576)
);
create index if not exists cod_meta_builds_recent on public.cod_meta_builds(created_at desc);
alter table public.cod_meta_builds enable row level security;
alter table public.cod_meta_build_images enable row level security;
revoke all on public.cod_meta_builds, public.cod_meta_build_images from anon, authenticated;
grant select on public.cod_meta_builds to authenticated;
drop policy if exists cod_read_meta_builds on public.cod_meta_builds;
create policy cod_read_meta_builds on public.cod_meta_builds for select to authenticated
  using (exists (select 1 from public.profiles where id = (select auth.uid())));

create or replace function public.create_cod_meta_build(
  p_weapon text, p_category text, p_attachments jsonb, p_loadout jsonb, p_image text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare build uuid; item jsonb; payload bytea;
begin
  if auth.uid() is null or not exists (select 1 from profiles where id = auth.uid()) then raise exception 'Accesso richiesto'; end if;
  if (select count(*) from cod_meta_builds where created_by = auth.uid() and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Limite giornaliero raggiunto';
  end if;
  if jsonb_typeof(p_attachments) <> 'array' or jsonb_array_length(p_attachments) not between 1 and 6 then
    raise exception 'Da 1 a 6 accessori';
  end if;
  for item in select * from jsonb_array_elements(p_attachments) loop
    if item->>'slot' not in ('Volata','Canna','Laser','Ottica','Calcio','Sottocanna','Caricatore','Impugnatura','Munizioni','Poggiaguancia','Otturatore','Guardia','Apex')
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
  if p_image is not null then
    if length(p_image) > 1400000 then raise exception 'Immagine troppo grande'; end if;
    payload := decode(p_image, 'base64');
    if payload is null or substring(payload from 1 for 3) <> decode('ffd8ff', 'hex') then raise exception 'Serve un JPEG compresso'; end if;
  end if;
  insert into cod_meta_builds(created_by, weapon, category, attachments, loadout, has_screenshot)
    values (auth.uid(), btrim(p_weapon), p_category, p_attachments, coalesce(p_loadout, '[]'), payload is not null)
    returning id into build;
  if payload is not null then insert into cod_meta_build_images(build_id, image) values (build, payload); end if;
  return build;
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

revoke all on function public.create_cod_meta_build(text, text, jsonb, jsonb, text) from public, anon;
revoke all on function public.cod_meta_build_screenshot(uuid) from public, anon;
revoke all on function public.delete_cod_meta_build(uuid) from public, anon;
grant execute on function public.create_cod_meta_build(text, text, jsonb, jsonb, text) to authenticated;
grant execute on function public.cod_meta_build_screenshot(uuid) to authenticated;
grant execute on function public.delete_cod_meta_build(uuid) to authenticated;

create schema if not exists private;
create or replace function private.purge_cod_meta_screenshots() returns integer
language plpgsql security definer set search_path = public, private as $$
declare cleaned integer;
begin
  with expired as (
    delete from public.cod_meta_build_images photo
    using public.cod_meta_builds build
    where photo.build_id = build.id and build.created_at <= now() - interval '7 days'
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
