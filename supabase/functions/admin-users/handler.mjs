const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
});

// Client privilegiato esclusivamente server-side. Autenticazione e ruolo precedono ogni operazione.
export async function handleAdminRequest(req, client) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply(405, { error: "Metodo non consentito." });
  const token = req.headers.get("Authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return reply(401, { error: "Accesso richiesto." });
  try {
    const { data: auth, error: authError } = await client.auth.getUser(token);
    if (authError || !auth.user) return reply(401, { error: "Sessione non valida." });
    const { data: role, error: roleError } = await client.from("admin_members")
      .select("profile_id").eq("profile_id", auth.user.id).maybeSingle();
    if (roleError) return reply(503, { error: "Impossibile verificare i permessi." });
    if (!role) return reply(403, { error: "Accesso riservato agli admin." });
    let body;
    try { body = await req.json(); } catch { return reply(400, { error: "Richiesta non valida." }); }
    if (!body || typeof body !== "object") return reply(400, { error: "Richiesta non valida." });

    if (body.action === "list") {
      const { data, error } = await client.from("member_logins")
        .select("profile_id, username, profile:profiles(display_name)").order("username");
      if (error) return reply(500, { error: "Impossibile caricare gli utenti." });
      return reply(200, { users: data.map(row => ({
        id: row.profile_id, username: row.username, display_name: row.profile.display_name,
      })) });
    }
    if (!["create", "rename", "password"].includes(body.action))
      return reply(400, { error: "Operazione non valida." });
    const name = typeof body.display_name === "string" ? body.display_name.trim() : "";
    if (["create", "rename"].includes(body.action) && (name.length < 2 || name.length > 40))
      return reply(400, { error: "Il nome deve avere da 2 a 40 caratteri." });
    if (["create", "password"].includes(body.action) &&
      (typeof body.password !== "string" || body.password.length < 8 || body.password.length > 128))
      return reply(400, { error: "La password deve avere da 8 a 128 caratteri." });

    if (body.action === "create") {
      const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
      if (!/^[a-z0-9][a-z0-9._-]{1,31}$/.test(username))
        return reply(400, { error: "Nome di accesso: 2–32 lettere, numeri, punti, trattini o underscore." });
      const { data, error } = await client.auth.admin.createUser({
        email: `${username}@theboyz.local`, password: body.password, email_confirm: true,
        app_metadata: { theboyz_provisioned: true }, user_metadata: { display_name: name },
      });
      if (error) return reply(400, { error: error.code === "email_exists" || error.code === "user_already_exists"
        ? "Nome di accesso già utilizzato." : "Creazione non riuscita. Verifica nome di accesso e password." });
      return reply(201, { id: data.user.id });
    }
    if (typeof body.id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.id))
      return reply(400, { error: "Utente non valido." });
    const { data: member, error: memberError } = await client.from("member_logins")
      .select("profile_id").eq("profile_id", body.id).maybeSingle();
    if (memberError) return reply(500, { error: "Impossibile verificare l'utente." });
    if (!member) return reply(404, { error: "Utente non trovato." });
    if (body.action === "rename") {
      const { error } = await client.from("profiles").update({ display_name: name }).eq("id", body.id);
      return error ? reply(500, { error: "Nome non aggiornato." }) : reply(200, { ok: true });
    }
    const { error } = await client.auth.admin.updateUserById(body.id, { password: body.password });
    return error ? reply(400, { error: "Password non aggiornata. Verifica i requisiti della password." })
      : reply(200, { ok: true });
  } catch {
    return reply(500, { error: "Operazione non riuscita." });
  }
}
