"use client";

import { useState } from "react";
import type { Profile } from "@/lib/supabase";
import { codModes, codModeStatKeys, codRanking, type CodMode } from "@/lib/cod-gb";
import useCodGbs from "./useCodGbs";

export default function CodRanking({ profiles }: { profiles: Profile[] }) {
  const { gbs, loading, error, load } = useCodGbs();
  const [mode, setMode] = useState<CodMode>("hardpoint");
  const rows = codRanking(gbs, mode);
  const name = (id: string) => profiles.find(p => p.id === id)?.display_name ?? "Giocatore";
  return <section className="page-section cod-page cod-ranking-page" aria-label="Classifica MW4">
    <div className="cod-page-head"><p className="eyebrow dark">CALL OF DUTY · MW4</p><h1>Classifica MW4</h1></div>
    <p>Classifiche separate per modalità. Ordine per vittorie, poi K/D complessivo.</p>
    <div className="cod-mode-tabs" aria-label="Modalità classifica">{Object.entries(codModes).map(([key, item]) =>
      <button className="button button-ghost" type="button" key={key} aria-pressed={mode === key} onClick={() => setMode(key as CodMode)}>{item.label}</button>
    )}</div>
    {error ? <p role="alert">{error} <button className="button button-ghost" onClick={() => void load()}>Aggiorna</button></p> : null}
    {loading ? <p role="status">Caricamento classifica…</p> : !error && rows.length ? <>
      <div className="cod-table-wrap"><table className="cod-table">
        <caption>{codModes[mode].label}</caption>
        <thead><tr>{["Giocatore", "GB", "Vittorie", "Uccisioni", "Morti", "K/D", "Danni", ...codModes[mode].stats].map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>{rows.map(row => <tr key={row.profileId}>
          <th scope="row">{name(row.profileId)}</th><td>{row.games}</td><td>{row.wins}</td><td>{row.kills}</td><td>{row.deaths}</td>
          <td>{row.deaths ? (row.kills / row.deaths).toFixed(2) : row.kills ? "∞" : "—"}</td><td>{row.damage ?? "—"}</td>
          {codModeStatKeys[mode].map(key => <td key={key}>{row[key] ?? "—"}</td>)}
        </tr>)}</tbody>
      </table></div>
      <p>Sono incluse solo le GB elaborate e quelle inserite a mano. “—” indica una statistica non disponibile per tutte le partite.</p>
    </> : !loading && !error ? <div className="empty-board"><h2>Classifica {codModes[mode].label} ancora vuota</h2><p>I giocatori compariranno qui dopo la registrazione dei primi risultati.</p></div> : null}
  </section>;
}
