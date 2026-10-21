"use client";

import { useId } from "react";
import type { PadelMatch, PlannedMatch } from "@/lib/supabase";
import { filterMatchResults, type PeriodFilter, type ResultFilter } from "@/lib/padel-presentation";

export type TournamentSnapshotData = { position: number | null; played: number; total: number; done: boolean; participating: boolean; next: string | null };

export function TournamentSnapshot({ data, compact = false }: { data: TournamentSnapshotData; compact?: boolean }) {
  const remaining = Math.max(0, data.total - data.played);
  return <div className={`tournament-snapshot${compact ? " is-compact" : ""}`}>
    <span className="tournament-personal-position">{data.position ? <><b>#{data.position}</b><span>{data.done ? "il tuo piazzamento" : "la tua posizione"}</span></> : <><b>{data.done ? "FINITO" : "LIVE"}</b><span>{data.participating ? "in attesa dei risultati" : "segui il torneo"}</span></>}</span>
    <span className="tournament-completion"><b>{data.played}<small> / {data.total}</small></b><span>{data.done ? "partite concluse" : `${remaining} ${remaining === 1 ? "partita da giocare" : "partite da giocare"}`}</span></span>
    {!compact && !data.done ? <span className="tournament-next"><small>PROSSIMO IN CALENDARIO</small><b>{data.next ?? "Abbinamento da definire"}</b></span> : null}
  </div>;
}

export function MatchFilterBar({ matches, viewerId, viewerName, outcome, period, onOutcome, onPeriod }: {
  matches: PadelMatch[]; viewerId?: string; viewerName?: string;
  outcome: ResultFilter; period: PeriodFilter;
  onOutcome: (value: ResultFilter) => void; onPeriod: (value: PeriodFilter) => void;
}) {
  const id = useId();
  const choices: { value: ResultFilter; label: string }[] = [{ value: "all", label: "Tutte" }, { value: "wins", label: "Vittorie" }, { value: "losses", label: "Sconfitte" }, { value: "draws", label: "Pareggi" }];
  return <div className="match-filter-bar">
    <div className="match-filter-top"><span>{viewerName ? `Esiti personali · ${viewerName}` : "Esplora i risultati"}</span><label htmlFor={id}>Periodo <select id={id} value={period} onChange={(event) => onPeriod(event.target.value as PeriodFilter)}><option value="all">Tutto lo storico</option><option value="30">Ultimi 30 giorni</option><option value="90">Ultimi 90 giorni</option></select></label></div>
    <div className="match-outcome-filters" role="group" aria-label="Filtra per risultato personale">{choices.map(({ value, label }) => <button type="button" key={value} aria-pressed={outcome === value} onClick={() => onOutcome(value)} disabled={!viewerId && value !== "all"}>{label}<span>{filterMatchResults(matches, value, viewerId).length}</span></button>)}</div>
  </div>;
}

export function MatchFormSteps({ step, onBack }: { step: 1 | 2; onBack: () => void }) {
  return <nav className="match-form-steps" aria-label="Passaggi di registrazione">
    <button type="button" onClick={onBack} aria-current={step === 1 ? "step" : undefined}><b>{step === 2 ? "✓" : "1"}</b><span>Giocatori<small>Componi le squadre</small></span></button>
    <span className="match-step-connector" aria-hidden="true" />
    <span className={step === 2 ? "is-current" : ""} aria-current={step === 2 ? "step" : undefined}><b>2</b><span>Risultato<small>Data e punteggio</small></span></span>
  </nav>;
}

export function PadelToday({ last, planned, viewerId, tournament, onMatches, onTournaments }: {
  last?: PadelMatch; planned?: PlannedMatch; viewerId?: string;
  tournament?: { name: string; snapshot: TournamentSnapshotData };
  onMatches: () => void; onTournaments: () => void;
}) {
  const player = last?.players.find((entry) => entry.profile_id === viewerId);
  const delta = player?.rating_delta ?? 0;
  const result = !last ? "Il primo match ti aspetta" : last.winner_team === 0 ? "Un punto d’incontro" : last.winner_team === player?.team ? "Hai vinto l’ultima" : "La rivincita ti aspetta";
  const dateLabel = (date: string) => new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short" }).format(new Date(date));
  return <div className="padel-today" aria-label="Il tuo padel a colpo d’occhio">
    <button className="padel-today-card" type="button" onClick={onMatches}><span className="eyebrow dark">ULTIMO RISULTATO</span><strong>{result}</strong><span>{last ? `${dateLabel(last.played_at)} · ${last.sets.map((set) => player?.team === 2 ? `${set.team2_games}–${set.team1_games}` : `${set.team1_games}–${set.team2_games}`).join(" / ")}` : "Ritroverai qui il tuo risultato più recente"}</span><b className={delta < 0 ? "is-negative" : ""}>{last ? last.is_friendly ? "Amichevole" : `${delta >= 0 ? "+" : "−"}${Math.round(Math.abs(delta))} Elo dalla partita` : "Apri lo storico ↗"}</b></button>
    <button className="padel-today-card" type="button" onClick={onMatches}><span className="eyebrow dark">PROSSIMO INCONTRO</span><strong>{planned ? dateLabel(planned.played_at) : "Campo aperto alla prossima"}</strong><span>{planned ? planned.players.map((entry) => entry.profile.display_name).join(" · ") : "Nessuna tua partita programmata"}</span><b>{planned?.court || "Le partite del gruppo ↗"}</b></button>
    <button className="padel-today-card padel-today-tournament" type="button" onClick={onTournaments}><span className="eyebrow">IL TORNEO</span><strong>{tournament?.name ?? "La prossima coppa aspetta"}</strong>{tournament ? <TournamentSnapshot data={tournament.snapshot} compact /> : <><span>Nessun torneo in corso</span><b>Esplora i tornei ↗</b></>}</button>
  </div>;
}
