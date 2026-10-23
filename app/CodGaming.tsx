"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import { supabase, type Profile } from "@/lib/supabase";
import { codModes, codModeStatKeys, compressScoreboard, type CodMode } from "@/lib/cod-gb";

import useCodGbs from "./useCodGbs";

type Identity = { id: string; profile_id: string; nickname: string };
const statusLabels = { pending: "In attesa · prossima lettura notturna", processing: "Lettura scoreboard in corso", needs_review: "Da verificare", processed: "Risultato registrato" };

export function CodNickname({ viewerId }: { viewerId: string }) {
  const [nick, setNick] = useState("");
  const [aliases, setAliases] = useState<Identity[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let live = true;
    void supabase?.from("cod_identities").select("id,profile_id,nickname").eq("profile_id", viewerId).then(({ data, error }) => {
      if (live) { setAliases(data ?? []); if (error) setMessage("Impossibile caricare i nick COD."); }
    });
    return () => { live = false; };
  }, [viewerId]);
  async function save(event: FormEvent) {
    event.preventDefault(); if (!supabase || busy) return;
    setBusy(true); setMessage("");
    const { error } = await supabase.rpc("save_cod_nickname", { p_nickname: nick.trim() });
    if (error) setMessage(error.code === "23505" ? "Questo nick è già associato a un profilo." : error.message);
    else {
      const { data } = await supabase.from("cod_identities").select("id,profile_id,nickname").eq("profile_id", viewerId);
      setAliases(data ?? []); setNick(""); setMessage("Nick COD associato.");
    }
    setBusy(false);
  }
  return <details className="profile-password cod-nickname">
    <summary>Il mio nick Call of Duty</summary>
    <p>Inserisci il nick esatto che appare negli scoreboard, compreso #ID se visibile. Puoi aggiungere altri nick usati: quelli precedenti restano riconoscibili.</p>
    {aliases.length ? <ul>{aliases.map(alias => <li key={alias.id}>{alias.nickname}</li>)}</ul> : <p>Nessun nick associato.</p>}
    <form onSubmit={event => void save(event)}>
      <label>Nick COD<input value={nick} onChange={e => setNick(e.target.value)} minLength={2} maxLength={80} required autoCapitalize="none" autoCorrect="off" spellCheck={false} disabled={busy} /></label>
      <button className="button button-primary" disabled={busy || !viewerId}>{busy ? "Salvataggio…" : "Associa nick"}</button>
      {message ? <p role="status">{message}</p> : null}
    </form>
  </details>;
}

