"use client";

import { useState } from "react";
import Image from "next/image";
import type { Profile } from "@/lib/supabase";
import { codModes, codModeStatKeys, codRanking, type CodMode } from "@/lib/cod-gb";
import useCodGbs from "./useCodGbs";
import { codEmblems } from "@/lib/cod-emblems";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export default function CodRanking({ profiles }: { profiles: Profile[] }) {
  const { gbs, loading, error, load } = useCodGbs();
  const [mode, setMode] = useState<CodMode>("hardpoint");
  const rows = codRanking(gbs, mode);
  const badges = codEmblems(gbs);
  const name = (id: string) => profiles.find(p => p.id === id)?.display_name ?? "Giocatore";
  return <section className="page-section cod-page cod-ranking-page" aria-label="Classifica MW4">
    <div className="cod-page-head"><p className="eyebrow dark">CALL OF DUTY · MW4</p><h1>Classifica MW4</h1></div>
    <p>Classifiche separate per modalità. Ordine per vittorie, poi K/D complessivo.</p>
    <div className="cod-mode-tabs" role="group" aria-label="Modalità classifica">{Object.entries(codModes).map(([key, item]) =>
      <button className="button button-ghost" type="button" key={key} aria-pressed={mode === key} onClick={() => setMode(key as CodMode)}>{item.label}</button>
    )}</div>
    {error ? <p role="alert">{error} <button className="button button-ghost" onClick={() => void load()}>Aggiorna</button></p> : null}
    {loading ? <p role="status">Caricamento classifica…</p> : !error && rows.length ? <>
      <div className="cod-table-wrap" tabIndex={0} role="region" aria-label={`Classifica ${codModes[mode].label}, scorre di lato`}><table className="cod-table">
        <caption>{codModes[mode].label}</caption>
        <thead><tr>{["Giocatore", "GB", "Vittorie", "Uccisioni", "Morti", "K/D", "Punti medi", "Danni", ...codModes[mode].stats].map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>{rows.map(row => <tr key={row.profileId}>
          <th scope="row">{name(row.profileId)}<span className="cod-player-emblems">{badges.filter(b => b.holders.includes(row.profileId)).map(b => <Image key={b.id} src={`${basePath}/emblems/mw4/${b.id}.webp`} alt={b.title} title={`${b.title}: ${b.criterion}`} width={20} height={22} unoptimized />)}</span></th><td>{row.games}</td><td>{row.wins}</td><td>{row.kills}</td><td>{row.deaths}</td>
          <td>{row.deaths ? (row.kills / row.deaths).toFixed(2) : row.kills ? "∞" : "—"}</td><td>{row.score != null ? (row.score / row.games).toLocaleString("it-IT", { maximumFractionDigits: 1 }) : "—"}</td><td>{row.damage ?? "—"}</td>
          {codModeStatKeys[mode].map(key => <td key={key}>{row[key] ?? "—"}</td>)}
        </tr>)}</tbody>
      </table></div>
      <p>Sono incluse solo le GB elaborate e quelle inserite a mano. “—” indica una statistica non disponibile per tutte le partite.</p>
    </> : !loading && !error ? <div className="empty-board"><h2>Classifica {codModes[mode].label} ancora vuota</h2><p>I giocatori compariranno qui dopo la registrazione dei primi risultati.</p></div> : null}
    {!loading && !error ? <section className="cod-emblems" aria-labelledby="cod-emblems-title">
      <div className="cod-emblems-head"><div><p className="eyebrow dark">I GRADI DEI THEBOYZ</p><h2 id="cod-emblems-title">Emblemi MW4</h2></div></div>
      <p>Assegnati sui risultati registrati, con pari merito condivisi. Le medie punti richiedono il punteggio individuale di tutte le partite; i due premi negativi richiedono almeno due giocatori con risultati diversi.</p>
      <ul className="cod-emblem-grid">{badges.map(badge => <li className={`cod-emblem-card${badge.holders.length ? " cod-emblem-earned" : ""}`} key={badge.id}>
        <Image src={`${basePath}/emblems/mw4/${badge.id}.webp`} alt={`Emblema ricamato ${badge.title}`} width={180} height={180} unoptimized />
        <h3>{badge.title}</h3><p>{badge.criterion}</p>
        <strong>{badge.holders.length ? badge.holders.map(name).join(" · ") : "Da assegnare"}</strong>
        {badge.value !== null ? <small>{badge.value === Infinity ? "∞" : badge.value.toLocaleString("it-IT", { maximumFractionDigits: 2 })} {badge.metric === "kd" ? "K/D" : "punti / partita"}</small> : null}
      </li>)}</ul>
    </section> : null}
  </section>;
}
