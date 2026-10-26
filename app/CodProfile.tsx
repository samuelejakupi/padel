"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import type { Profile } from "@/lib/supabase";
import { codKillDeathTotals, codKd, codModes, codModeStatKeys, codRanking, type CodGb, type CodMode } from "@/lib/cod-gb";
import { CodNickname } from "./CodGaming";
import { ProfileHeader, StatRow } from "./profile/parts";
import useCodGbs from "./useCodGbs";
import styles from "./CodProfile.module.css";
import { codEmblems } from "@/lib/cod-emblems";
import CabinetMarquee from "./CabinetMarquee";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";


function outcome(gb: CodGb, team: number) {
  if (gb.team1_score === null || gb.team2_score === null || gb.team1_score === gb.team2_score) return null;
  return (team === 1) === (gb.team1_score > gb.team2_score) ? "V" : "S";
}

export default function CodProfile({ profile, avatar, onEdit }: { profile: Profile; avatar: ReactNode; onEdit?: () => void }) {
  const { gbs, loading, error, load } = useCodGbs();
  const badges = codEmblems(gbs);
  const earnedCount = badges.filter(b => b.holders.includes(profile.id)).length;
  const played = gbs
    .filter(gb => gb.status === "processed")
    .flatMap(gb => gb.players.filter(p => p.profile_id === profile.id).map(player => ({ gb, player })));
  // Le morti non sempre ci sono (lo scoreboard non le mostra per tutti): senza,
  // al posto del K/D si mostrano le uccisioni.
  const { kills, deaths, kdKills, deathGames } = codKillDeathTotals(played.map(({ player }) => player));
  const wins = played.filter(({ gb, player }) => outcome(gb, player.team) === "V").length;
  const modes = (Object.keys(codModes) as CodMode[]).map(mode => {
    const rows = codRanking(gbs, mode);
    const index = rows.findIndex(row => row.profileId === profile.id);
    return { mode, row: index >= 0 ? rows[index] : null, rank: index + 1, total: rows.length };
  });
  // Il posto migliore fra le modalita giocate: va nella pastiglia.
  const bestMode = modes.filter(item => item.row).sort((a, b) => a.rank - b.rank)[0];
  const unplayed = modes.filter(item => !item.row).map(item => codModes[item.mode].label);
  const singleMode = modes.filter(item => item.row).length === 1;

  return <section className="page-section cod-page" aria-label={`Profilo MW4 di ${profile.display_name}`}>
    {error ? <p role="alert">{error} <button className="button button-ghost" onClick={() => void load()}>Aggiorna</button></p> : null}
    {loading ? <p role="status">Caricamento statistiche…</p> : <>
      {/* La stessa testata degli altri profili: chi sei, il tuo posto migliore,
          tre numeri e sotto altri tre. */}
      <div className="player-profile-head">
        <ProfileHeader eyebrow="MW4 · profilo" name={profile.display_name} avatar={avatar} onEdit={onEdit}
          pill={bestMode ? <><b>{bestMode.rank}°</b> su {bestMode.total} in {codModes[bestMode.mode].label}</> : "Nessuna GB ancora"}>
          <StatRow dark stats={[
            { label: "GB", value: played.length },
            { label: "Vittorie", value: played.length ? Math.round(wins / played.length * 100) : "—", unit: played.length ? "%" : undefined },
            deathGames ? { label: "K/D", value: codKd(kdKills, deaths, deathGames) } : { label: "Uccisioni", value: kills },
          ]} />
        </ProfileHeader>
        <StatRow stats={[
          { label: "Vinte", value: wins },
          ...(deathGames ? [
            { label: "Uccisioni", value: kills },
            { label: "Morti", value: deaths },
          ] : [
            { label: "Perse", value: played.length - wins },
            { label: "Kill a GB", value: played.length ? Math.round(kills / played.length) : "—" },
          ]),
        ]} />
      </div>

      <section className="player-trophies" aria-labelledby="cod-profile-emblems-title">
        <h2 id="cod-profile-emblems-title" className={styles.title}>Emblemi MW4</h2>
        {error ? <p>Gli emblemi saranno disponibili quando i risultati verranno caricati.</p> : <>
          <p><strong>{earnedCount} / {badges.length} emblemi detenuti</strong> · Si aggiornano con i risultati delle GB. I pari merito condividono lo stesso emblema.</p>
          {earnedCount ? <CabinetMarquee items={badges.filter(b => b.holders.includes(profile.id))} rowClassName="badge-grid" keyOf={b => b.id} renderItem={(b, ghost) => (
            <article className={`badge badge-${b.direction === "min" ? "bronze" : "gold"} is-unlocked`} tabIndex={ghost ? -1 : 0} aria-hidden={ghost || undefined} aria-label={ghost ? undefined : `${b.title}. ${b.criterion}. Detenuto da te.`}>
              <div className="badge-emblem" aria-hidden="true"><Image className="badge-art" src={`${basePath}/emblems/mw4/${b.id}.webp`} alt={`Emblema ricamato ${b.title}`} width={128} height={168} unoptimized /></div>
              <div className="badge-tooltip" role="tooltip"><strong>{b.title}</strong><p>{b.criterion}</p><span>Detenuto da te</span><small>{b.value === Infinity ? "∞" : b.value?.toLocaleString("it-IT", { maximumFractionDigits: 2 })} {b.metric === "kd" ? "K/D" : "punti / partita"}</small></div>
            </article>
          )} /> : <div className="player-trophies-empty"><p>Nessun emblema ancora conquistato.</p></div>}
          {earnedCount < badges.length ? <details className="cod-emblems-available"><summary>Emblemi disponibili ({badges.length - earnedCount})</summary><div className="badge-grid">{badges.filter(b => !b.holders.includes(profile.id)).map(b => {
            return <article className={`badge badge-${b.direction === "min" ? "bronze" : "gold"} is-locked`} key={b.id} tabIndex={0} aria-label={`${b.title}. ${b.criterion}. ${b.holders.length ? "Non detenuto" : "Da assegnare"}.`}>
              <div className="badge-emblem" aria-hidden="true"><Image className="badge-art" src={`${basePath}/emblems/mw4/${b.id}.webp`} alt={`Emblema ricamato ${b.title}`} width={128} height={168} unoptimized /></div>
              <div className="badge-tooltip" role="tooltip"><strong>{b.title}</strong><p>{b.criterion}</p><span>{b.holders.length ? "Non detenuto" : "Da assegnare"}</span></div>
            </article>;
          })}</div></details> : null}
        </>}
      </section>

      <h2 className={styles.title}>Per modalità</h2>
      <div className={styles.modes}>
        {modes.filter(item => item.row).map(({ mode, row, rank, total }) => <article key={mode} className={styles.mode}>
          {/* Con una modalita sola, posto, GB, vittorie e K/D sono gia in
              testata: qui restano i numeri propri della modalita. */}
          <header><h3>{codModes[mode].label}</h3>{row && !singleMode ? <span>#{rank} su {total}</span> : null}</header>
          {row ? <dl>
            {singleMode ? null : <>
              <div><dt>GB</dt><dd>{row.games}</dd></div>
              <div><dt>Vittorie</dt><dd>{row.wins}</dd></div>
              <div><dt>K/D</dt><dd>{codKd(row.kdKills, row.deaths, row.deathGames)}</dd></div>
            </>}
            <div><dt>Danni</dt><dd>{row.damage ?? "—"}</dd></div>
            <div><dt>Punti medi</dt><dd>{row.score != null ? (row.score / row.games).toLocaleString("it-IT", { maximumFractionDigits: 1 }) : "—"}</dd></div>
            {codModeStatKeys[mode].map((key, i) => <div key={key}><dt>{codModes[mode].stats[i]}</dt><dd>{row[key] ?? "—"}</dd></div>)}
          </dl> : null}
        </article>)}
      </div>
      {/* Le modalita mai giocate in una riga sola, non una card vuota a testa. */}
      {unplayed.length ? <p className={styles.unplayed}>Nessuna GB in {unplayed.length > 1 ? `${unplayed.slice(0, -1).join(", ")} e ${unplayed.at(-1)}` : unplayed[0]}.</p> : null}

      <h2 className={styles.title}>Ultime GB</h2>
      {played.length ? <ol className={styles.recent}>
        {played.slice(0, 8).map(({ gb, player }) => {
          const result = outcome(gb, player.team);
          return <li key={gb.id}>
            <b data-result={result ?? undefined}>{result ?? "–"}</b>
            <span><strong>{gb.map_name}</strong><small>{codModes[gb.mode].label} · {new Date(gb.played_at).toLocaleDateString("it-IT")}</small></span>
            <span className={styles.line}>{gb.team1_score}–{gb.team2_score}<small>{player.kills} kill{player.deaths != null ? ` · ${player.deaths} morti` : ""}</small></span>
          </li>;
        })}
      </ol> : <div className="empty-board"><h2>Nessuna GB giocata</h2><p>Le tue partite compariranno qui dopo la registrazione dei risultati.</p></div>}
    </>}

    <CodNickname viewerId={profile.id} />
  </section>;
}
