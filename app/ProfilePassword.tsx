"use client";

import { useRef, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { changeOwnPassword } from "@/lib/change-password";

export default function ProfilePassword({ account }: { account: { id: string; email: string } }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const pending = useRef(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supabase || pending.current) return;
    pending.current = true;
    setBusy(true); setMessage("");
    try {
      await changeOwnPassword(supabase, account, currentPassword, password, confirmation);
      setCurrentPassword(""); setPassword(""); setConfirmation("");
      setMessage("Password aggiornata.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Password non aggiornata.");
    } finally { pending.current = false; setBusy(false); }
  }

  return <details className="profile-password">
    <summary>Cambia password</summary>
    <form onSubmit={submit}>
      <label>Password attuale<input type="password" autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} required disabled={busy} /></label>
      <label>Nuova password<input type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} minLength={8} maxLength={128} required disabled={busy} /></label>
      <label>Conferma nuova password<input type="password" autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} minLength={8} maxLength={128} required disabled={busy} /></label>
      {message ? <p className="form-message" role="status" aria-live="polite">{message}</p> : null}
      <button className="button button-primary" disabled={busy}>{busy ? "Aggiornamento…" : "Aggiorna password"}</button>
    </form>
  </details>;
}
