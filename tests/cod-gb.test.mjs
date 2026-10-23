import assert from 'node:assert/strict';
import test from 'node:test';
import { codRanking } from '../lib/cod-gb.ts';

const player = (id, extra = {}) => ({ profile_id: id, nickname: id, team: 1, kills: 10, deaths: 5, damage: null, hill_seconds: null, objective_kills: null, plants: null, defuses: null, first_bloods: null, overloads: null, carries: null, ...extra });
const gb = (extra = {}) => ({ id: 'gb', mode: 'hardpoint', status: 'processed', team1_score: 250, team2_score: 200, players: [player('a')], ...extra });

test('classifica separata per modalità, senza avversari e GB in attesa', () => {
  const rows = codRanking([gb(), gb({ mode: 'overload' }), gb({ status: 'needs_review' }), gb({ players: [player(null)] })], 'hardpoint');
  assert.equal(rows.length, 1); assert.equal(rows[0].games, 1); assert.equal(rows[0].wins, 1);
});
test('K/D usa uccisioni e morti totali e le vittorie seguono la squadra', () => {
  const rows = codRanking([gb({ players: [player('a', { kills: 20, deaths: 10 }), player('b', { team: 2 })] }), gb({ players: [player('a', { kills: 0, deaths: 1 })] })], 'hardpoint');
  assert.equal(rows[0].profileId, 'a'); assert.equal(rows[0].kills, 20); assert.equal(rows[0].deaths, 11); assert.equal(rows[0].wins, 2); assert.equal(rows[1].wins, 0);
});
test('una statistica mancante non viene inventata o presentata come totale completo', () => {
  const rows = codRanking([gb({ players: [player('a', { damage: 500, hill_seconds: 50 })] }), gb({ players: [player('a', { hill_seconds: 25 })] }), gb({ players: [player('a', { damage: 200, hill_seconds: 0 })] })], 'hardpoint');
  assert.equal(rows[0].damage, null); assert.equal(rows[0].hill_seconds, 75);
});