type ManualPlayer = { id: string; profile_id: string; nickname: string; team: number; stats: Record<string, string> };
function GbForm({ onClose, onSaved, profiles, viewerId }: { onClose: () => void; onSaved: () => Promise<void>; profiles: Profile[]; viewerId: string }) {
  const [method, setMethod] = useState<"photo" | "manual">("photo");
  const [scores, setScores] = useState(["", ""]);
  const [players, setPlayers] = useState<ManualPlayer[]>(() => [
    { id: crypto.randomUUID(), profile_id: viewerId, nickname: "", team: 1, stats: {} },
    { id: crypto.randomUUID(), profile_id: "", nickname: "", team: 2, stats: {} },
  ]);
  const updatePlayer = (id: string, patch: Partial<ManualPlayer>) => setPlayers(current => current.map(p => p.id === id ? { ...p, ...patch } : p));
  const [mode, setMode] = useState<CodMode>("hardpoint");
  const [map, setMap] = useState("");
  const [playedAt, setPlayedAt] = useState(() => {
    const date = new Date(); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  });
  const [images, setImages] = useState<{ data: string; bytes: number }[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const pending = useRef(false);
  async function pick(files: File[]) {
    if (pending.current) return;
    setImages([]); setMessage("");
    if (!files.length || files.length > 4) { setMessage("Scegli da 1 a 4 foto della stessa partita."); return; }
    pending.current = true; setBusy(true);
    try {
      const compressed = [];
      // Una foto alla volta limita la memoria occupata sui telefoni.
      for (const file of files) compressed.push(await compressScoreboard(file));
      setImages(compressed);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Compressione non riuscita."); }
    finally { pending.current = false; setBusy(false); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!supabase || pending.current || (method === "photo" && !images.length)) return;
    pending.current = true; setBusy(true); setMessage("");
    try {
      const common = { p_mode: mode, p_map: map.trim(), p_played_at: new Date(playedAt).toISOString() };
      const { error } = method === "photo"
        ? await supabase.rpc("submit_cod_gb", { ...common, p_images: images.map(({ data }) => ({ data })) })
        : await supabase.rpc("record_cod_gb_manual", { ...common, p_result: {
          team1_score: Number(scores[0]), team2_score: Number(scores[1]),
          players: players.map(p => ({ profile_id: p.profile_id || null, nickname: p.nickname.trim(), team: p.team,
            ...Object.fromEntries(["kills", "deaths", "damage", ...codModeStatKeys[mode]].map(key => [key, p.stats[key]?.trim() ? Number(p.stats[key]) : null])),
          })),
        } });
      if (error) throw new Error(error.code === "23505" ? "Uno scoreboard è già stato caricato. Controlla il registro GB." : error.message);
      await onSaved(); onClose();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Caricamento non riuscito."); }
    finally { pending.current = false; setBusy(false); }
  }
  return <div className="modal-backdrop">
    <section className="modal cod-gb-modal" role="dialog" aria-modal="true" aria-labelledby="cod-gb-title">
      <div className="modal-head"><h2 id="cod-gb-title">Aggiungi GB</h2><button className="icon-button" type="button" aria-label="Chiudi" disabled={busy} onClick={onClose}>×</button></div>
      <div className="cod-mode-tabs" aria-label="Metodo di inserimento"><button type="button" className="button button-ghost" aria-pressed={method === "photo"} disabled={busy} onClick={() => setMethod("photo")}>Da foto</button><button type="button" className="button button-ghost" aria-pressed={method === "manual"} disabled={busy} onClick={() => setMethod("manual")}>A mano</button></div>
      <p>{method === "photo" ? "Carica da 1 a 4 foto della stessa partita: risultato finale e scoreboard completi di entrambe le squadre." : "Inserisci il risultato finale e le statistiche dei giocatori. La classifica si aggiorna subito. Associa prima il tuo nick COD."}</p>
      <form onSubmit={event => void submit(event)}>
        <label>Modalità<select value={mode} disabled={busy} onChange={e => setMode(e.target.value as CodMode)}>{Object.entries(codModes).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}</select></label>
        <label>Mappa<input value={map} onChange={e => setMap(e.target.value)} maxLength={80} required disabled={busy} /></label>
        <label>Data e ora<input type="datetime-local" value={playedAt} onChange={e => setPlayedAt(e.target.value)} required disabled={busy} /></label>
        {method === "photo" ? <>
        <label>Foto scoreboard<input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy} onChange={e => void pick(Array.from(e.target.files ?? []))} /></label>
        <small>Compressione automatica in JPEG prima dell’invio. Non ritagliare nomi, punteggi e intestazioni delle colonne. Le foto vengono eliminate automaticamente dopo 24 ore dall’elaborazione riuscita; quelle da verificare restano disponibili.</small>
        <div className="cod-photo-previews">{images.map((photo, index) => <figure key={index}><Image src={`data:image/jpeg;base64,${photo.data}`} alt={`Scoreboard ${index + 1}`} width={480} height={270} unoptimized /><figcaption>{Math.ceil(photo.bytes / 1024)} KB</figcaption></figure>)}</div>
        </> : <>
          <div className="cod-manual-grid">{scores.map((score, index) => <label key={index}>Punteggio squadra {index + 1}<input type="number" min={0} max={10000} step={1} required disabled={busy} value={score} onChange={e => setScores(current => current.map((v, i) => i === index ? e.target.value : v))} /></label>)}</div>
          {players.map((player, index) => <fieldset className="cod-manual-player" key={player.id}><legend>Giocatore {index + 1}</legend>
            <div className="cod-manual-grid"><label>Giocatore<select value={player.profile_id} disabled={busy} onChange={e => updatePlayer(player.id, { profile_id: e.target.value })}><option value="">Giocatore esterno</option>{profiles.map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}</select></label><label>Squadra<select value={player.team} disabled={busy} onChange={e => updatePlayer(player.id, { team: Number(e.target.value) })}><option value={1}>Squadra 1</option><option value={2}>Squadra 2</option></select></label></div>
            {!player.profile_id ? <label>Nick COD<input minLength={2} maxLength={80} required disabled={busy} value={player.nickname} onChange={e => updatePlayer(player.id, { nickname: e.target.value })} /></label> : null}
            <div className="cod-manual-grid">{[...[{ key: "kills", label: "Uccisioni" }, { key: "deaths", label: "Morti" }, { key: "damage", label: "Danni" }], ...codModeStatKeys[mode].map((key, i) => ({ key, label: codModes[mode].stats[i] }))].map(stat => <label key={stat.key}>{stat.label}<input type="number" min={0} max={stat.key === "kills" || stat.key === "deaths" ? 10000 : 1000000} step={1} required={stat.key === "kills" || stat.key === "deaths"} placeholder="Non disponibile" disabled={busy} value={player.stats[stat.key] ?? ""} onChange={e => updatePlayer(player.id, { stats: { ...player.stats, [stat.key]: e.target.value } })} /></label>)}</div>
            {players.length > 2 ? <button type="button" className="button button-ghost" disabled={busy} onClick={() => setPlayers(current => current.filter(p => p.id !== player.id))}>Rimuovi giocatore</button> : null}
          </fieldset>)}
          <button type="button" className="button button-ghost" disabled={busy || players.length >= 16} onClick={() => setPlayers(current => [...current, { id: crypto.randomUUID(), profile_id: "", nickname: "", team: 1, stats: {} }])}>+ Giocatore</button>
        </>}
        <p>{codModes[mode].stats.join(" · ")} · Uccisioni · Morti · Danni. I valori non visibili resteranno non disponibili.</p>
        {message ? <p className="form-message" role="alert">{message}</p> : null}
        <div className="modal-actions"><button className="button button-ghost" type="button" disabled={busy} onClick={onClose}>Annulla</button><button className="button button-primary" disabled={busy || (method === "photo" && !images.length)}>{busy ? "Preparazione…" : method === "photo" ? "Carica GB" : "Salva GB"}</button></div>
      </form>
    </section>
  </div>;
}

export default function CodGaming({ viewerId, profiles }: { viewerId: string; profiles: Profile[] }) {
  const { gbs, loading, error, setError, load } = useCodGbs();
  const [mode, setMode] = useState<CodMode>("hardpoint");
  const [showForm, setShowForm] = useState(false);
  const [retrying, setRetrying] = useState(false);
  async function retry(id: string) {
    if (!supabase || retrying) return;
    setRetrying(true);
    const { error: retryError } = await supabase.rpc("retry_cod_gb", { p_id: id });
    if (retryError) setError(retryError.message); else await load();
    setRetrying(false);
  }
  const name = (id: string) => profiles.find(p => p.id === id)?.display_name ?? "Giocatore";
  return <section className="page-section cod-page">
    <div className="cod-page-head"><div><p className="eyebrow dark">CALL OF DUTY · MW4</p><h1>Le nostre GB</h1></div></div>
    <button className="button button-primary cod-add-gb" type="button" onClick={() => setShowForm(true)} disabled={!viewerId}>+ Aggiungi GB</button>
    <p>Scoreboard elaborati ogni notte alle 03:00. Le statistiche vengono divise per modalità.</p>
    <CodNickname viewerId={viewerId} />
    <div className="cod-mode-tabs" aria-label="Modalità CDL">{Object.entries(codModes).map(([key, item]) => <button className="button button-ghost" key={key} aria-pressed={mode === key} onClick={() => setMode(key as CodMode)}>{item.label}</button>)}</div>
    <p className="cod-stat-note">{codModes[mode].stats.join(" · ")} · Uccisioni · Morti · K/D · Danni</p>
    {error ? <p role="alert">{error} <button className="button button-ghost" onClick={() => void load()}>Aggiorna</button></p> : null}
    {loading ? <p role="status">Caricamento GB…</p> : <div className="cod-gb-list">{gbs.filter(g => g.mode === mode).map(gb => <article className="cod-gb-card" key={gb.id}><div><h2>{gb.map_name}</h2><small>{new Date(gb.played_at).toLocaleString("it-IT")} · {gb.image_count ? `${gb.image_count} foto${gb.photos_deleted_at ? " · eliminate dopo elaborazione" : ""}` : "Inserita a mano"}</small></div><p className="cod-status">{statusLabels[gb.status]}</p>{gb.status === "processed" ? <><strong>{gb.team1_score} – {gb.team2_score}</strong><ul>{gb.players.filter(p => p.profile_id).map(p => <li key={p.profile_id}>{name(p.profile_id!)} · {p.kills} U / {p.deaths} M</li>)}</ul></> : null}{gb.review_note ? <p>{gb.review_note}</p> : null}{gb.status === "needs_review" && gb.created_by === viewerId ? <button className="button button-ghost" disabled={retrying} onClick={() => void retry(gb.id)}>Ho aggiornato il nick: riprova</button> : null}</article>)}{!gbs.some(g => g.mode === mode) && !error ? <div className="empty-board"><h2>Nessuna GB caricata</h2><p>Aggiungi gli scoreboard di una partita {codModes[mode].label}.</p></div> : null}</div>}
    {showForm ? <GbForm onClose={() => setShowForm(false)} onSaved={load} profiles={profiles} viewerId={viewerId} /> : null}
  </section>;
}
