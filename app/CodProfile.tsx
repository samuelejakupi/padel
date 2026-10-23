"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import type { Profile } from "@/lib/supabase";
import { codModes, codModeStatKeys, codRanking, type CodGb, type CodMode } from "@/lib/cod-gb";
import { CodNickname } from "./CodGaming";
import useCodGbs from "./useCodGbs";
import styles from "./CodProfile.module.css";
import { codEmblems } from "@/lib/cod-emblems";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const kd = (kills: number, deaths: number) => deaths ? (kills / deaths).toFixed(2) : kills ? "∞" : "—";

function outcome(gb: CodGb, team: number) {
  if (gb.team1_score === null || gb.team2_score === null || gb.team1_score === gb.team2_score) return null;
  return (team === 1) === (gb.team1_score > gb.team2_score) ? "V" : "S";
}

export default function CodProfile({ profile, avatar }: { profile: Profile; avatar: ReactNode }) {
  const { gbs, loading, error, load } = useCodGbs();
  const badges = codEmblems(gbs);
  const earnedCount = badges.filter(b => b.holders.includes(profile.id)).length;
  const played = gbs
    .filter(gb => gb.status === "processed")
    .flatMap(gb => gb.players.filter(p => p.profile_id === profile.id).map(player => ({ gb, player })));
  const kills = played.reduce((sum, { player }) => sum + player.kills, 0);
  const deaths = played.reduce((sum, { player }) => sum + player.deaths, 0);
  const wins = played.filter(({ gb, player }) => outcome(gb, player.team) === "V").length;
  const modes = (Object.keys(codModes) as CodMode[]).map(mode => {
    const rows = codRanking(gbs, mode);
    const index = rows.findIndex(row => row.profileId === profile.id);
    return { mode, row: index >= 0 ? rows[index] : null, rank: index + 1, total: rows.length };
  });

  return <section className="page-section cod-page" aria-labelledby="cod-profile-title">
    <header className={styles.head}>
      {avatar}
      <div>
        <p className="eyebrow dark">CALL OF DUTY · MW4 · PROFILO</p>
        <h1 id="cod-profile-title">{profile.display_name}</h1>
      </div>
    </header>

    {error ? <p role="alert">{error} <button className="button button-ghost" onClick={() => void load()}>Aggiorna</button></p> : null}
    {loading ? <p role="status">Caricamento statistiche…</p> : <>
      <dl className={styles.totals}>
        <div><dt>GB</dt><dd>{played.length}</dd></div>
        <div><dt>Vittorie</dt><dd>{wins}</dd></div>
        <div><dt>% vittorie</dt><dd>{played.length ? `${Math.round(wins / played.length * 100)}%` : "—"}</dd></div>
        <div><dt>K/D</dt><dd>{kd(kills, deaths)}</dd></div>
        <div><dt>Uccisioni</dt><dd>{kills}</dd></div>
        <div><dt>Morti</dt><dd>{deaths}</dd></div>
      </dl>

      <section aria-labelledby="cod-profile-emblems-title">
        <h2 id="cod-profile-emblems-title" className={styles.title}>Emblemi MW4</h2>
        {error ? <p>Gli emblemi saranno disponibili quando i risultati verranno caricati.</p> : <>
          <p><strong>{earnedCount} / {badges.length} emblemi detenuti</strong> · Si aggiornano con i risultati delle GB. I pari merito condividono lo stesso emblema.</p>
          <ul className="cod-emblem-grid">{badges.map(b => {
            const isOwn = b.holders.includes(profile.id);
            return <li className={`cod-emblem-card${isOwn ? " cod-emblem-earned" : ""}`} key={b.id}>
              <Image src={`${basePath}/emblems/mw4/${b.id}.webp`} alt={`Emblema ricamato ${b.title}`} width={180} height={180} unoptimized />
              <h3>{b.title}</h3><p>{b.criterion}</p>
              <strong>{isOwn ? "Detenuto da te" : b.holders.length ? "Non detenuto" : "Da assegnare"}</strong>
              {isOwn && b.value !== null ? <small>{b.value === Infinity ? "∞" : b.value.toLocaleString("it-IT", { maximumFractionDigits: 2 })} {b.metric === "kd" ? "K/D" : "punti / partita"}</small> : null}
            </li>;
          })}</ul>
        </>}
      </section>

      <h2 className={styles.title}>Per modalità</h2>
      <div className={styles.modes}>
        {modes.map(({ mode, row, rank, total }) => <article key={mode} className={styles.mode}>
          <header><h3>{codModes[mode].label}</h3>{row ? <span>#{rank} su {total}</span> : null}</header>
          {row ? <dl>
            <div><dt>GB</dt><dd>{row.games}</dd></div>
            <div><dt>Vittorie</dt><dd>{row.wins}</dd></div>
            <div><dt>K/D</dt><dd>{kd(row.kills, row.deaths)}</dd></div>
            <div><dt>Danni</dt><dd>{row.damage ?? "—"}</dd></div>
            <div><dt>Punti medi</dt><dd>{row.score != null ? (row.score / row.games).toLocaleString("it-IT", { maximumFractionDigits: 1 }) : "—"}</dd></div>
            {codModeStatKeys[mode].map((key, i) => <div key={key}><dt>{codModes[mode].stats[i]}</dt><dd>{row[key] ?? "—"}</dd></div>)}
          </dl> : <p>Nessuna GB registrata in questa modalità.</p>}
        </article>)}
      </div>

      <h2 className={styles.title}>Ultime GB</h2>
      {played.length ? <ol className={styles.recent}>
        {played.slice(0, 8).map(({ gb, player }) => {
          const result = outcome(gb, player.team);
          return <li key={gb.id}>
            <b data-result={result ?? undefined}>{result ?? "–"}</b>
            <span><strong>{gb.map_name}</strong><small>{codModes[gb.mode].label} · {new Date(gb.played_at).toLocaleDateString("it-IT")}</small></span>
            <span className={styles.line}>{gb.team1_score}–{gb.team2_score}<small>{player.kills} U / {player.deaths} M</small></span>
          </li>;
        })}
      </ol> : <div className="empty-board"><h2>Nessuna GB giocata</h2><p>Le tue partite compariranno qui dopo la registrazione dei risultati.</p></div>}
    </>}

    <CodNickname viewerId={profile.id} />
  </section>;
}
