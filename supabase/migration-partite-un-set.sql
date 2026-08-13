-- TheBoyz · migrazione: partite secche da un set con Elo dimezzato
--
-- La funzione storica resta responsabile della validazione e del calcolo Elo.
-- La rinominiamo e le mettiamo davanti un adattatore: per una partita da un
-- set le passa temporaneamente due copie dello stesso set, lascia che venga
-- registrato un vincitore regolare, poi conserva solo il set realmente giocato.
--
-- Il trigger dimezza ogni delta individuale quando la partita ha un solo set.
-- Agisce anche durante recalculate_padel_ratings(), quindi correzioni,
-- eliminazioni, partite casuali e moltiplicatori dei tornei restano coerenti.

do $$
begin
  if to_regprocedure(
    'public.record_match_standard(timestamptz,uuid[],uuid[],jsonb,text,text)'
  ) is null then
    alter function public.record_match(timestamptz, uuid[], uuid[], jsonb, text, text)
      rename to record_match_standard;
  end if;
end;
$$;

revoke all on function public.record_match_standard(timestamptz, uuid[], uuid[], jsonb, text, text)
  from public, anon, authenticated;

create or replace function public.halve_single_set_match_elo()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (
    select count(*)
    from public.match_sets
    where match_id = new.id
  ) <> 1 then
    return new;
  end if;

  -- Il profilo contiene gia il delta intero calcolato da record_match o dal
  -- ricalcolo. Applichiamo soltanto la differenza fra quel valore e la sua
  -- meta; anche il limite minimo di 100 Elo resta cosi rispettato.
  update public.profiles as profile
  set rating = profile.rating
    + round(match_player.rating_delta / 2.0)::integer
    - match_player.rating_delta
  from public.match_players as match_player
  where match_player.match_id = new.id
    and profile.id = match_player.profile_id;

  update public.match_players
  set
    rating_delta = round(rating_delta / 2.0)::integer,
    rating_after = rating_before + round(rating_delta / 2.0)::integer
  where match_id = new.id;

  select coalesce(round(avg(abs(rating_delta)))::integer, 0)
  into new.rating_delta
  from public.match_players
  where match_id = new.id;

  return new;
end;
$$;

revoke all on function public.halve_single_set_match_elo() from public, anon, authenticated;

drop trigger if exists halve_single_set_match_elo on public.matches;
create trigger halve_single_set_match_elo
before update of rating_delta on public.matches
for each row
execute function public.halve_single_set_match_elo();

create or replace function public.record_match(
  p_played_at timestamptz,
  p_team1 uuid[],
  p_team2 uuid[],
  p_sets jsonb,
  p_notes text default null,
  p_video_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_match_id uuid;
  only_set jsonb;
begin
  if jsonb_typeof(p_sets) <> 'array' or jsonb_array_length(p_sets) not between 1 and 3 then
    raise exception 'Inserisci da uno a tre set';
  end if;

  if jsonb_array_length(p_sets) <> 1 then
    return public.record_match_standard(
      p_played_at, p_team1, p_team2, p_sets, p_notes, p_video_url
    );
  end if;

  only_set := p_sets -> 0;
  if coalesce((only_set ->> 'incomplete')::boolean, false)
    or (only_set ->> 'team1_games') is null
    or (only_set ->> 'team2_games') is null
    or (only_set ->> 'team1_games')::integer = (only_set ->> 'team2_games')::integer then
    raise exception 'La partita da un set deve avere un set completo e un vincitore';
  end if;

  -- Due copie permettono alla funzione standard di riconoscere un 2-0. La
  -- seconda viene rimossa nella stessa transazione, prima del ricalcolo.
  new_match_id := public.record_match_standard(
    p_played_at,
    p_team1,
    p_team2,
    p_sets || p_sets,
    p_notes,
    p_video_url
  );

  delete from public.match_sets
  where match_id = new_match_id and set_number = 2;

  perform public.recalculate_padel_ratings();
  return new_match_id;
end;
$$;

revoke all on function public.record_match(timestamptz, uuid[], uuid[], jsonb, text, text)
  from public, anon;
grant execute on function public.record_match(timestamptz, uuid[], uuid[], jsonb, text, text)
  to authenticated;

-- Nessun ricalcolo all'installazione: fino a questa versione il modulo non
-- permetteva di salvare partite da un solo set, quindi lo storico non contiene
-- righe da riallineare. La regola entra in vigore dalla prossima partita.
