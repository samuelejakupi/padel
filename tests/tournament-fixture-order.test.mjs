import assert from "node:assert/strict";
import test from "node:test";
import { canRecordTournamentFixture } from "../lib/tournament-fixture-order.ts";

const fixtures = [1,2,3,4,5].map(match_number=>({match_number,match_id:null}));
test("girone individuale completo: tutti i risultati sono inseribili subito", () => {
  const tournament={mode:"individual",individual_schedule:"complete",fixtures};
  assert.ok(fixtures.every(f=>canRecordTournamentFixture(tournament,f)));
});
test("coppie fisse: risultati inseribili in qualsiasi ordine", () => {
  const tournament={mode:"teams",fixtures};
  assert.ok(fixtures.every(f=>canRecordTournamentFixture(tournament,f)));
});
test("individuale adattivo: resta la sequenza anche con array non ordinato", () => {
  const tournament={mode:"individual",individual_schedule:"adaptive",fixtures:[...fixtures].reverse()};
  assert.equal(canRecordTournamentFixture(tournament,fixtures[0]),true);
  assert.equal(canRecordTournamentFixture(tournament,fixtures[4]),false);
});
test("un risultato già registrato non può essere reinserito", () => {
  const played={...fixtures[4],match_id:"saved"};
  assert.equal(canRecordTournamentFixture({mode:"individual",individual_schedule:"complete",fixtures},played),false);
});
