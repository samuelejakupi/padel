import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("genera un sito statico pronto per GitHub Pages", async () => {
  await access(new URL("out/index.html", root));
  await access(new URL("out/_next/", root));
  const html = await readFile(new URL("out/index.html", root), "utf8");
  assert.match(html, /TheBoyz/i);
  // Next 16 non lo emette piu da solo ed e scritto a mano in layout.tsx: senza,
  // iOS rimpicciolisce la finestra dell'app salvata in home (797 su 844) e la
  // barra del menu non riesce a scendere. Se un aggiornamento lo fa sparire,
  // deve fallire qui e non sul telefono di qualcuno.
  assert.match(html, /<meta name="apple-mobile-web-app-capable" content="yes"/);
  assert.match(html, /Pizzeria Ranking/i);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("include configurazione Supabase e funzioni della webapp", async () => {
  const [schema, pizzaMigration, drawMigration, randomMatchesMigration, singleSetMigration, tournamentFormatMigration, tournamentPrizeMigration, tournamentDifferenceMigration, tournamentDrawMigration, trophyImageMigration, page, css] = await Promise.all([
    readFile(new URL("supabase/schema.sql", root), "utf8"),
    readFile(new URL("supabase/migration-pizza-sessioni.sql", root), "utf8"),
    readFile(new URL("supabase/migration-pareggi.sql", root), "utf8"),
    readFile(new URL("supabase/migration-partite-casuali.sql", root), "utf8"),
    readFile(new URL("supabase/migration-partite-un-set.sql", root), "utf8"),
    readFile(new URL("supabase/migration-tornei-formato.sql", root), "utf8"),
    readFile(new URL("supabase/migration-tornei-premio-elo.sql", root), "utf8"),
    readFile(new URL("supabase/migration-tornei-differenza-game.sql", root), "utf8"),
    readFile(new URL("supabase/migration-tornei-sorteggio.sql", root), "utf8"),
    readFile(new URL("supabase/migration-trofei-immagine.sql", root), "utf8"),
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
  ]);
  assert.match(schema, /record_match/);
  assert.match(schema, /delete_match/);
  assert.match(schema, /theboyz_padel_results/);
  assert.match(schema, /ELO V2/);
  assert.match(schema, /padel_margin_factor/);
  assert.match(schema, /32\.0\s+\* margin_factor/);
  assert.match(schema, /current_player\.rating/);
  assert.match(schema, /team2_rating - team1_rating/);
  assert.match(schema, /expected_score := expected_team1/);
  assert.match(schema, /match_player\.rating_delta/);
  assert.match(schema, /current_streak = 0\s+where true/);
  assert.match(schema, /Registrazione pubblica disabilitata/);
  assert.match(schema, /samu@theboyz\.local/);
  assert.match(schema, /mattia@theboyz\.local/);
  assert.match(schema, /manu@theboyz\.local/);
  assert.match(page, /signInWithPassword/);
  assert.match(page, /"Mattia", "Manu"/);
  // L'eliminazione manuale della partita non esiste piu come azione a se:
  // delete_match resta usata solo dentro la modifica (rimuovi + riregistra),
  // quindi qui controlliamo la chiamata RPC e non il vecchio messaggio.
  assert.match(page, /rpc\("delete_match", \{ p_match_id/);
  assert.match(page, /match_players\(profile_id, team, rating_delta/);
  assert.match(page, /sortPadelProfiles/);
  assert.match(page, /function EloChart/);
  assert.match(page, /ANDAMENTO ELO/);
  assert.match(page, /STORICO PERSONALE/);
  assert.doesNotMatch(page, /FORCED_BADGES/);
  assert.match(page, /const decidedMatches = wins \+ losses/);
  assert.doesNotMatch(page, /draws \* 0\.5/);
  assert.match(page, /0 PARTITE/);
  assert.match(page, /Gioca la prima partita per entrare nella classifica/);
  assert.doesNotMatch(page, /signUp\s*\(/);
  assert.match(page, /avatars/);
  assert.match(page, /Portego[\s\S]*De Mà/i);
  assert.match(page, /Bonus Fabio/);
  assert.match(page, /buildContemporaryPizzaRanking/);
  assert.match(page, /buildClassicPizzaRanking/);
  assert.match(page, /"samu", "dani", "fabio"/);
  assert.match(page, /Contemporanea/);
  assert.match(page, /Nostalgica/);
  assert.match(page, /Personale/);
  // Le quattro sezioni stanno in un elenco solo: se qualcuno ne aggiunge una
  // scrivendola a mano da un'altra parte, qui si accorge che manca.
  assert.match(page, /key: "padel", label: "Padel", glyph: "racket"/);
  assert.match(page, /key: "pizza", label: "Pizza", glyph: "pizza"/);
  assert.match(page, /key: "gaming", label: "Gaming", glyph: "gamepad"/);
  assert.match(page, /key: "cashout", label: "Cashout", glyph: "wallet"/);
  // Dopo il login si entra nello smistamento, non dentro una sezione.
  assert.match(page, /useState<View>\("home"\)/);
  // La barra ha due voci in home e quattro dentro una sezione: le colonne le
  // conta il JSX, e il CSS le legge da li.
  assert.match(page, /"--nav-count": navItems\.length/);
  assert.match(css, /grid-template-columns: repeat\(var\(--nav-count/);
  // La terza voce e sempre la classifica della sezione in cui ti trovi.
  assert.match(page, /label: "Classifica"/);
  assert.match(page, /function SectionPreview/);
  // La navigazione interna al Padel non esiste piu: partite e ranking si
  // aprono nel foglio dal basso, quindi la voce nella barra e una sola.
  // Il presidio si sposta sul componente che ha preso quel ruolo.
  assert.match(page, /function BottomSheet/);
  assert.doesNotMatch(page, /function PadelSectionNav/);
  assert.match(pizzaMigration, /pizza_session_participants/);
  assert.match(pizzaMigration, /save_pizza_session_vote/);
  assert.match(pizzaMigration, /completed_at is null/);
  assert.match(pizzaMigration, /location between 0 and 10/);
  assert.match(pizzaMigration, /result_location \* 7/);
  assert.match(pizzaMigration, /result_price \* 10/);
  assert.match(pizzaMigration, /delete_open_pizza_session/);
  assert.match(page, /VOTO MEDIO ATTUALE/);
  assert.match(page, /0–10 · peso 7\/31/);
  assert.match(trophyImageMigration, /trophies\/coppa-theboyz\.png/);
  assert.match(page, /tournamentVictoryDate/);
  assert.match(page, /trophy_image_path/);
  assert.match(pizzaMigration, /name ilike '%spizza%'/);
  assert.doesNotMatch(page, /remainingLabel|closes_at|due ore per votare/i);
  assert.doesNotMatch(page, /Pizzium/i);

  // Pareggio: un set a testa con il terzo lasciato a meta. Il set interrotto
  // non assegna il set ma i suoi giochi entrano nell'Elo, quindi le due cose
  // che non devono sparire sono il winner_team a zero e padel_draw_tilt.
  assert.match(drawMigration, /winner_team in \(0, 1, 2\)/);
  assert.match(drawMigration, /padel_draw_tilt/);
  assert.match(drawMigration, /ELO V4/);
  assert.match(drawMigration, /add column if not exists incomplete/);
  assert.match(drawMigration, /add column if not exists draws/);
  assert.match(drawMigration, /incomplete or team1_games <> team2_games/);
  // Il tetto dello spostamento: oltre 0.15 il pareggio smetterebbe di essere
  // tale e diventerebbe una mezza vittoria.
  assert.match(drawMigration, /0\.15::numeric/);
  // Nel torneo serve sempre un vincitore: il girone assegna i punti sulle
  // vittorie e un pareggio lo lascerebbe senza.
  assert.match(drawMigration, /non puo finire in pareggio/);
  // I campi della zona: suggerimenti, non una gabbia. Se la casella tornasse
  // libera senza elenco, lo stesso circolo finirebbe scritto in cinque modi.
  assert.match(page, /PADEL_COURTS/);
  assert.match(page, /DON QUIQUE - IMPERIA/);
  assert.match(page, /QUPOLA - PONTEDASSIO/);
  assert.match(page, /function setIsComplete/);
  assert.match(page, /function readMatchScore/);
  assert.match(page, /PAREGGIO/);
  // Una partita secca e valida ma pesa la meta. Il dimezzamento vive nel
  // database e viene eseguito anche durante il ricalcolo cronologico.
  assert.match(page, /sets\.length === 1/);
  assert.match(singleSetMigration, /jsonb_array_length\(p_sets\) not between 1 and 3/);
  assert.match(singleSetMigration, /round\(match_player\.rating_delta \/ 2\.0\)/);
  assert.match(singleSetMigration, /before update of rating_delta/);
  assert.match(singleSetMigration, /recalculate_padel_ratings/);
  assert.match(page, /function emblemMatchWeight/);
  assert.match(page, /match\.sets\.length === 1 \? 0\.5 : 1/);
  assert.match(page, /item\.matchesPlayed \+= matchWeight/);
  assert.match(page, /item\.winsAgainstGoat \+= matchWeight/);
  assert.match(page, /item\.firstPlaceMatches \+= matchWeight/);
  assert.match(page, /pair\.matches \+= matchWeight/);

  // Le partite organizzate non entrano nello storico e nell'Elo finche non
  // viene inserito il risultato. L'estrazione e il completamento restano RPC
  // atomiche, come la registrazione delle partite normali.
  assert.match(randomMatchesMigration, /create_random_match/);
  assert.match(randomMatchesMigration, /order by random\(\)/);
  assert.match(randomMatchesMigration, /complete_random_match/);
  assert.match(randomMatchesMigration, /public\.record_match/);
  assert.match(randomMatchesMigration, /delete from public\.planned_matches/);
  assert.match(page, /Crea squadre casualmente/);
  assert.match(page, /Seleziona esattamente quattro partecipanti/);
  assert.match(page, /Inserisci risultato/);
  // Gli emblemi GOAT devono usare le rispettive immagini della bacheca:
  // in passato venivano intercettati dai vecchi SVG GOAT e Kraken.
  assert.doesNotMatch(page, /"goat-slayer": "kraken"/);
  assert.doesNotMatch(page, /badge\.glyph === "goat"/);
  assert.doesNotMatch(page, /SANGUE FREDDO/);
  assert.doesNotMatch(page, /recordBadge\("clutch"/);
  assert.match(page, /!drawn && setResults\[0\] === false/);
  assert.match(page, /i pareggi sono esclusi/);
  assert.match(page, /I traguardi più vicini/);
  assert.match(page, /sort\(\(a, b\) => b\.progress - a\.progress/);
  assert.match(page, /player-stats-card/);

  // Il torneo si sceglie: set secco o due su tre, sola andata o andata e
  // ritorno. Il best of 5 non c'e apposta — ammetterlo vorrebbe dire allargare
  // il vincolo dei set su tutte le partite del sito.
  assert.match(tournamentFormatMigration, /sets_format in \(1, 3\)/);
  assert.match(tournamentFormatMigration, /legs in \(1, 2\)/);
  assert.match(tournamentFormatMigration, /match_number between 1 and 12/);
  assert.doesNotMatch(tournamentFormatMigration, /sets_format in \(1, 3, 5\)/);
  assert.match(page, /setsFormat/);
  assert.match(page, /Andata e ritorno/);
  // Le stesse due regole delle partite: 24 ore per correggere, e lo puo fare
  // chi ci gioca; eliminare resta di chi ha creato, senza scadenza.
  assert.match(tournamentFormatMigration, /Le modifiche si chiudono 24 ore dopo la creazione del torneo/);
  assert.match(tournamentFormatMigration, /Solo chi ha creato il torneo può eliminarlo/);
  assert.match(page, /function canEditTournament/);
  assert.match(page, /function canDeleteTournament/);
  // Il premio di fine torneo non e un totale che si somma una volta: vive
  // dentro il ricalcolo, all'istante dell'ultima partita del torneo.
  assert.match(tournamentPrizeMigration, /when 1 then 30 when 2 then 15/);
  assert.match(tournamentPrizeMigration, /tournament_closing_match/);
  assert.match(tournamentPrizeMigration, /recalculate_padel_ratings/);
  assert.match(page, /TOURNAMENT_ELO_AWARDS = \[30, 15\]/);
  // Dopo gli scontri diretti conta la differenza fra game fatti e subiti;
  // la stessa espressione deve restare sia nel database sia nell'interfaccia.
  assert.match(tournamentPrizeMigration, /games_won - per_team\.games_lost/);
  assert.match(tournamentDifferenceMigration, /games_won - per_team\.games_lost/);
  assert.match(tournamentDifferenceMigration, /recalculate_padel_ratings/);
  assert.match(page, /gamesWon - b\.gamesLost/);
  assert.match(page, /differenza game/i);
  // Il calendario si sorteggia: ordine degli incontri e lato di ciascuna
  // squadra. Il `materialized` regge tutto — senza, random() viene rivalutata
  // a ogni riferimento e l'ordine non c'entra piu niente con i lati.
  assert.match(tournamentDrawMigration, /with sorteggio as materialized/);
  assert.match(tournamentDrawMigration, /order by ordine/);
  assert.match(tournamentDrawMigration, /if p_first_leg = 2 then/);

  // Una squadra si forma, non si scopre: nella scheda ci sono solo le coppie
  // con una riga in padel_teams, e in classifica ci entrano dopo la prima
  // partita insieme. Il nome da solo non basta piu.
  assert.match(page, /function TeamCreateModal/);
  assert.match(page, /team\.isSaved && team\.players\.some/);
  assert.match(page, /isRanked: team\.isRanked && team\.matches_played > 0/);
  assert.match(page, /function teamRating/);
  assert.match(page, /profile\.matches_played > 0/);
});
