-- Pulizia dei dati di prova · 8 agosto 2026
--
-- Durante lo sviluppo abbiamo registrato partite e tornei finti per vedere
-- come venivano le schermate. Le partite vere sono le prime due che sono
-- state registrate sull'app: questo script tiene quelle e porta via tutto il
-- resto, poi rifà i conti dell'Elo da zero.
--
-- NON è una migrazione e NON è idempotente nel senso delle altre: rilanciarlo
-- una seconda volta non fa danni (dopo la prima esecuzione non resta niente
-- da cancellare), ma è comunque uno script da eseguire una volta sola, a
-- mano, nel SQL Editor di Supabase.
--
-- Le partite normalmente non si cancellano — si correggono, ed è la regola
-- scritta in LAVORI.md. Questa è l'eccezione che conferma il motivo della
-- regola: qui non stiamo riscrivendo la storia, stiamo togliendo roba che
-- nella storia non c'è mai entrata.

-- ---------------------------------------------------------------------------
-- 1. PRIMA GUARDA, POI CANCELLA
-- ---------------------------------------------------------------------------
-- Esegui da solo questo blocco e controlla che le due partite elencate come
-- "resta" siano davvero quelle vere. Se non lo sono, fermati qui e cambia il
-- criterio più sotto invece di tirare a indovinare.
--
-- L'ordine è quello di registrazione (created_at), non quello di gioco: "le
-- prime due che abbiamo messo sull'app" è una frase sulla registrazione.

with ordinate as (
  select
    m.id,
    m.played_at,
    m.created_at,
    row_number() over (order by m.created_at, m.played_at, m.id) as n
  from public.matches m
)
select
  case when n <= 2 then 'resta' else 'da cancellare' end as esito,
  n as ordine_di_registrazione,
  to_char(o.played_at, 'DD/MM/YYYY') as giocata_il,
  to_char(o.created_at, 'DD/MM/YYYY HH24:MI') as registrata_il,
  string_agg(p.display_name || ' (sq. ' || mp.team || ')', ', ' order by mp.team, p.display_name) as giocatori
from ordinate o
join public.match_players mp on mp.match_id = o.id
join public.profiles p on p.id = mp.profile_id
group by o.id, o.n, o.played_at, o.created_at
order by o.n;

-- ---------------------------------------------------------------------------
-- 2. LA PULIZIA VERA
-- ---------------------------------------------------------------------------
-- Tutto dentro a una transazione: o va via tutto quello che deve andare via,
-- o non va via niente. A metà strada il database resterebbe con dei tornei
-- senza le loro partite.

begin;

-- 2a. I tornei. Squadre e calendario se ne vanno in cascata; le partite che
--     il calendario indicava restano dove sono, perché il collegamento è
--     "on delete set null" dalla parte del calendario e non tocca la partita.
--     Quelle finte le porta via il passo dopo, insieme a tutte le altre.
delete from public.padel_tournaments;

-- 2b. Le partite di prova: tutte tranne le prime due registrate.
--     match_players e match_sets se ne vanno in cascata (lo dice lo schema);
--     match_events no, non ha una chiave esterna, e lo puliamo a mano dopo.
with ordinate as (
  select
    id,
    row_number() over (order by created_at, played_at, id) as n
  from public.matches
)
delete from public.matches
where id in (select id from ordinate where n > 2);

-- 2c. Lo storico delle partite che non esistono più. Il campo lineage_id
--     tiene insieme una partita e le sue correzioni: se di quella stirpe non
--     è rimasta nessuna partita, lo storico non racconta più niente.
delete from public.match_events e
where not exists (
  select 1 from public.matches m
  where m.lineage_id = e.lineage_id or m.id = e.match_id
);

-- 2d. Le stagioni archiviate. Sono una fotografia della classifica a fine
--     anno, e la classifica che fotografavano era fatta di partite finte.
--     Se la tabella non esiste ancora (migrazione stagioni non eseguita) la
--     riga non fa errore: il "if exists" è sul nome della tabella.
delete from public.padel_season_standings;

-- 2e. Le coppie senza nome nate solo dalle partite finte. Quelle a cui
--     qualcuno ha dato un nome restano: il nome è un dato inserito a mano,
--     non un sottoprodotto delle partite.
delete from public.padel_teams t
where t.name is null
  and not exists (
    select 1
    from public.matches m
    join public.match_players a on a.match_id = m.id and a.profile_id = t.player_a
    join public.match_players b on b.match_id = m.id and b.profile_id = t.player_b and b.team = a.team
  );

commit;

-- ---------------------------------------------------------------------------
-- 3. I CONTI RIFATTI DA ZERO
-- ---------------------------------------------------------------------------
-- L'Elo non è un totale che si somma e si sottrae: si ricalcola rigiocando
-- tutte le partite in ordine, partendo dai 1000 punti di tutti. Tolte le
-- partite finte, questo rimette la classifica esattamente com'era dopo le due
-- vere. Vale anche per vittorie, sconfitte, serie e classifica delle coppie.
select public.recalculate_padel_ratings();

-- ---------------------------------------------------------------------------
-- 4. COM'È RIMASTA
-- ---------------------------------------------------------------------------
select
  p.display_name,
  p.rating,
  p.matches_played,
  p.wins,
  p.losses,
  p.current_streak
from public.profiles p
order by p.rating desc, p.display_name;

select count(*) as partite_rimaste from public.matches;
select count(*) as tornei_rimasti from public.padel_tournaments;
