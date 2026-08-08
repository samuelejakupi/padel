import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("genera un sito statico pronto per GitHub Pages", async () => {
  await access(new URL("out/index.html", root));
  await access(new URL("out/_next/", root));
  const html = await readFile(new URL("out/index.html", root), "utf8");
  assert.match(html, /TheBoyz/i);
  assert.match(html, /Pizzeria Ranking/i);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("include configurazione Supabase e funzioni della webapp", async () => {
  const [schema, pizzaMigration, drawMigration, page] = await Promise.all([
    readFile(new URL("supabase/schema.sql", root), "utf8"),
    readFile(new URL("supabase/migration-pizza-sessioni.sql", root), "utf8"),
    readFile(new URL("supabase/migration-pareggi.sql", root), "utf8"),
    readFile(new URL("app/page.tsx", root), "utf8"),
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
  assert.match(page, /key: "padel", glyph: "racket", label: "Padel"/);
  // La navigazione interna al Padel non esiste piu: partite e ranking si
  // aprono nel foglio dal basso, quindi la voce nella barra e una sola.
  // Il presidio si sposta sul componente che ha preso quel ruolo.
  assert.match(page, /function BottomSheet/);
  assert.doesNotMatch(page, /function PadelSectionNav/);
  assert.match(pizzaMigration, /pizza_session_participants/);
  assert.match(pizzaMigration, /save_pizza_session_vote/);
  assert.match(pizzaMigration, /completed_at is null/);
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
  assert.match(page, /function setIsComplete/);
  assert.match(page, /function readMatchScore/);
  assert.match(page, /PAREGGIO/);
});
