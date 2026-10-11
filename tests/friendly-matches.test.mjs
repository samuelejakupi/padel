import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("page.tsx", page, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = ast.statements.filter(ts.isFunctionDeclaration).map(node => node.getText(ast)).join("\n");
const code = ts.transpileModule(declarations, { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS } }).outputText;
const context = { exports: {} };
vm.createContext(context);
vm.runInContext(code, context);
const profiles = [1,2,3,4].map(id => ({ id: String(id), display_name: `Giocatore ${id}`, rating: 1000, matches_played: 0 }));
const match = (id, winner_team = 1, is_friendly = false) => ({
  id, played_at: `2026-10-${id.padStart(2,"0")}T20:00:00Z`, winner_team, is_friendly,
  sets: [1,2].map(set_number => ({ set_number, team1_games: winner_team === 1 ? 6 : 2, team2_games: winner_team === 1 ? 2 : 6 })),
  players: profiles.map((profile, index) => ({ profile_id: profile.id, profile, team: index < 2 ? 1 : 2, rating_delta: 0 })),
  mvps: [{ profile_id: "1" }],
});

test("le amichevoli non allungano né interrompono le serie degli emblemi", () => {
  const competitive = [match("1"), match("3")];
  const all = [competitive[0], match("2", 2, true), competitive[1]];
  assert.equal(JSON.stringify([...context.buildBadgeMetrics(profiles, competitive).metrics]), JSON.stringify([...context.buildBadgeMetrics(profiles, all).metrics]));
});

test("solo amichevoli: nessun progresso, MVP o squadra classificata", () => {
  const friendly = match("1", 1, true);
  for (const metric of context.buildBadgeMetrics(profiles, [friendly]).metrics.values()) {
    assert.equal(metric.matchesPlayed, 0);
    assert.equal(metric.weightedMatchesPlayed, 0);
    assert.equal(metric.mvpWins, 0);
    assert.equal(metric.bestWinStreak, 0);
    assert.equal(metric.firstPlaceMatches, 0);
  }
  assert.equal(context.buildPadelTeams([friendly], profiles).length, 0);
  assert.equal(context.chronologicalMatches([friendly]).length, 0);
  assert.equal(context.emblemMatchWeight(friendly), 0);
});

test("ranking squadre identico aggiungendo un'amichevole", () => {
  const competitive = match("1");
  const friendly = match("2", 2, true);
  assert.equal(JSON.stringify(context.buildPadelTeams([competitive], profiles)), JSON.stringify(context.buildPadelTeams([competitive, friendly], profiles)));
});

test("set secco e best of tre valgono entrambi uno negli emblemi", () => {
  const standard = match("1");
  const single = { ...match("2"), sets: [match("2").sets[0]] };
  assert.equal(context.emblemMatchWeight(standard), 1);
  assert.equal(context.emblemMatchWeight(single), 1);
  const metric = context.buildBadgeMetrics(profiles, [standard, single]).metrics.get("1");
  assert.equal(metric.matchesPlayed, 2);
  assert.equal(metric.weightedMatchesPlayed, 1.5);
  assert.equal(metric.firstPlaceMatches, 1.5);
  assert.equal(metric.bestWinStreak, 2);
  assert.equal(metric.mvpWins, 2);
  assert.equal(metric.bestPairMatches, 2);
  assert.equal(metric.bestSetWinStreak, 3);
});

test("una sconfitta al set secco interrompe la streak e conta una partita", () => {
  const loss = { ...match("3", 2), sets: [match("3", 2).sets[0]] };
  const metric = context.buildBadgeMetrics(profiles, [match("1"), match("2"), loss, match("4")]).metrics.get("1");
  assert.equal(metric.matchesPlayed, 4);
  assert.equal(metric.bestWinStreak, 2);
  assert.equal(metric.bestLoseStreak, 1);
});

test("salvataggio normale e squadre casuali usano RPC dedicate per le amichevoli", () => {
  assert.ok(page.includes('friendly ? "record_friendly_match" : "record_match"'));
  assert.ok(page.includes('friendly ? "complete_random_friendly_match" : "complete_random_match"'));
  assert.ok(page.includes('!tournamentContext && !match?.tournament_fixture_id && !randomTeams'));
});
