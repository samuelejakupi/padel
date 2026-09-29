import assert from "node:assert/strict";
import test from "node:test";
import { drawTournamentTeams } from "../lib/tournament-draw.ts";

for (const count of [6, 8]) {
  test(`il sorteggio distribuisce ${count} partecipanti in coppie uniche`, () => {
    const participants = Array.from({ length: count }, (_, index) => `player-${index}`);
    const original = [...participants];
    const teams = drawTournamentTeams(participants, () => 0);

    assert.equal(teams.length, count / 2);
    assert.deepEqual(new Set(teams.flatMap((team) => [team.playerA, team.playerB])), new Set(participants));
    assert.deepEqual(participants, original);
    assert.notDeepEqual(teams.flatMap((team) => [team.playerA, team.playerB]), original);
  });
}

test("il sorteggio rifiuta numeri non validi e partecipanti duplicati", () => {
  assert.throws(() => drawTournamentTeams(["a", "b", "c", "d", "e"]), /6 o 8/);
  assert.throws(() => drawTournamentTeams(["a", "b", "c", "d", "e", "e"]), /diversi/);
});

test("un secondo sorteggio può produrre coppie diverse", () => {
  const participants = ["a", "b", "c", "d", "e", "f"];
  const first = drawTournamentTeams(participants, () => 0);
  const second = drawTournamentTeams(participants, () => 0.99);
  assert.notDeepEqual(first, second);
});
