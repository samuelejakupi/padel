import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire, Module } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as cod from '../lib/cod-gb.ts';
import * as emblems from '../lib/cod-emblems.ts';

// Renderizza il componente reale con il solo accesso dati sostituito.
const require = createRequire(import.meta.url);
let snapshot = { gbs: [], loading: false, error: '', load: async () => {} };
const filename = fileURLToPath(new URL('../app/CodProfile.tsx', import.meta.url));
const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const profileModule = new Module(filename);
profileModule.filename = filename;
const stubs = {
  '@/lib/cod-gb': cod,
  '@/lib/cod-emblems': emblems,
  './useCodGbs': { __esModule: true, default: () => snapshot },
  './CodGaming': { CodNickname: () => React.createElement('details', null, 'Il mio nick Call of Duty') },
  './CodProfile.module.css': { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) },
};
profileModule.require = (name) => stubs[name] ?? require(name);
profileModule._compile(compiled, filename);
const Page = profileModule.exports.default;
const render = () => renderToStaticMarkup(React.createElement(Page, { profile: { id: 'a', display_name: 'Giocatore A' }, avatar: null }));
const player = (id, team, kills, deaths) => ({ profile_id: id, nickname: id, team, kills, deaths, damage: null, hill_seconds: null, objective_kills: null, plants: null, defuses: null, first_bloods: null, overloads: null, carries: null });

test('il profilo MW4 senza partite mostra il nick COD e nessun dato padel', () => {
  snapshot = { ...snapshot, gbs: [] };
  const html = render();
  assert.match(html, /MW4 · PROFILO/);
  assert.match(html, /Nessuna GB giocata/);
  assert.match(html, /Il mio nick Call of Duty/);
  assert.doesNotMatch(html, /Padel|Mano della racchetta|Lato del campo/);
});

test('il profilo MW4 riassume solo le GB elaborate del giocatore', () => {
  snapshot = { ...snapshot, gbs: [
    { id: 'g1', mode: 'hardpoint', map_name: 'Vista', played_at: '2026-10-22T20:00:00Z', status: 'processed', team1_score: 250, team2_score: 150, players: [player('a', 1, 20, 10), player('b', 2, 8, 20)] },
    { id: 'g2', mode: 'hardpoint', map_name: 'Rio', played_at: '2026-10-21T20:00:00Z', status: 'needs_review', team1_score: null, team2_score: null, players: [player('a', 1, 99, 1)] },
  ] };
  const html = render();
  assert.match(html, /<dt>K\/D<\/dt><dd>2\.00<\/dd>/);
  assert.match(html, /#1 su 2/);
  assert.match(html, /Vista/);
  assert.doesNotMatch(html, /Rio/);
});
