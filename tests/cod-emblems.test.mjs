import assert from 'node:assert/strict';
import test from 'node:test';
import { codEmblems, codEmblemDefinitions } from '../lib/cod-emblems.ts';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
const p = (profile_id, kills, deaths, score) => ({ profile_id, kills, deaths, score });
const gb = (players, mode='hardpoint', status='processed') => ({ players, mode, status });
const badge = (data, id) => codEmblems(data).find(b => b.id === id);

test('sette emblemi senza assegnazioni in assenza di risultati', () => {
  assert.equal(codEmblems([]).length, 7);
  assert.ok(codEmblems([]).every(b => b.holders.length === 0));
});
test('ogni emblema ha un asset WebP locale trasparente pronto per il sito', async () => {
  for (const definition of codEmblemDefinitions) {
    const path = new URL(`../public/emblems/mw4/${definition.id}.webp`, import.meta.url);
    const metadata = await sharp(fileURLToPath(path)).metadata();
    assert.equal(metadata.hasAlpha, true, definition.id);
    assert.equal(metadata.format, 'webp', definition.id);
    assert.ok(metadata.width <= 512 && metadata.height <= 512, definition.id);
  }
});
test('K/D aggregato su tutte le mappe e punti medi per partita, non punti totali', () => {
  const data = [gb([p('a',20,10,100),p('b',10,2,200)]),gb([p('a',1,10,500)])];
  assert.deepEqual(badge(data,'kd-king').holders,['b']);
  assert.deepEqual(badge(data,'kd-last').holders,['a']);
  assert.deepEqual(badge(data,'goat').holders,['a']);
  assert.equal(badge(data,'goat').value,300);
  assert.deepEqual(badge(data,'score-last').holders,['b']);
});
test('leader punti distinti per le tre modalità', () => {
  const data = [gb([p('a',2,1,300),p('b',2,1,100)]),gb([p('a',2,1,50),p('b',2,1,100)],'search_destroy'),gb([p('a',2,1,150),p('b',2,1,20)],'overload')];
  assert.deepEqual(badge(data,'hardpoint').holders,['a']);
  assert.deepEqual(badge(data,'search-destroy').holders,['b']);
  assert.deepEqual(badge(data,'overload').holders,['a']);
});
test('pari merito condivisi, nessun premio negativo con risultati identici o un solo giocatore', () => {
  const data = [gb([p('a',20,10,200),p('b',10,5,200)])];
  assert.deepEqual(badge(data,'kd-king').holders,['a','b']);
  assert.deepEqual(badge(data,'goat').holders,['a','b']);
  assert.equal(badge(data,'kd-last').holders.length,0);
  assert.equal(badge(data,'score-last').holders.length,0);
  assert.equal(badge([gb([p('a',1,10,10)])],'kd-last').holders.length,0);
});
test('nessun punteggio inventato: esclude serie incomplete, avversari e GB in attesa', () => {
  const data = [gb([p('a',2,1,100),p('b',1,1,50),p(null,999,1,99999)]),gb([p('a',1,1,null)]),gb([p('c',999,1,99999)],'hardpoint','pending')];
  assert.deepEqual(badge(data,'goat').holders,['b']);
  assert.equal(badge(data,'goat').value,50);
});
test('K/D infinito senza morti e 0/0 senza assegnazioni spurie', () => {
  const data = [gb([p('a',2,0,20),p('b',0,0,0),p('c',1,2,10)])];
  assert.deepEqual(badge(data,'kd-king').holders,['a']);
  assert.equal(badge(data,'kd-king').value,Infinity);
  assert.deepEqual(badge(data,'kd-last').holders,['c']);
});
