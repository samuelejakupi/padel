"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";

type Member = { id: string; username: string; display_name: string };

async function adminRequest(body: Record<string, unknown>) {
  if (!supabase) throw new Error("Connessione non disponibile.");
  const { data, error } = await supabase.functions.invoke("admin-users", { body });
  if (error) {
    let message = "Operazione non riuscita.";
    if (error.context instanceof Response) {
      const payload = await error.context.json().catch(() => null);
      message = payload?.error || message;
    }
    throw new Error(message);
  }
  return data;
}

function MemberEditor({ member, disabled, onSave }: {
  member: Member;
  disabled: boolean;
  onSave: (body: Record<string, unknown>, message: string) => Promise<boolean>;
}) {
  const [name, setName] = useState(member.display_name);
  const [password, setPassword] = useState("");
  return <article className="admin-member">
    <header><b>{member.display_name}</b><small>Accesso: {member.username}</small></header>
    <form onSubmit={async (event) => {
      event.preventDefault();
      await onSave({ action: "rename", id: member.id, display_name: name }, "Nome aggiornato.");
    }}>
      <label>Nome<input value={name} onChange={event => setName(event.target.value)} required minLength={2} maxLength={40} disabled={disabled} /></label>
      <button className="button button-ghost" disabled={disabled || name.trim() === member.display_name}>Salva nome</button>
    </form>
    <form onSubmit={async (event) => {
      event.preventDefault();
      if (await onSave({ action: "password", id: member.id, password }, "Password aggiornata.")) setPassword("");
    }}>
      <label>Nuova password<input type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} minLength={8} maxLength={128} required disabled={disabled} /></label>
      <button className="button button-ghost" disabled={disabled || password.length < 8}>Imposta password</button>
    </form>
  </article>;
}

function AdminPanel({ onClose, onChanged }: { onClose: () => void; onChanged: () => Promise<void> }) {
  const [users, setUsers] = useState<Member[]>([]);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const operationRef = useRef(false);

  const loadUsers = useCallback(async () => {
    const data = await adminRequest({ action: "list" });
    return data.users as Member[];
  }, []);
  useEffect(() => {
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);
  useEffect(() => {
    let active = true;
    void loadUsers().then(users => { if (active) setUsers(users); })
      .catch(error => { if (active) setMessage(error.message); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [loadUsers]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [onClose]);

  async function save(body: Record<string, unknown>, success: string) {
    if (operationRef.current) return false;
    operationRef.current = true;
    setBusy(true);
    setMessage("");
    try {
      await adminRequest(body);
      setMessage(success);
      setUsers(await loadUsers());
      await onChanged();
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Operazione non riuscita.");
      return false;
    } finally { operationRef.current = false; setBusy(false); }
  }
  async function create(event: FormEvent) {
    event.preventDefault();
    if (await save({ action: "create", username, display_name: name, password }, "Utente creato.")) {
      setUsername(""); setName(""); setPassword("");
    }
  }

  return createPortal(<div className="modal-backdrop admin-backdrop" onKeyDown={event => {
    if (event.key !== "Tab") return;
    const controls = dialogRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)");
    if (!controls?.length) return;
    const first = controls[0]; const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }}>
    <section className="modal admin-panel" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="admin-heading">
      <header className="admin-heading"><h2 id="admin-heading">Admin</h2><button type="button" ref={closeRef} className="button button-ghost" onClick={onClose}>Chiudi</button></header>
      <p className="form-message" role="status" aria-live="polite">{message || (busy ? "Caricamento…" : "")}</p>
      <section className="admin-create"><h3>Nuovo utente</h3>
        <form onSubmit={create}>
          <label>Nome di accesso<input value={username} onChange={event => setUsername(event.target.value.toLowerCase())} autoCapitalize="none" autoCorrect="off" autoComplete="off" pattern="[a-z0-9][a-z0-9._-]{1,31}" minLength={2} maxLength={32} required disabled={busy} /></label>
          <label>Nome mostrato<input value={name} onChange={event => setName(event.target.value)} minLength={2} maxLength={40} required disabled={busy} /></label>
          <label>Password<input type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} minLength={8} maxLength={128} required disabled={busy} /></label>
          <button className="button button-primary" disabled={busy}>Aggiungi utente</button>
        </form>
      </section>
      <h3>Utenti</h3>
      <div className="admin-members">{users.map(member => <MemberEditor key={member.id} member={member} disabled={busy} onSave={save} />)}</div>
    </section>
  </div>, document.body);
}

export default function AdminAccess({ viewerId, onChanged }: { viewerId: string; onChanged: () => Promise<void> }) {
  const [allowed, setAllowed] = useState(false);
  const [open, setOpen] = useState(false);
  const entryRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let active = true;
    if (!supabase) return;
    void supabase.from("admin_members").select("profile_id").eq("profile_id", viewerId).maybeSingle()
      .then(({ data, error }) => { if (active) setAllowed(!error && Boolean(data)); });
    return () => { active = false; };
  }, [viewerId]);
  if (!allowed) return null;
  return <>
    <div className="admin-entry"><button ref={entryRef} type="button" className="button button-ghost" onClick={() => setOpen(true)}>Admin</button></div>
    {open ? <AdminPanel onChanged={onChanged} onClose={() => { setOpen(false); entryRef.current?.focus(); }} /> : null}
  </>;
}
