"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Image from "next/image";
import { supabase, type Profile } from "@/lib/supabase";
import { compressScoreboard } from "@/lib/cod-gb";
import { attachments, builds as staticBuilds, customAttachment, weapons } from "@/lib/loadouts/data";
import { findWeapon, resolveAttachment } from "@/lib/loadouts/resolve";
import { attachmentOptions, mw4Weapons } from "@/lib/loadouts/catalog";
import { attachmentSlots, loadoutKinds, weaponCategories, type Attachment, type AttachmentSlot, type Weapon, type WeaponCategory } from "@/lib/loadouts/types";
import BestLoadouts, { type LoadoutEntry } from "./loadouts/BestLoadouts";
import styles from "./loadouts/Loadouts.module.css";

const slotKeys = Object.keys(attachmentSlots) as AttachmentSlot[];
// Nel database lo slot e salvato col nome italiano ("Volata"), quello che il
// controllo SQL accetta.
const slotByLabel = new Map(slotKeys.map(key => [attachmentSlots[key], key]));
const normalize = (text: string) => text.toUpperCase().replace(/[^A-Z0-9]/g, "");

// Un'arma scritta da un membro: se e nel catalogo prende i suoi dati, se no
// un'arma provvisoria con la sagoma della categoria e statistiche neutre.
function weaponFor(name: string, category: WeaponCategory): Weapon {
  const known = weapons.find(weapon => normalize(weapon.name) === normalize(name));
  if (known) return known;
  return {
    id: `custom-${normalize(name).toLowerCase()}`, name, category, tier: "B", placeholderIcon: true,
    icon: `/gaming/loadouts/weapons/placeholder-${category}.png`, silhouette: `/gaming/loadouts/weapons/placeholder-${category}.svg`,
    stats: { damage: 50, fireRate: 50, range: 50, control: 50, mobility: 50, accuracy: 50, reload: 50 },
  };
}

function attachmentFor(slotLabel: string, name: string): Attachment {
  const slot = slotByLabel.get(slotLabel as (typeof attachmentSlots)[AttachmentSlot]) ?? "muzzle";
  return attachments.find(item => item.slot === slot && normalize(item.name) === normalize(name)) ?? customAttachment(name, slot);
}

function BuildForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => Promise<void> }) {
  const [weapon, setWeapon] = useState("");
  const [category, setCategory] = useState<WeaponCategory>("assault");
  // Da screenshot la build la legge la routine notturna; a mano si pubblica
  // subito. Lo screenshot e la strada piu corta, quindi viene prima.
  const [method, setMethod] = useState<"photo" | "manual">("photo");
  const [slots, setSlots] = useState<Partial<Record<AttachmentSlot, string>>>({});
  const [loadout, setLoadout] = useState<Record<string, string>>({});
  const [image, setImage] = useState<{ data: string; bytes: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const filled = slotKeys.filter(slot => slots[slot]?.trim());
  // Se l'arma e nel catalogo, gli slot suggeriscono i suoi accessori e la
  // categoria si sceglie da sola.
  const known = weapons.find(item => normalize(item.name) === normalize(weapon));
  const options = known ? attachmentOptions[known.id] ?? {} : {};
  function chooseWeapon(name: string) {
    setWeapon(name);
    const match = mw4Weapons.find(item => normalize(item.name) === normalize(name));
    if (match) setCategory(match.category);
  }
  async function pick(file: File | undefined) {
    setImage(null); setMessage("");
    if (!file) return;
    setBusy(true);
    try { setImage(await compressScoreboard(file)); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Compressione non riuscita."); }
    finally { setBusy(false); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supabase || busy) return;
    if (method === "photo") {
      if (!image) { setMessage("Scegli lo screenshot dell'armaiolo."); return; }
      setBusy(true); setMessage("");
      const { error } = await supabase.rpc("submit_cod_meta_build_photo", { p_image: image.data, p_weapon_hint: weapon.trim() || null });
      if (error) { setMessage(error.message); setBusy(false); return; }
      await onSaved(); onClose();
      return;
    }
    if (!filled.length || filled.length > 6) { setMessage("Inserisci da 1 a 6 accessori."); return; }
    setBusy(true); setMessage("");
    const { error } = await supabase.rpc("create_cod_meta_build", {
      p_weapon: weapon.trim(),
      p_category: category,
      p_attachments: filled.map(slot => ({ slot: attachmentSlots[slot], name: slots[slot]!.trim() })),
      p_loadout: loadoutKinds.filter(kind => loadout[kind]?.trim()).map(kind => ({ kind, name: loadout[kind].trim() })),
      p_image: image?.data ?? null,
    });
    if (error) { setMessage(error.message); setBusy(false); return; }
    await onSaved(); onClose();
  }
  return <div className="modal-backdrop">
    <section className="modal cod-gb-modal" role="dialog" aria-modal="true" aria-labelledby="cod-build-title">
      <div className="modal-head"><h2 id="cod-build-title">Aggiungi build</h2><button className="icon-button" type="button" aria-label="Chiudi" disabled={busy} onClick={onClose}>×</button></div>
      <div className="cod-mode-tabs" aria-label="Metodo di inserimento">
        <button type="button" className="button button-ghost" aria-pressed={method === "photo"} disabled={busy} onClick={() => setMethod("photo")}>Da screenshot</button>
        <button type="button" className="button button-ghost" aria-pressed={method === "manual"} disabled={busy} onClick={() => setMethod("manual")}>A mano</button>
      </div>
      <p>{method === "photo"
        ? "Carica lo screenshot della schermata Armaiolo: arma e accessori vengono letti ogni notte e la build compare da sola. Se qualcosa non si legge, te lo diciamo qui."
        : "Copia la build dall'armaiolo del gioco. Compila solo gli slot montati: la build compare subito."}</p>
      <form onSubmit={event => void submit(event)}>
        {method === "photo" ? <>
          <label>Screenshot dell&apos;armaiolo<input type="file" accept="image/jpeg,image/png,image/webp" required disabled={busy} onChange={e => void pick(e.target.files?.[0])} /></label>
          {image ? <small>Screenshot pronto · {Math.ceil(image.bytes / 1024)} KB</small> : <small>Non tagliare il nome dell&apos;arma e i riquadri degli accessori.</small>}
          <label>Arma (facoltativo)<input value={weapon} onChange={e => setWeapon(e.target.value)} maxLength={40} disabled={busy} placeholder="Aiuta la lettura, es. M4" list="cod-weapon-names" /></label>
          <datalist id="cod-weapon-names">{mw4Weapons.map(item => <option key={item.name} value={item.name} />)}</datalist>
        </> : <>
        <div className="cod-manual-grid">
          <label>Arma<input value={weapon} onChange={e => chooseWeapon(e.target.value)} maxLength={40} required disabled={busy} placeholder="Es. M4" list="cod-weapon-names" /></label>
          <datalist id="cod-weapon-names">{mw4Weapons.map(item => <option key={item.name} value={item.name} />)}</datalist>
          <label>Categoria<select value={category} disabled={busy} onChange={e => setCategory(e.target.value as WeaponCategory)}>
            {Object.entries(weaponCategories).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}
          </select></label>
        </div>
        <fieldset className="cod-manual-player"><legend>Accessori · {filled.length}/6</legend>
          <div className="cod-manual-grid">
            {slotKeys.filter(slot => !known || options[slot]).map(slot => <label key={slot}>{attachmentSlots[slot]}<input value={slots[slot] ?? ""} maxLength={60} disabled={busy || (!slots[slot]?.trim() && filled.length >= 6)} placeholder="Vuoto"
              list={options[slot] ? `cod-slot-${slot}` : undefined}
              onChange={e => setSlots(current => ({ ...current, [slot]: e.target.value }))} />
              {options[slot] ? <datalist id={`cod-slot-${slot}`}>{options[slot]!.map(name => <option key={name} value={name} />)}</datalist> : null}</label>)}
          </div>
        </fieldset>
        <fieldset className="cod-manual-player"><legend>Equipaggiamento e perk (facoltativi)</legend>
          <div className="cod-manual-grid">
            {loadoutKinds.map(kind => <label key={kind}>{kind}<input value={loadout[kind] ?? ""} maxLength={60} disabled={busy}
              onChange={e => setLoadout(current => ({ ...current, [kind]: e.target.value }))} /></label>)}
          </div>
        </fieldset>
        <label>Screenshot dell&apos;armaiolo (facoltativo)<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e => void pick(e.target.files?.[0])} /></label>
        {image ? <small>Screenshot pronto · {Math.ceil(image.bytes / 1024)} KB</small> : null}
        </>}
        {message ? <p className="form-message" role="alert">{message}</p> : null}
        <div className="modal-actions"><button className="button button-ghost" type="button" disabled={busy} onClick={onClose}>Annulla</button>
          {method === "photo"
            ? <button className="button button-primary" disabled={busy || !image}>{busy ? "Preparazione…" : "Invia screenshot"}</button>
            : <button className="button button-primary" disabled={busy || !weapon.trim() || !filled.length}>{busy ? "Salvataggio…" : "Salva build"}</button>}
        </div>
      </form>
    </section>
  </div>;
}

type BuildStatus = "pending" | "processing" | "needs_review" | "published";
type BuildRow = {
  id: string; created_by: string; created_at: string; status: BuildStatus; review_note: string | null; weapon_hint: string | null;
  weapon: string | null; category: WeaponCategory | null; attachments: { slot: string; name: string }[]; loadout: { kind: string; name: string }[];
  has_screenshot: boolean; screenshot_deleted_at: string | null;
};
const statusLabels: Record<Exclude<BuildStatus, "published">, string> = {
  pending: "In attesa · prossima lettura notturna",
  processing: "Lettura in corso",
  needs_review: "Da verificare",
};

export default function CodMeta({ viewerId, profiles, startWithForm = false }: { viewerId: string; profiles: Profile[]; startWithForm?: boolean }) {
  const [showForm, setShowForm] = useState(startWithForm);
  const [rows, setRows] = useState<BuildRow[]>([]);
  const [missingSchema, setMissingSchema] = useState(false);
  const [error, setError] = useState("");
  const [shot, setShot] = useState<{ id: string; data: string } | null>(null);
  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error: queryError } = await supabase.from("cod_meta_builds")
      .select("id,created_by,created_at,status,review_note,weapon_hint,weapon,category,attachments,loadout,has_screenshot,screenshot_deleted_at")
      .order("created_at", { ascending: false });
    // Finche la migrazione non e stata eseguita la tabella non esiste: la
    // pagina mostra le build scritte a mano e lo dice, senza errori rossi.
    setMissingSchema(Boolean(queryError));
    if (!queryError) setRows((data ?? []) as BuildRow[]);
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  async function remove(id: string) {
    if (!supabase || !window.confirm("Eliminare questa build?")) return;
    const { error: deleteError } = await supabase.rpc("delete_cod_meta_build", { p_id: id });
    if (deleteError) setError(deleteError.message); else await load();
  }
  async function retry(id: string) {
    if (!supabase) return;
    const { error: retryError } = await supabase.rpc("retry_cod_meta_build", { p_id: id });
    if (retryError) setError(retryError.message); else await load();
  }
  async function showShot(id: string) {
    if (!supabase) return;
    const { data, error: shotError } = await supabase.rpc("cod_meta_build_screenshot", { p_id: id });
    if (shotError || !data) setError("Screenshot non più disponibile: si cancella dopo 7 giorni.");
    else setShot({ id, data: String(data) });
  }
  const entries: LoadoutEntry[] = [
    ...staticBuilds.flatMap(build => {
      const weapon = findWeapon(build.weaponId);
      return weapon ? [{ build, weapon, attachments: build.attachmentIds.map(resolveAttachment) }] : [];
    }),
    ...rows.filter(row => row.status === "published" && row.weapon && row.category).map(row => {
      const weapon = weaponFor(row.weapon!, row.category!);
      const hasShot = row.has_screenshot && !row.screenshot_deleted_at;
      return {
        build: { id: row.id, weaponId: weapon.id, title: "Dal gruppo", playstyles: [], attachmentIds: [], loadout: row.loadout, source: "Caricata dall'app", createdBy: row.created_by, hasScreenshot: hasShot },
        weapon,
        attachments: row.attachments.map(item => attachmentFor(item.slot, item.name)),
        author: profiles.find(profile => profile.id === row.created_by)?.display_name,
        actions: hasShot || row.created_by === viewerId ? <>
          {hasShot ? <button type="button" className="button button-ghost" onClick={() => void showShot(row.id)}>Vedi screenshot</button> : null}
          {row.created_by === viewerId ? <button type="button" className="button button-ghost" onClick={() => void remove(row.id)}>Elimina build</button> : null}
        </> : undefined,
      };
    }),
  ];
  // Le build da screenshot non ancora pubblicate le vede solo chi le ha
  // caricate, con lo stato e l'eventuale motivo della revisione.
  const queue = rows.filter(row => row.status !== "published" && row.created_by === viewerId);
  const allWeapons = [...weapons, ...entries.map(entry => entry.weapon).filter(weapon => !weapons.includes(weapon))]
    .filter((weapon, index, list) => list.findIndex(item => item.id === weapon.id) === index);
  return <>
    <BestLoadouts entries={entries} weapons={allWeapons} banner={queue.length ? <section className={styles.queue} aria-label="Le tue build in lettura">
      <h2 className={styles.sectionTitle}>Le tue build in lettura · {queue.length}</h2>
      <ul>{queue.map(row => {
        const status = row.status as Exclude<BuildStatus, "published">;
        return <li key={row.id} data-status={status}>
          <div>
            <strong>{row.weapon_hint || "Arma da leggere"}</strong>
            <small>{statusLabels[status]} · inviata il {new Date(row.created_at).toLocaleDateString("it-IT")}</small>
            {row.review_note ? <p>{row.review_note}</p> : null}
          </div>
          <div className={styles.actions}>
            <button type="button" className="button button-ghost" onClick={() => void showShot(row.id)}>Screenshot</button>
            {status === "needs_review" ? <button type="button" className="button button-ghost" onClick={() => void retry(row.id)}>Riprova</button> : null}
            <button type="button" className="button button-ghost" onClick={() => void remove(row.id)}>Elimina</button>
          </div>
        </li>;
      })}</ul>
    </section> : null} headerAction={
      <button className="button button-primary" type="button" disabled={!viewerId || missingSchema} onClick={() => setShowForm(true)}>+ Aggiungi build</button>
    } />
    {missingSchema ? <p className={`demo-profile-note ${styles.note}`}>Per caricare build dall&apos;app esegui <code>supabase/cod-meta-builds.sql</code> nel SQL Editor di Supabase.</p> : null}
    {error ? <p role="alert" className={styles.note}>{error}</p> : null}
    {shot ? <div className="modal-backdrop" onClick={() => setShot(null)}>
      <section className="modal" role="dialog" aria-modal="true" aria-label="Screenshot della build">
        <Image src={`data:image/jpeg;base64,${shot.data}`} alt="Screenshot dell'armaiolo" width={1280} height={720} unoptimized style={{ height: "auto", width: "100%" }} />
        <div className="modal-actions"><button type="button" className="button button-ghost" onClick={() => setShot(null)}>Chiudi</button></div>
      </section>
    </div> : null}
    {showForm ? <BuildForm onClose={() => setShowForm(false)} onSaved={load} /> : null}
  </>;
}
