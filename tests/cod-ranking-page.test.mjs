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
const filename = fileURLToPath(new URL('../app/CodRanking.tsx', import.meta.url));
const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const rankingModule = new Module(filename);
rankingModule.filename = filename;
rankingModule.require = (name) => name === '@/lib/cod-gb' ? cod : name === '@/lib/cod-emblems' ? emblems : name === './useCodGbs' ? { __esModule: true, default: () => snapshot } : require(name);
rankingModule._compile(compiled, filename);
const Page = rankingModule.exports.default;
const render = () => renderToStaticMarkup(React.createElement(Page, { profiles: [{ id: 'a', display_name: 'Giocatore A' }] }));

test('la classifica vuota è distinta dal registro e dal caricamento GB', () => {
  snapshot = { ...snapshot, gbs: [], loading: false, error: '' };
  const html = render();
  assert.match(html, /<h1>Classifica MW4<\/h1>/);
  assert.match(html, /Classifica Hardpoint ancora vuota/);
  assert.doesNotMatch(html, /Carica GB|Le nostre GB|cod-gb-list|Scoreboard elaborati|Il mio nick/);
});
test('il caricamento mostra la classifica e non una pagina GB', () => {
  snapshot = { ...snapshot, loading: true };
  const html = render();
  assert.match(html, /Caricamento classifica/);
  assert.doesNotMatch(html, /Caricamento GB|Carica GB|Le nostre GB/);
});
test('i risultati compaiono come righe della classifica senza card partita', () => {
  snapshot = { ...snapshot, loading: false, gbs: [{ mode: 'hardpoint', status: 'processed', team1_score: 250, team2_score: 150, players: [{ profile_id: 'a', team: 1, kills: 20, deaths: 10, damage: 1500, hill_seconds: 90, objective_kills: 3 }] }] };
  const html = render();
  assert.match(html, /<table/);
  assert.match(html, /Giocatore A/);
  assert.match(html, /2\.00/);
  assert.doesNotMatch(html, /cod-gb-card|Carica GB/);
});
