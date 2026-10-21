"use client";

import { useId } from "react";
import type { PadelMatch } from "@/lib/supabase";
import { filterMatchResults, type PeriodFilter, type ResultFilter } from "@/lib/padel-presentation";

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
