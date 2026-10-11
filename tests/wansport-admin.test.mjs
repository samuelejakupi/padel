import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("../supabase/functions/wansport-slots/index.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source.replace(/^import .*createClient.*;$/m, ""), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function handler({ signedIn = true, admin = false, roleError = false } = {}) {
  let serve; const writes = [];
  vm.runInNewContext(code, {
    Deno: { env: { get: () => "test" }, serve: fn => { serve = fn; } },
    Response, Request, URL, URLSearchParams, AbortSignal,
    createClient: () => ({
      auth: { getUser: async () => ({ data: { user: signedIn ? { id: "viewer" } : null } }) },
      from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: admin ? { profile_id: "viewer" } : null, error: roleError ? {} : null }) }),
      rpc: async name => { writes.push(name); return { data: false }; },
    }),
  });
  return { serve, writes };
}
const request = action => new Request("https://example.test", { method: "POST", headers: { Authorization: "Bearer test" }, body: JSON.stringify({ azione: action }) });
test("stato e salvataggio Wansport rifiutano utenti anonimi e non admin", async () => {
  for (const action of ["stato", "salva"]) for (const options of [{ signedIn: false }, { admin: false }, { roleError: true }]) {
    const api = handler(options);
    assert.equal((await api.serve(request(action))).status, options.signedIn === false ? 401 : options.roleError ? 503 : 403);
    assert.equal(api.writes.length, 0);
  }
});
test("gli admin leggono lo stato e raggiungono la validazione delle credenziali", async () => {
  const api = handler({ admin: true });
  assert.equal((await api.serve(request("stato"))).status, 200);
  assert.deepEqual(api.writes, ["accesso_wansport_configurato"]);
  assert.equal((await api.serve(request("salva"))).status, 400);
  assert.equal(api.writes.length, 1);
});
test("la richiesta del tabellone non richiede il ruolo admin", async () => {
  const api = handler();
  const response = await api.serve(new Request("https://example.test", { method: "POST", body: JSON.stringify({ club: "sconosciuto" }) }));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).errore, "Club sconosciuto");
});
test("il modulo Wansport viene montato solo nel pannello Admin", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const admin = await readFile(new URL("../app/AdminUsers.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /WansportAccesso/);
  assert.match(admin, /<WansportAccesso \/>/);
  assert.match(admin, /if \(!allowed\) return null/);
});
