import assert from "node:assert/strict";
import test from "node:test";
import { filterMatchPeriod, filterMatchResults } from "../lib/padel-presentation.ts";

const matches = [
  { id: "win", played_at: "2026-10-17T18:00:00Z", winner_team: 2, players: [{ profile_id: "me", team: 2 }] },
  { id: "loss", played_at: "2026-08-16T18:00:00Z", winner_team: 1, players: [{ profile_id: "me", team: 2 }] },
  { id: "draw", played_at: "2026-10-09T18:00:00Z", winner_team: 0, players: [{ profile_id: "me", team: 1 }] },
  { id: "others", played_at: "2026-10-17T18:00:00Z", winner_team: 1, players: [{ profile_id: "other", team: 1 }] },
];

test("gli esiti personali escludono chi non ha partecipato e rispettano la squadra", () => {
  for (const [filter, id] of [["wins", "win"], ["losses", "loss"], ["draws", "draw"]]) {
    assert.deepEqual(filterMatchResults(matches, filter, "me").map((match) => match.id), [id]);
  }
  assert.equal(filterMatchResults(matches, "all", "me").length, 4);
  assert.equal(filterMatchResults(matches, "wins").length, 0);
});

test("il periodo filtra le partite prima del conteggio degli esiti e non include date future", () => {
  const now = new Date("2026-10-21T12:00:00Z");
  const future = { ...matches[0], id: "future", played_at: "2026-10-22T18:00:00Z" };
  assert.deepEqual(filterMatchPeriod([...matches, future], "30", now).map((match) => match.id), ["win", "draw", "others"]);
  assert.equal(filterMatchPeriod(matches, "90", now).length, 4);
  assert.equal(filterMatchResults(filterMatchPeriod(matches, "30", now), "losses", "me").length, 0);
  assert.equal(filterMatchPeriod(matches, "all", now), matches);
});
