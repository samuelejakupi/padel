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

test("include configurazione Supabase e pubblicazione Pages", async () => {
  const [schema, workflow, page] = await Promise.all([
    readFile(new URL("supabase/schema.sql", root), "utf8"),
    readFile(new URL(".github/workflows/deploy-pages.yml", root), "utf8"),
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
  assert.match(workflow, /deploy-pages/);
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
  assert.match(page, /0 PARTITE/);
  assert.match(page, /Gioca la prima partita per entrare nella classifica/);
  assert.doesNotMatch(page, /signUp\s*\(/);
  assert.match(page, /avatars/);
  assert.match(page, /PORTEGO[\s\S]*DE MÀ/);
  assert.match(page, /Bonus Fabio/);
  assert.doesNotMatch(page, /Pizzium/i);
});
