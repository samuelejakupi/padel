import assert from "node:assert/strict";
import test from "node:test";
import { handleAdminRequest } from "../supabase/functions/admin-users/handler.mjs";

const id = "2a3d16f1-0240-4d47-8139-a915a508bfd9";
function request(body, token = "valid") {
  return new Request("https://example.test/admin-users", {
    method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: JSON.stringify(body),
  });
}
function client({ admin = true, invalid = false, missing = false, roleError = false, createError = null } = {}) {
  const writes = [];
  const api = {
    auth: {
      getUser: async () => ({ data: { user: invalid ? null : { id } }, error: invalid ? {} : null }),
      admin: {
        createUser: async body => { writes.push(["create", body]); return { data: { user: createError ? null : { id } }, error: createError }; },
        updateUserById: async (target, body) => { writes.push(["password", target, body]); return { error: null }; },
      },
    },
    from(table) {
      return {
        select() { return this; },
        eq() { return table === "profiles" ? Promise.resolve({ error: null }) : this; },
        maybeSingle: async () => ({ data: table === "admin_members" ? admin ? { profile_id: id } : null
          : missing ? null : { profile_id: id }, error: table === "admin_members" && roleError ? {} : null }),
        order: async () => ({ data: [{ profile_id: id, username: "samu", profile: { display_name: "Samu" } }], error: null }),
        update(body) { writes.push(["rename", body]); return this; },
      };
    },
  };
  return { api, writes };
}

test("senza sessione o con sessione non valida non modifica utenti", async () => {
  for (const token of [null, "invalid"]) {
    const { api, writes } = client({ invalid: true });
    assert.equal((await handleAdminRequest(request({ action: "create" }, token), api)).status, 401);
    assert.equal(writes.length, 0);
  }
});
test("i non admin e gli errori di controllo permessi non consentono operazioni", async () => {
  for (const options of [{ admin: false }, { roleError: true }]) {
    const { api, writes } = client(options);
    const response = await handleAdminRequest(request({ action: "password", id, password: "Example123!" }), api);
    assert.equal(response.status, options.roleError ? 503 : 403);
    assert.equal(writes.length, 0);
  }
});
test("creazione assegna solo il flag di provisioning, mai il ruolo admin richiesto dal client", async () => {
  const { api, writes } = client();
  const response = await handleAdminRequest(request({ action: "create", username: " Nuovo ", display_name: " Nuovo utente ", password: "Example123!", role: "admin" }), api);
  assert.equal(response.status, 201);
  assert.equal(writes[0][1].email, "nuovo@theboyz.local");
  assert.deepEqual(writes[0][1].app_metadata, { theboyz_provisioned: true });
});
test("nome e password hanno operazioni indipendenti, senza cambiare UUID o nome di accesso", async () => {
  const { api, writes } = client();
  assert.equal((await handleAdminRequest(request({ action: "rename", id, display_name: "Nuovo nome" }), api)).status, 200);
  assert.deepEqual(writes[0], ["rename", { display_name: "Nuovo nome" }]);
  assert.equal((await handleAdminRequest(request({ action: "password", id, password: "Example123!" }), api)).status, 200);
  assert.deepEqual(writes[1], ["password", id, { password: "Example123!" }]);
});
test("validazione respinge password brevi, nomi vuoti, username ed azioni invalidi", async () => {
  for (const body of [
    { action: "password", id, password: "123" },
    { action: "rename", id, display_name: " " },
    { action: "create", username: "bad@name", display_name: "Nome", password: "Example123!" },
    { action: "delete", id },
  ]) {
    const { api, writes } = client();
    assert.equal((await handleAdminRequest(request(body), api)).status, 400);
    assert.equal(writes.length, 0);
  }
});
test("non modifica account esterni al gruppo", async () => {
  const { api, writes } = client({ missing: true });
  assert.equal((await handleAdminRequest(request({ action: "rename", id, display_name: "Nome" }), api)).status, 404);
  assert.equal(writes.length, 0);
});
test("lista admin non include password o metadata sensibili", async () => {
  const { api } = client();
  const response = await handleAdminRequest(request({ action: "list" }), api);
  assert.deepEqual(await response.json(), { users: [{ id, username: "samu", display_name: "Samu" }] });
});

test("creazione distingue duplicati, password deboli ed errori del database", async () => {
  for (const [code, status, text] of [
    ["email_exists", 400, "Nome di accesso già utilizzato."],
    ["weak_password", 400, "La password non soddisfa i requisiti di sicurezza."],
    ["unexpected_failure", 500, "Creazione non riuscita per un errore del servizio. Riprova o contatta un admin."],
  ]) {
    const { api } = client({ createError: { code } });
    const response = await handleAdminRequest(request({ action: "create", username: "nuovo", display_name: "Nuovo", password: "Example123!" }), api);
    assert.equal(response.status, status);
    assert.equal((await response.json()).error, text);
  }
});
