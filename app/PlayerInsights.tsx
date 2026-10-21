"use client";

import { type ReactNode, useId, useMemo, useRef, useState } from "react";
import type { PadelMatch, Profile } from "@/lib/supabase";
import { pairRecord, partnerInsights, PARTNER_MIN_MATCHES, recordWinRate, type PairRecord } from "@/lib/player-insights";

type Props = {
  player: Profile;
  profiles: Profile[];
  matches: PadelMatch[];
  viewerId?: string;
  renderAvatar: (profile: Profile) => ReactNode;
  renderMatch: (match: PadelMatch) => ReactNode;
};

function RecordStats({ record }: { record: PairRecord }) {
  const rate = recordWinRate(record);
  return <dl className="insights-stats">
    <div><dt>Vittorie</dt><dd>{record.wins}</dd></div>
    <div><dt>Sconfitte</dt><dd>{record.losses}</dd></div>
    <div><dt>Pareggi</dt><dd>{record.draws}</dd></div>
    <div><dt>Win rate</dt><dd>{rate === null ? "—" : `${rate}%`}</dd></div>
    <div><dt>Set fatti / subiti</dt><dd>{record.setsWon}<span> / {record.setsLost}</span></dd></div>
    <div><dt>Game fatti / subiti</dt><dd>{record.gamesWon}<span> / {record.gamesLost}</span></dd></div>
  </dl>;
}

