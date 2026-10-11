import type { SupabaseClient } from "@supabase/supabase-js";

export async function changeOwnPassword(
  client: Pick<SupabaseClient, "auth">,
  account: { id: string; email: string },
  currentPassword: string,
  password: string,
  confirmation: string,
) {
  if (!currentPassword) throw new Error("Inserisci la password attuale.");
  if (password.length < 8 || password.length > 128) throw new Error("La nuova password deve avere da 8 a 128 caratteri.");
  if (password !== confirmation) throw new Error("Le nuove password non coincidono.");
  if (password === currentPassword) throw new Error("Scegli una password diversa da quella attuale.");

  // La versione del client installata non supporta ancora currentPassword in updateUser.
  // Riautentichiamo lo stesso account prima di aggiornare la sua password.
  const { data, error } = await client.auth.signInWithPassword({ email: account.email, password: currentPassword });
  if (error) throw new Error(error.code === "over_request_rate_limit"
    ? "Troppi tentativi. Riprova tra qualche minuto."
    : error.code === "invalid_credentials" ? "Password attuale non corretta. Nessuna modifica eseguita."
    : "Impossibile verificare la password attuale. Riprova tra qualche minuto.");
  if (!data.user || data.user.id !== account.id) throw new Error("Account non corrispondente. Accedi nuovamente al tuo profilo.");
  const result = await client.auth.updateUser({ password });
  if (result.error) {
    const code = result.error.code;
    throw new Error(code === "same_password" ? "Scegli una password diversa da quella attuale."
      : code === "weak_password" ? "La nuova password non soddisfa i requisiti di sicurezza."
      : "Password non aggiornata. Riprova tra qualche minuto.");
  }
}
