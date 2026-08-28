-- Associa a ogni torneo un'eventuale immagine di trofeo servita dall'app.
-- Il percorso resta relativo a public/ e non accetta risalite di directory.

begin;

alter table public.padel_tournaments
  add column if not exists trophy_image_path text;

alter table public.padel_tournaments
  drop constraint if exists padel_tournaments_trophy_image_path_check;

alter table public.padel_tournaments
  add constraint padel_tournaments_trophy_image_path_check check (
    trophy_image_path is null
    or (
      trophy_image_path like 'trophies/%'
      and trophy_image_path not like '%..%'
      and char_length(trophy_image_path) <= 160
    )
  );

update public.padel_tournaments
set trophy_image_path = 'trophies/coppa-theboyz.png'
where regexp_replace(lower(name), '[^a-z0-9]+', '', 'g') = 'torneotheboyz';

notify pgrst, 'reload schema';

commit;