export default function PlayerInsights({ player, profiles, matches, viewerId, renderAvatar, renderMatch }: Props) {
  const id = useId();
  const comparisonRef = useRef<HTMLElement>(null);
  const [otherId, setOtherId] = useState(viewerId !== player.id ? viewerId ?? "" : "");
  const [mode, setMode] = useState<"against" | "together">("against");
  const [scope, setScope] = useState<"ranked" | "all">("ranked");
  const [expanded, setExpanded] = useState(false);
  const [allPartners, setAllPartners] = useState(false);
  const eligibleMatches = useMemo(() => matches.filter((match) => scope === "all" || !match.is_friendly), [matches, scope]);
  const others = profiles.filter((profile) => profile.id !== player.id)
    .sort((a, b) => a.display_name.localeCompare(b.display_name, "it"));
  const partners = useMemo(() => partnerInsights(profiles, eligibleMatches, player.id), [profiles, eligibleMatches, player.id]);
  const recommended = partners.find(({ record }) => record.matches.length >= PARTNER_MIN_MATCHES && record.wins > 0);
  const other = others.find((profile) => profile.id === otherId) ?? others[0];
  const against = pairRecord(eligibleMatches, player.id, other?.id ?? "", false);
  const together = pairRecord(eligibleMatches, player.id, other?.id ?? "", true);
  const record = mode === "against" ? against : together;
  const visiblePartners = allPartners ? partners : partners.slice(0, 4);

  function comparePartner(profileId: string) {
    setOtherId(profileId);
    setMode("together");
    setExpanded(false);
    comparisonRef.current?.scrollIntoView({ block: "start" });
  }

  return <div className="player-insights">
    <div className="insights-heading">
      <div><p className="eyebrow dark">OLTRE LA CLASSIFICA</p><h2>Il gioco di coppia</h2></div>
      <label className="insights-scope">Partite considerate
        <select value={scope} onChange={(event) => { setScope(event.target.value as typeof scope); setExpanded(false); }}>
          <option value="ranked">Solo competitive</option><option value="all">Anche amichevoli</option>
        </select>
      </label>
    </div>
    <section className="insights-partners" aria-labelledby={`${id}-partners`}>
      <div className="insights-section-head"><div><p className="eyebrow dark">INTESA DI COPPIA</p><h3 id={`${id}-partners`}>Con chi funziona meglio?</h3></div><span>{partners.length} compagni</span></div>
      {recommended ? <button type="button" className="insights-recommendation" onClick={() => comparePartner(recommended.profile.id)}>
        <span className="insights-recommendation-copy"><span className="eyebrow">PARTNER CONSIGLIATO</span><strong>{recommended.profile.display_name}</strong><span>{recommended.record.wins} vittorie in {recommended.record.matches.length} partite insieme</span></span>
        {renderAvatar(recommended.profile)}
        <span className="insights-recommendation-rate"><b>{recordWinRate(recommended.record)}%</b><small>vittorie</small></span>
        <span className="insights-recommendation-link">Esplora l’intesa <span aria-hidden="true">↗</span></span>
      </button> : <p className="insights-empty">L’intesa si costruisce in campo. Servono almeno {PARTNER_MIN_MATCHES} partite insieme e una vittoria per consigliare un partner.</p>}
      {partners.length ? <>
        <div className="insights-partner-list">{visiblePartners.map(({ profile, record: pair }) => {
          const rate = recordWinRate(pair);
          return <button type="button" className="insights-partner-row" key={profile.id} onClick={() => comparePartner(profile.id)} aria-label={`Confronta ${player.display_name} e ${profile.display_name} insieme`}>
            {renderAvatar(profile)}<span className="insights-partner-name"><b>{profile.display_name}</b><small>{pair.matches.length} partite · {pair.wins} V / {pair.losses} S / {pair.draws} P</small></span>
            <span className="insights-sample">{pair.matches.length >= PARTNER_MIN_MATCHES ? "Collaudata" : "Da provare"}</span>
            <strong>{rate === null ? "—" : `${rate}%`}</strong><span aria-hidden="true">↗</span>
          </button>;
        })}</div>
        {partners.length > 4 ? <button className="button button-ghost" type="button" aria-expanded={allPartners} onClick={() => setAllPartners(!allPartners)}>{allPartners ? "Mostra meno compagni" : `Tutti i ${partners.length} compagni`}</button> : null}
        <p className="insights-note">Prima le coppie con almeno {PARTNER_MIN_MATCHES} partite, poi la percentuale di vittorie. I pareggi sono esclusi dal win rate. L’intesa dipende anche dagli avversari incontrati.</p>
      </> : null}
    </section>
    <section className="insights-comparison" ref={comparisonRef} aria-labelledby={`${id}-comparison`}>
      <div className="insights-section-head"><div><p className="eyebrow dark">FACCIA A FACCIA</p><h3 id={`${id}-comparison`}>Due giocatori, tutta la storia.</h3></div></div>
      {other ? <>
        <div className="insights-versus"><div className="insights-person">{renderAvatar(player)}<b>{player.display_name}</b></div><span className="insights-versus-mark" aria-hidden="true">{mode === "against" ? "VS" : "+"}</span>
          <div className="insights-person">{renderAvatar(other)}<label htmlFor={`${id}-other`}>Confronta con</label><select id={`${id}-other`} value={other.id} onChange={(event) => { setOtherId(event.target.value); setExpanded(false); }}>{others.map((profile) => <option key={profile.id} value={profile.id}>{profile.display_name}</option>)}</select></div>
        </div>
        <div className="insights-modes" aria-label="Tipo di confronto">
          <button type="button" aria-pressed={mode === "against"} onClick={() => { setMode("against"); setExpanded(false); }}>Contro <span>{against.matches.length}</span></button>
          <button type="button" aria-pressed={mode === "together"} onClick={() => { setMode("together"); setExpanded(false); }}>Insieme <span>{together.matches.length}</span></button>
        </div>
        <div aria-live="polite" aria-atomic="true" className="insights-record">
          <p className="insights-perspective">{mode === "against" ? `I risultati di ${player.display_name} contro ${other.display_name}` : `I risultati di ${player.display_name} e ${other.display_name} insieme`} · {record.matches.length} partite</p>
          {record.matches.length ? <><RecordStats record={record} /><p className="insights-note">Win rate sulle partite con un vincitore. I game dei set interrotti contano; i set interrotti e quelli successivi al 2–0 non assegnano set vinti.</p></> : <p className="insights-empty">{mode === "against" ? "Nessuno scontro diretto, per ora. Il primo capitolo si scrive in campo." : "Questa coppia deve ancora esordire. La prossima partita potrebbe essere quella giusta."}</p>}
        </div>
        {record.matches.length ? <details className="insights-history" open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)}>
          <summary>Le partite del confronto <span>{record.matches.length}</span></summary>
          {expanded ? <div className="match-list match-list-full">{record.matches.map((match) => <div key={match.id}>{renderMatch(match)}</div>)}</div> : null}
        </details> : null}
      </> : <p className="insights-empty">Il confronto sarà disponibile quando ci sarà un altro giocatore.</p>}
    </section>
  </div>;
}
