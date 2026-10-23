-- Conserva gli scoreboard per almeno 24 ore dal completamento riuscito.
-- Il digest resta per bloccare nuovi caricamenti della stessa foto.
alter table public.cod_gb_images alter column image drop not null;
alter table public.cod_gbs add column if not exists photos_deleted_at timestamptz;

create schema if not exists private;
create or replace function private.purge_cod_gb_photos() returns integer
language plpgsql security definer set search_path=public,private as $$
declare cleaned integer;
begin
  with expired as (
    select id from public.cod_gbs
    where status='processed' and image_count>0 and photos_deleted_at is null
      and processed_at <= now()-interval '24 hours'
    for update
  ), cleared as (
    update public.cod_gb_images photo set image=null
    from expired where photo.gb_id=expired.id and photo.image is not null
    returning photo.gb_id
  ), marked as (
    update public.cod_gbs gb set photos_deleted_at=now()
    from expired where gb.id=expired.id returning gb.id
  ) select count(*) into cleaned from marked;
  return cleaned;
end; $$;
revoke all on function private.purge_cod_gb_photos() from public,anon,authenticated;

-- Il database pulisce anche quando il computer con Codex è spento.
select cron.schedule('purge-cod-gb-photos','0 * * * *','select private.purge_cod_gb_photos();');
notify pgrst,'reload schema';
