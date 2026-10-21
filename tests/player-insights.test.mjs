import assert from "node:assert/strict";
import test from "node:test";
import { pairRecord, partnerInsights, recordWinRate } from "../lib/player-insights.ts";

const profiles = ["a", "b", "c", "d"].map((id) => ({ id, display_name: id }));
function match(id, winner = 1, options = {}) {
  return { id, played_at: `2026-10-${String(Number(id) + 1).padStart(2, "0")}T18:00:00Z`,
    winner_team: winner, players: profiles.map((profile, i) => ({ profile_id: profile.id, team: i < 2 ? 1 : 2 })),
    sets: [{ set_number: 1, team1_games: 6, team2_games: 3 }], ...options };
}

test("distingue avversari e compagni e legge i risultati dalla prospettiva scelta", () => {
  const matches = [match("1"), match("2", 2), match("3", 0)];
  const together = pairRecord(matches, "a", "b", true);
  assert.deepEqual([together.wins, together.losses, together.draws], [1, 1, 1]);
  assert.equal(recordWinRate(together), 50);
  assert.equal(pairRecord(matches, "a", "b", false).matches.length, 0);
  assert.equal(pairRecord(matches, "a", "c", false).matches.length, 3);
  const reverse = pairRecord([matches[0]], "c", "a", false);
  assert.deepEqual([reverse.wins, reverse.losses, reverse.gamesWon, reverse.gamesLost], [0, 1, 3, 6]);
});

test("i game interrotti contano senza assegnare un set vinto", () => {
  const row = pairRecord([match("1", 0, { sets: [
    { set_number: 1, team1_games: 6, team2_games: 3 },
    { set_number: 2, team1_games: 2, team2_games: 6 },
    { set_number: 3, team1_games: 4, team2_games: 1, incomplete: true },
  ] })], "a", "b", true);
  assert.deepEqual([row.setsWon, row.setsLost, row.gamesWon, row.gamesLost], [1, 1, 12, 10]);
  assert.equal(recordWinRate(row), null);
});

test("esclude il set storico successivo al 2-0 anche se i set arrivano disordinati", () => {
  const sets = [
    { set_number: 3, team1_games: 0, team2_games: 6 },
    { set_number: 1, team1_games: 6, team2_games: 1 },
    { set_number: 2, team1_games: 6, team2_games: 2 },
  ];
  const row = pairRecord([match("1", 1, { sets })], "a", "b", true);
  assert.deepEqual([row.setsWon, row.setsLost, row.gamesWon, row.gamesLost], [2, 0, 12, 3]);
  assert.equal(sets[0].set_number, 3);
});

test("un campione collaudato precede due vittorie su due e gli assenti non entrano", () => {
  const established = Array.from({ length: 5 }, (_, i) => match(String(i), i < 3 ? 1 : 2));
  const newPair = [match("6"), match("7")].map((m) => ({ ...m, players: [
    { profile_id: "a", team: 1 }, { profile_id: "c", team: 1 },
    { profile_id: "b", team: 2 }, { profile_id: "d", team: 2 },
  ] }));
  const rows = partnerInsights([...profiles, { id: "absent", display_name: "Assente" }], [...established, ...newPair], "a");
  assert.deepEqual(rows.map((row) => row.profile.id), ["b", "c"]);
  assert.equal(rows[0].record.wins, 3);
});

test("confronti vuoti e lo stesso giocatore non producono percentuali inventate", () => {
  assert.equal(recordWinRate(pairRecord([], "a", "b", true)), null);
  assert.equal(pairRecord([match("1")], "a", "a", true).matches.length, 0);
  assert.equal(pairRecord([match("1")], "missing", "a", false).matches.length, 0);
});

test("ordina lo storico senza mutare le partite e considera le amichevoli solo se passate", () => {
  const matches = [match("1"), match("2", 2, { is_friendly: true })];
  const ranked = pairRecord(matches.filter((m) => !m.is_friendly), "a", "b", true);
  assert.equal(ranked.wins, 1);
  assert.equal(ranked.losses, 0);
  assert.deepEqual(pairRecord(matches, "a", "b", true).matches.map((m) => m.id), ["2", "1"]);
  assert.equal(matches[0].id, "1");
});
