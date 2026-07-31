import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("genera un sito statico pronto per GitHub Pages", async () => {
  await access(new URL("out/index.html", root));
  await access(new URL("out/_next/", root));
  const html = await readFile(new URL("out/index.html", root), "utf8");
  assert.match(html, /Padel House/i);
  assert.match(html, /classifica/i);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("include configurazione Supabase e pubblicazione Pages", async () => {
  const [schema, workflow, page] = await Promise.all([
    readFile(new URL("supabase/schema.sql", root), "utf8"),
    readFile(new URL(".github/workflows/deploy-pages.yml", root), "utf8"),
    readFile(new URL("app/page.tsx", root), "utf8"),
  ]);
  assert.match(schema, /record_match/);
  assert.match(schema, /limit.*10|10 giocatori/i);
  assert.match(workflow, /deploy-pages/);
  assert.match(page, /signInWithPassword/);
  assert.match(page, /avatars/);
});
