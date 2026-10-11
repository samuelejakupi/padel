import test from "node:test";
import assert from "node:assert/strict";
import { changeOwnPassword } from "../lib/change-password.ts";
const account = { id: "own-user", email: "own@theboyz.local" };
function client({ wrong = false, other = false, updateError = null } = {}) {
  const calls = [];
  return { calls, auth: {
    async signInWithPassword(body) { calls.push(["verify", body]); return { data: { user: { id: other ? "other-user" : account.id } }, error: wrong ? { code: "invalid_credentials" } : null }; },
    async updateUser(body) { calls.push(["update", body]); return { error: updateError }; },
  } };
}
test("conferma e requisiti vengono verificati prima di chiamare Auth", async () => {
  for (const args of [["", "New12345!", "New12345!"], ["Old12345!", "short", "short"], ["Old12345!", "New12345!", "Mismatch!"], ["Old12345!", "Old12345!", "Old12345!"]]) {
    const api = client();
    await assert.rejects(changeOwnPassword(api, account, ...args));
    assert.equal(api.calls.length, 0);
  }
});
test("password attuale errata o account diverso non aggiornano la password", async () => {
  for (const options of [{ wrong: true }, { other: true }]) {
    const api = client(options);
    await assert.rejects(changeOwnPassword(api, account, "Old12345!", "New12345!", "New12345!"));
    assert.equal(api.calls.length, 1);
  }
});
test("aggiorna solo la password dell'account riautenticato, senza API admin", async () => {
  const api = client();
  await changeOwnPassword(api, account, "Old12345!", "New12345!", "New12345!");
  assert.deepEqual(api.calls, [["verify", { email: account.email, password: "Old12345!" }], ["update", { password: "New12345!" }]]);
});
test("gli errori di updateUser non vengono mostrati come un successo", async () => {
  const api = client({ updateError: { code: "weak_password" } });
  await assert.rejects(changeOwnPassword(api, account, "Old12345!", "New12345!", "New12345!"), /requisiti/);
});
