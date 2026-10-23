"use client";

import { Fragment, FormEvent, useEffect, useRef, useState } from "react";
import { type MatchEvent, type PadelMatch, type PadelSet, type PlannedMatch, type Profile, supabase } from "@/lib/supabase";
import { MatchFormSteps } from "../PadelPresentation";
import { BottomSheet } from "../BottomSheet";
import { PADEL_COURTS, countedSets, decidedSets, setIsComplete, setIsIncomplete } from "../core";
import { youtubeId } from "./emblems";
import { canDeleteMatch, canEditMatch, matchChangeSummary, matchWindowLeft } from "./matches";
import { TournamentMatchContext, TournamentTrophyBadge } from "./tournaments";
import { Avatar } from "../ui";

// Riassunto leggibile del risultato: è ciò che finisce nello storico, così
// una riga vecchia resta comprensibile anche se poi cambiano nomi e squadre.
export function matchSummary(profiles: Profile[], playerIds: string[], sets: PadelSet[]) {
  const name = (id: string) => profiles.find((profile) => profile.id === id)?.display_name ?? "?";
  const team1 = playerIds.slice(0, 2).map(name).join(" · ");
  const team2 = playerIds.slice(2, 4).map(name).join(" · ");
  const countedSetNumbers = new Set(countedSets(sets).map((set) => set.set_number));
  const score = sets
    .map((set) => `${set.team1_games}-${set.team2_games}${!countedSetNumbers.has(set.set_number)
      ? " (fuori partita)" : setIsIncomplete(set) ? " (interrotto)" : ""}`)
    .join(" ");
  return `${team1} vs ${team2} · ${score}`;
}

// Legge il tabellone scritto nel modulo. Nel meglio dei tre il 2-0 chiude
// la partita: un terzo set e valido solo se i primi due sono stati divisi.
export function readMatchScore(scores: string[][]) {
  const filled = scores
    .map(([team1, team2], index) => ({ index, team1, team2 }))
    .filter((row) => row.team1 !== "" && row.team2 !== "");
  const lastIndex = filled.length - 1;
  const sets: PadelSet[] = filled.map((row, position) => {
    const team1Games = Number(row.team1);
    const team2Games = Number(row.team2);
    return {
      set_number: position + 1,
      team1_games: team1Games,
      team2_games: team2Games,
      // Solo l'ultimo set puo essere interrotto: una partita non riprende
      // dopo essersi fermata.
      incomplete: position === lastIndex && !setIsComplete(team1Games, team2Games),
    };
  });
  const decided = decidedSets(sets);
  const team1Sets = decided.filter((set) => set.team1_games > set.team2_games).length;
  const team2Sets = decided.filter((set) => set.team2_games > set.team1_games).length;
  const firstTwoSets = sets.slice(0, 2);
  const finishedInTwo = firstTwoSets.length === 2
    && firstTwoSets.every((set) => !setIsIncomplete(set))
    && (firstTwoSets.every((set) => set.team1_games > set.team2_games)
      || firstTwoSets.every((set) => set.team2_games > set.team1_games));
  const singleSetMatch = sets.length === 1 && team1Sets + team2Sets === 1;
  const standardMatch = sets.length >= 2
    && Math.max(team1Sets, team2Sets) <= 2
    && (Math.max(team1Sets, team2Sets) === 2 || (team1Sets === 1 && team2Sets === 1))
    && (sets.length === 2 || !finishedInTwo);
  const valid = sets.length >= 1
    && sets.every((set) => Number.isInteger(set.team1_games) && Number.isInteger(set.team2_games)
      && set.team1_games >= 0 && set.team2_games >= 0
      && set.team1_games <= 20 && set.team2_games <= 20)
    && (singleSetMatch || standardMatch);
  return {
    sets,
    team1Sets,
    team2Sets,
    valid,
    finishedInTwo,
    draw: valid && team1Sets === 1 && team2Sets === 1,
    unfinishedSet: sets.find(setIsIncomplete) ?? null,
  };
}

// Giorno e mese soltanto, come sulle card delle partite: l'anno di una partita
// giocata la settimana scorsa non lo cerca nessuno.
export function matchDayLabel(iso: string) {
  const day = new Intl.DateTimeFormat("it-IT", { day: "2-digit" }).format(new Date(`${iso}T12:00:00`));
  const month = new Intl.DateTimeFormat("it-IT", { month: "short" }).format(new Date(`${iso}T12:00:00`)).replace(".", "");
  return `${day} ${month.toUpperCase()}`;
}

// Il calendario. Disegnato a tratto come le altre icone dell'app e non preso da
// una libreria: due pesi diversi di linea nella stessa riga si vedono.
export function CalendarGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" />
    </svg>
  );
}

// Il segno di YouTube: grigio finche un video non c'e, rosso quando c'e. E
// l'unico posto dell'app dove il rosso non vuol dire "attenzione" ma "e quello
// di YouTube", quindi il colore sta scritto qui e non fra i colori di casa.
export function YouTubeGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2" y="5" width="20" height="14" rx="4.5" fill="currentColor" />
      <path d="M10 8.8 15.6 12 10 15.2z" fill="var(--white)" />
    </svg>
  );
}

export function NewMatchModal({
  profiles,
  match,
  viewerId,
  plannedMatch,
  plannedMatchesReady,
  tournamentContext,
  onClose,
  onSaved,
  onDeleted,
}: {
  profiles: Profile[];
  match?: PadelMatch | null;
  // Chi sta guardando: da lui dipende se questo foglio e un modulo da riempire,
  // una scheda da leggere, o una scheda con sotto il tasto rosso.
  viewerId?: string | null;
  plannedMatch?: PlannedMatch | null;
  plannedMatchesReady?: boolean;
  tournamentContext?: TournamentMatchContext | null;
  onClose: () => void;
  onSaved: (kind: "result" | "planned") => void;
  onDeleted: () => void;
}) {
  const editing = Boolean(match);
  const completingPlanned = Boolean(plannedMatch);
  // Le due regole, lette una volta all'apertura del foglio: correggere e di chi
  // ha giocato, per 24 ore; eliminare e di chi ha registrato, per sempre. Il
  // controllo vero sta sul database (migration-permessi-partite.sql): qui
  // servono solo a non mostrare comandi che poi verrebbero rifiutati.
  const canEdit = !match || canEditMatch(match, viewerId);
  const canDelete = Boolean(match) && canDeleteMatch(match as PadelMatch, viewerId);
  const windowLeft = match ? matchWindowLeft(match) : null;
  const initialPlayers = match
    ? [
        ...match.players.filter((player) => player.team === 1).map((player) => player.profile_id),
        ...match.players.filter((player) => player.team === 2).map((player) => player.profile_id),
      ]
    : plannedMatch
      ? [
          ...plannedMatch.players.filter((player) => player.team === 1).map((player) => player.profile_id),
          ...plannedMatch.players.filter((player) => player.team === 2).map((player) => player.profile_id),
        ]
      : tournamentContext?.playerIds ?? ["", "", "", ""];
  // Quante righe ha il tabellone. Tre di regola; una sola quando il torneo si
  // gioca al set secco, perche la seconda riga sarebbe una casella che il
  // database rifiuta.
  const setRows = tournamentContext?.setsFormat === 1 ? 1 : 3;
  const initialScores = Array.from({ length: setRows }, (_, index) => {
    const set = match ? [...match.sets].sort((a, b) => a.set_number - b.set_number)[index] : null;
    return set ? [String(set.team1_games), String(set.team2_games)] : ["", ""];
  });

  const [players, setPlayers] = useState(initialPlayers);
  const [randomTeams, setRandomTeams] = useState(false);
  const [formStep, setFormStep] = useState<1 | 2>(1);
  const twoStepForm = !editing && !completingPlanned && !tournamentContext && !randomTeams;
  const [friendly, setFriendly] = useState(match?.is_friendly ?? false);
  const [scores, setScores] = useState(initialScores);
  const [playedAt, setPlayedAt] = useState(
    match || plannedMatch
      ? new Date((match ?? plannedMatch)!.played_at).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10),
  );
  const [notes] = useState(match?.notes ?? plannedMatch?.notes ?? "");
  const [videoUrl, setVideoUrl] = useState(match?.video_url ?? "");
  const [court, setCourt] = useState(match?.court ?? plannedMatch?.court ?? "");
  // Data e video stanno chiusi dietro a un segno e si aprono solo se li tocchi:
  // la data giusta e quasi sempre oggi e il video quasi sempre non c'e, quindi
  // due righe di modulo aperte a vuoto sono due righe che nessuno riempie.
  const [showDate, setShowDate] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  // Le sei caselle del tabellone, per passare da sola alla successiva.
  const scoreRefs = useRef<(HTMLInputElement | null)[]>([]);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  // Quando una cifra sola potrebbe diventarne due (l'1 e il 2 aprono a 10-20)
  // il salto aspetta un attimo: se la seconda cifra arriva si scrive 10, se non
  // arriva si passa avanti lo stesso. Senza attesa un 6-2 costringerebbe a
  // tornare indietro col dito; con un'attesa su tutte le cifre un 6-4 sembra
  // lento.
  const jumpTimer = useRef(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [historyReady, setHistoryReady] = useState(true);

  // Lo storico si appende alla discendenza, non all'id: una partita modificata
  // cambia id ogni volta (vedi migration-storico-partite.sql).
  useEffect(() => {
    if (!match || !supabase) return;
    let alive = true;
    void (async () => {
      const { data: row, error: lineageError } = await supabase
        .from("matches")
        .select("lineage_id")
        .eq("id", match.id)
        .maybeSingle();
      if (lineageError) {
        if (alive) setHistoryReady(false);
        return;
      }
      const lineage = (row?.lineage_id as string | null) ?? match.id;
      const { data, error: eventsError } = await supabase
        .from("match_events")
        .select("id, lineage_id, kind, author_id, comment, summary, created_at")
        .eq("lineage_id", lineage)
        .order("created_at", { ascending: true });
      if (!alive) return;
      if (eventsError) {
        setHistoryReady(false);
        return;
      }
      setEvents((data ?? []) as MatchEvent[]);
    })();
    return () => { alive = false; };
  }, [match]);

  function updatePlayer(index: number, id: string) {
    setPlayers((current) => current.map((value, playerIndex) => (playerIndex === index ? id : value)));
  }

  function toggleParticipant(id: string) {
    setPlayers((current) => current.includes(id)
      ? current.filter((playerId) => playerId !== id)
      : current.length < 4 ? [...current, id] : current);
  }

  useEffect(() => () => window.clearTimeout(jumpTimer.current), []);

  // Il tabellone si riempie da sinistra a destra e si passa avanti da soli.
  // L'ultima casella non salta da nessuna parte: li il gesto dopo e salvare.
  function jumpToNext(index: number) {
    const next = scoreRefs.current[index + 1];
    if (!next) return;
    next.focus();
    next.select();
  }

  function updateScore(setIndex: number, teamIndex: number, value: string) {
    setScores((current) => {
      const next = current.map((set, index) =>
        index === setIndex ? set.map((score, team) => (team === teamIndex ? value : score)) : set,
      );
      if (next.length === 3 && readMatchScore(next.slice(0, 2)).finishedInTwo) {
        next[2] = ["", ""];
      }
      return next;
    });

    // Ogni cifra battuta annulla il salto in attesa: se ne sta arrivando una
    // seconda, e la coppia a valere.
    window.clearTimeout(jumpTimer.current);
    const box = setIndex * 2 + teamIndex;
    if (!value) return;
    // Due cifre sono un numero finito, e piu di due non ne accetta.
    if (value.length >= 2) {
      jumpToNext(box);
      return;
    }
    // Una cifra sola: dal 3 in su, e lo zero, non possono diventare un numero
    // valido piu lungo, quindi il salto e immediato.
    if (value !== "1" && value !== "2") {
      jumpToNext(box);
      return;
    }
    // L'1 e il 2 invece aprono a 10-20: si aspetta la seconda cifra, e se non
    // arriva si passa avanti lo stesso.
    jumpTimer.current = window.setTimeout(() => jumpToNext(box), 550);
  }

  // Lo stesso conteggio che poi finisce nel salvataggio: qui serve solo a
  // dire come sta finendo la partita mentre la si scrive.
  const preview = readMatchScore(scores);
  // I nomi di una squadra del modulo ("Dani · Samu"), per le colonne dei set.
  const teamLabelOf = (team: number) => {
    const names = players.slice(team * 2, team * 2 + 2).map((id) => profiles.find((profile) => profile.id === id)?.display_name).filter(Boolean);
    return names.length ? names.join(" · ") : `Squadra ${team + 1}`;
  };

  function showMatchStep(next: 1 | 2) {
    window.clearTimeout(jumpTimer.current);
    setError("");
    setFormStep(next);
    window.requestAnimationFrame(() => stepHeadingRef.current?.focus());
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (players.length !== 4 || new Set(players).size !== 4 || players.some((id) => !id)) {
      setError(randomTeams ? "Seleziona esattamente quattro partecipanti." : "Scegli quattro giocatori diversi.");
      return;
    }

    if (twoStepForm && formStep === 1) {
      showMatchStep(2);
      return;
    }

    if (randomTeams) {
      if (!supabase) {
        setError("Il database non è disponibile.");
        return;
      }
      setBusy(true);
      const { error: plannedError } = await supabase.rpc("create_random_match", {
        p_played_at: new Date(`${playedAt}T20:00:00`).toISOString(),
        p_participants: players,
        p_court: court.trim() || null,
        p_notes: notes.trim() || null,
      });
      if (plannedError) {
        setError(plannedError.message.includes("create_random_match")
          ? "Per creare squadre casuali esegui la migrazione migration-partite-casuali.sql in Supabase."
          : plannedError.message);
        setBusy(false);
        return;
      }
      onSaved("planned");
      setBusy(false);
      return;
    }

    const { sets, valid, draw } = readMatchScore(scores);
    if (!valid) {
      setError("Il meglio dei tre termina 2-0 o 2-1. Se avete interrotto il terzo set, registra un set a testa e il punteggio parziale.");
      return;
    }
    // Il girone all'italiana assegna i punti sulle vittorie: finche non
    // decidiamo quanto vale un pareggio li dentro, il torneo lo rifiuta.
    if (draw && tournamentContext) {
      setError("Una partita di torneo non può finire in pareggio: serve una squadra vincitrice.");
      return;
    }

    const cleanVideo = videoUrl.trim();
    if (cleanVideo && !youtubeId(cleanVideo)) {
      setError("Il link del video deve essere un indirizzo YouTube valido.");
      return;
    }

    setBusy(true);
    if (supabase) {
      if (plannedMatch) {
        const { error: completionError } = await supabase.rpc(friendly ? "complete_random_friendly_match" : "complete_random_match", {
          p_planned_match_id: plannedMatch.id,
          p_sets: sets,
          p_notes: notes.trim() || null,
          p_video_url: cleanVideo || null,
        });
        if (completionError) {
          setError(completionError.message);
          setBusy(false);
          return;
        }
        onSaved("result");
        setBusy(false);
        return;
      }
      // Modificare = rimuovere e riregistrare: delete_match e record_match
      // ricalcolano entrambi l'Elo, quindi la classifica resta coerente.
      let lineage: string | null = null;
      if (match) {
        const { data: row } = await supabase
          .from("matches")
          .select("lineage_id")
          .eq("id", match.id)
          .maybeSingle();
        lineage = (row?.lineage_id as string | null) ?? match.id;
        // La porta della correzione, non quella dell'eliminazione: qui la
        // partita esce soltanto perche sta per rientrare corretta, e a passarci
        // sono tutti quelli che hanno giocato.
        // Lo stato della votazione MVP si mette da parte adesso: voti e MVP
        // sono appesi all'id della partita con on delete cascade, e fra due
        // righe quell'id non esiste piu. Se la migrazione non e stata
        // eseguita la chiamata fallisce da sola e non blocca la correzione.
        await supabase.rpc("stash_match_mvp", { p_match_id: match.id });
        const { error: deleteError } = await supabase.rpc("delete_match_for_edit", { p_match_id: match.id });
        if (deleteError) {
          setError(deleteError.message);
          setBusy(false);
          return;
        }
      }
      const { data: newId, error: rpcError } = await supabase.rpc(friendly ? "record_friendly_match" : "record_match", {
        p_played_at: new Date(`${playedAt}T20:00:00`).toISOString(),
        p_team1: players.slice(0, 2),
        p_team2: players.slice(2, 4),
        p_sets: sets,
        p_notes: notes.trim() || null,
        p_video_url: cleanVideo || null,
      });
      if (rpcError) {
        setError(rpcError.message);
        setBusy(false);
        return;
      }

      // Lo storico è un di più: se la migrazione non è stata eseguita la
      // partita resta salvata comunque, senza bloccare nulla.
      const matchId = typeof newId === "string" ? newId : null;

      // Correggere una partita la elimina e la ricrea: senza questo passaggio
      // la riga nuova sembra una partita appena giocata e la votazione MVP
      // riparte da zero — un MVP gia assegnato sparisce e un voto gia chiuso
      // si riapre. restore_match_mvp riporta sulla riga nuova quello che
      // c'era: voti, MVP, chiusura e istante di apertura.
      if (matchId && match && !friendly) {
        const { error: mvpCarryError } = await supabase.rpc("restore_match_mvp", {
          p_old_match_id: match.id,
          p_new_match_id: matchId,
        });
        // Finche migration-mvp-correzione.sql non e stata eseguita resta il
        // comportamento di prima: almeno l'esclusione storica non si perde.
        if (mvpCarryError && match.mvp_voting_enabled === false) {
          await supabase.rpc("disable_match_mvp_voting", { p_match_id: matchId });
        }
      }

      if (matchId && tournamentContext) {
        const { error: tournamentError } = await supabase.rpc("assign_tournament_match", {
          p_fixture_id: tournamentContext.fixtureId,
          p_match_id: matchId,
        });
        if (tournamentError) {
          // Se l'aggancio fallisce, rimuove il risultato appena creato: una
          // partita di torneo non deve restare per errore come match normale.
          await supabase.rpc("delete_match", { p_match_id: matchId });
          setError(tournamentError.message);
          setBusy(false);
          return;
        }
      }

      // Come lo storico, anche il campo da gioco e opzionale: se la
      // migrazione non e stata eseguita la partita resta comunque salvata.
      if (matchId) {
        await supabase.rpc("set_match_court", { p_match_id: matchId, p_court: court.trim() || null });
      }

      // record_match calcola il delta sui rating del momento, non su quelli
      // che i giocatori avevano alla data della partita: senza questo
      // ricalcolo, correggere una partita vecchia cambia i punti assegnati.
      // Anche questa e opzionale: se la migrazione manca, resta il
      // comportamento di prima.
      await supabase.rpc("recalculate_padel_ratings");

      if (matchId && historyReady) {
        if (lineage) {
          await supabase.rpc("set_match_lineage", { p_match_id: matchId, p_lineage_id: lineage });
        }
        const { data: auth } = await supabase.auth.getUser();
        await supabase.from("match_events").insert({
          lineage_id: lineage ?? matchId,
          match_id: matchId,
          kind: match ? "edited" : "created",
          author_id: auth.user?.id ?? null,
          // Cosa e cambiato lo scrive il registro da solo, confrontando il
          // prima con il dopo: la casella da riempire a mano restava vuota
          // quasi sempre, e quando non lo era ripeteva il punteggio.
          comment: match
            ? matchChangeSummary(match, {
                playerIds: players,
                sets,
                playedAt,
                court,
                videoUrl: cleanVideo,
                notes,
              }, profiles)
            : null,
          summary: matchSummary(profiles, players, sets),
        });
      }
    }
    onSaved("result");
    setBusy(false);
  }

  async function removeMatch() {
    if (!match || !supabase || !window.confirm("Eliminare definitivamente questa partita? La classifica verrà ricalcolata.")) return;
    setError("");
    setBusy(true);
    const { error: deleteError } = await supabase.rpc("delete_match", { p_match_id: match.id });
    if (deleteError) {
      setError(deleteError.message);
      setBusy(false);
      return;
    }
    onDeleted();
  }

  return (
    // Lo stesso foglio dal basso di partite e classifica, non piu un riquadro
    // al centro dello schermo: registrare un risultato e una delle cose che
    // si fanno da qui dentro, non un'altra schermata. Niente crocetta — si
    // chiude trascinando in giu o toccando fuori, come tutti gli altri
    // fogli — e niente occhiello sopra al titolo: il titolo dice gia tutto.
    <BottomSheet
      title={editing ? "Modifica la partita" : completingPlanned ? "Inserisci il risultato" : "Registra una partita"}
      onClose={onClose}
    >
      <form className="sheet-form match-registration-form" onSubmit={save} noValidate={twoStepForm && formStep === 1}>
          {twoStepForm ? <MatchFormSteps step={formStep} onBack={() => showMatchStep(1)} /> : null}
          {twoStepForm ? <div className="match-form-step-title" aria-live="polite"><p className="eyebrow dark">PASSO {formStep} DI 2</p><h3 ref={stepHeadingRef} tabIndex={-1}>{formStep === 1 ? "Chi è sceso in campo?" : "Com’è andata?"}</h3><p>{formStep === 1 ? "Scegli quattro giocatori, due per squadra." : "Controlla le squadre e inserisci il punteggio."}</p></div> : null}
          {twoStepForm && formStep === 2 ? <div className="match-selected-teams">{[0, 2].map((start) => <span key={start}>{players.slice(start, start + 2).map((id) => { const profile = profiles.find((entry) => entry.id === id); return profile ? <span key={id}><Avatar profile={profile} size="sm" /><b>{profile.display_name}</b></span> : null; })}</span>)}<button className="button button-ghost" type="button" onClick={() => showMatchStep(1)}>Cambia squadre</button></div> : null}
          {tournamentContext ? (
            <div className="tournament-match-banner">
              <TournamentTrophyBadge kind="cup" compact />
              <span><small>PARTITA DI TORNEO · ELO ×{tournamentContext.eloMultiplier}</small><b>{tournamentContext.tournamentName}</b></span>
            </div>
          ) : null}
          {/* Passate le 24 ore il foglio resta, ma diventa una scheda da
              leggere: sotto c'e lo storico, che dice tutto quello che c'e da
              sapere su come si e arrivati a questo risultato. */}
          {!canEdit ? (
            <p className="match-locked">
              <b>Il risultato è chiuso.</b>
              Le correzioni restano aperte 24 ore dalla registrazione, e solo per chi ha giocato.
            </p>
          ) : null}
          {canEdit ? (
          <>
          {/* Quando, dove e il video. Sono le tre cose che quasi sempre restano
              come sono — la data e oggi, il campo e quello di sempre, il video
              non c'e — quindi non prendono tre righe di modulo con la loro
              etichetta ciascuna: stanno in fila come i segni in cima a una card
              di partita, e si aprono solo se le tocchi. */}
          <div className="match-form-step-content" hidden={twoStepForm && formStep === 1}>
          <div className="match-form-meta">
            <button
              type="button"
              className={`match-form-day${showDate ? " is-open" : ""}`}
              onClick={() => setShowDate((open) => !open)}
              disabled={completingPlanned}
              aria-expanded={showDate}
              aria-label={`Data della partita: ${matchDayLabel(playedAt)}. Tocca per cambiarla`}
            >
              <CalendarGlyph />
              <b>{matchDayLabel(playedAt)}</b>
            </button>
            {/* Il campo si sceglie, non si scrive: gli stessi centri del
                tabellone dei campi liberi. Scritto a mano usciva ogni volta un
                po' diverso, e le statistiche per campo non stavano in piedi. */}
            <select
              className={`match-form-court${court ? "" : " is-empty"}`}
              value={court}
              onChange={(e) => setCourt(e.target.value)}
              disabled={completingPlanned}
              aria-label="Campo"
            >
              <option value="">Campo</option>
              {PADEL_COURTS.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
            {!randomTeams ? (
              <button
                type="button"
                className={`match-form-yt${videoUrl ? " is-set" : ""}`}
                onClick={() => setShowVideo((open) => !open)}
                aria-expanded={showVideo}
                aria-label={videoUrl ? "Video collegato. Tocca per cambiarlo" : "Collega un video YouTube"}
                title={videoUrl || "Collega un video YouTube"}
              >
                <YouTubeGlyph />
              </button>
            ) : null}
          </div>
          {showDate ? (
            <input
              className="match-form-date-field"
              type="date"
              value={playedAt}
              onChange={(e) => setPlayedAt(e.target.value)}
              required
              disabled={completingPlanned}
              aria-label="Data della partita"
            />
          ) : null}
          {showVideo && !randomTeams ? (
            <input
              className="match-form-video-field"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="https://youtu.be/..."
              inputMode="url"
              aria-label="Link del video YouTube"
            />
          ) : null}
          {!tournamentContext && !match?.tournament_fixture_id && !randomTeams ? (
            <label className="random-teams-toggle">
              <input type="checkbox" checked={friendly} onChange={(event) => setFriendly(event.target.checked)} />
              <span><b>Amichevole</b></span>
            </label>
          ) : null}
          </div>
          <div className="match-form-step-content" hidden={twoStepForm && formStep === 2}>
          {!editing && !tournamentContext && !completingPlanned ? (
            <label className="random-teams-toggle">
              <input
                type="checkbox"
                checked={randomTeams}
                disabled={plannedMatchesReady === false}
                onChange={(event) => {
                  setRandomTeams(event.target.checked);
                  setFriendly(false);
                  setPlayers(event.target.checked ? [] : ["", "", "", ""]);
                }}
              />
              <span>
                <b>Crea squadre casualmente</b>
                <small>{plannedMatchesReady === false
                  ? "Richiede la migrazione migration-partite-casuali.sql."
                  : "Seleziona i partecipanti: le due coppie verranno estratte alla conferma."}</small>
              </span>
            </label>
          ) : null}
          {randomTeams ? (
            <fieldset className="random-participants">
              <legend>Partecipanti <span>{players.length}/4</span></legend>
              <div>
                {profiles.map((profile) => {
                  const selected = players.includes(profile.id);
                  return (
                    <label key={profile.id} className={selected ? "is-selected" : ""}>
                      <input type="checkbox" checked={selected} onChange={() => toggleParticipant(profile.id)} />
                      <Avatar profile={profile} size="sm" />
                      <b>{profile.display_name}</b>
                      <i aria-hidden="true">✓</i>
                    </label>
                  );
                })}
              </div>
              <p>Alla conferma verranno create due squadre casuali da due giocatori.</p>
            </fieldset>
          ) : (
            <div className="match-form-teams">
              {[1, 2].map((team) => (
                <fieldset key={team}>
                  <legend>Squadra {team}</legend>
                  {[0, 1].map((position) => {
                    const index = (team - 1) * 2 + position;
                    const chosen = players[index] ?? "";
                    return (
                      <select
                        key={index}
                        // Vuoto il segnaposto e scritto come un suggerimento, non
                        // come un nome gia scelto: e la stessa distinzione che
                        // fanno le caselle di testo, e senza si conferma una
                        // squadra che nessuno ha composto.
                        className={chosen ? "" : "is-empty"}
                        value={chosen}
                        onChange={(e) => updatePlayer(index, e.target.value)}
                        aria-label={`Giocatore ${position + 1} squadra ${team}`}
                        disabled={Boolean(tournamentContext || completingPlanned)}
                      >
                        <option value="">Giocatore {position + 1}</option>
                        {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.display_name}</option>)}
                      </select>
                    );
                  })}
                </fieldset>
              ))}
            </div>
          )}
          </div>
          <div className="match-form-step-content" hidden={twoStepForm && formStep === 1}>
          {!randomTeams ? <div className="match-form-sets">
            {/* Le quattro colonne dell'intestazione sono le stesse delle righe,
                trattino compreso: con tre sole, le due etichette non stavano
                sopra ai campi che nominavano. */}
            {/* Le colonne portano i nomi: "Squadra 1" costringeva a ricordare
                chi era finito dove al passo prima. */}
            <span>SET</span><span>{teamLabelOf(0)}</span><span aria-hidden="true" /><span>{teamLabelOf(1)}</span>
            {scores.map((score, index) => index === 2 && preview.finishedInTwo ? null : (
              <div className="set-row" key={index}>
                <b>{index + 1}</b>
                {[0, 1].map((teamIndex) => (
                  <Fragment key={teamIndex}>
                    {teamIndex === 1 ? <span aria-hidden="true">—</span> : null}
                    <input
                      ref={(node) => { scoreRefs.current[index * 2 + teamIndex] = node; }}
                      type="number"
                      min="0"
                      max="20"
                      inputMode="numeric"
                      placeholder="0"
                      value={score[teamIndex]}
                      onChange={(e) => updateScore(index, teamIndex, e.target.value)}
                      // Toccando una casella si riparte da capo: correggere un
                      // 6 in un 7 vuol dire riscriverlo, non infilare una cifra
                      // accanto a quella che c'e gia.
                      onFocus={(e) => e.currentTarget.select()}
                      aria-label={`Giochi di ${teamLabelOf(teamIndex)} nel set ${index + 1}`}
                    />
                  </Fragment>
                ))}
              </div>
            ))}
          </div> : null}
          {/* Chi vince, in parole, mentre si scrivono i set: un 6-4 invertito
              per sbaglio si vede qui prima di salvarlo. */}
          {!randomTeams && preview.valid && !preview.draw ? (
            <p className="match-verdict">
              <b>Vincono {teamLabelOf(preview.team1Sets > preview.team2Sets ? 0 : 1).replace(" · ", " e ")} {Math.max(preview.team1Sets, preview.team2Sets)}-{Math.min(preview.team1Sets, preview.team2Sets)}</b>
              {preview.finishedInTwo ? " · non serve il terzo set." : null}
            </p>
          ) : null}
          {/* L'esito si legge da solo dal tabellone, ma un pareggio nasce da
              un set lasciato a metà: scritto qui sopra al tasto, un 2-1
              battuto per sbaglio si vede prima di salvarlo e non dopo. */}
          {!randomTeams && preview.draw ? (
            <p className="match-verdict">
              <b>Pareggio</b>
              {preview.unfinishedSet
                ? ` · un set a testa, il terzo si è fermato sul ${preview.unfinishedSet.team1_games}-${preview.unfinishedSet.team2_games}. Il punteggio resta nello storico, ma non assegna Elo.`
                : " · un set a testa e partita finita lì."}
            </p>
          ) : null}
          </div>
          {/* Campo e video sono saliti in cima, nella riga dei segni. La nota e
              sparita: era una riga di modulo che restava vuota quasi sempre, e
              quello che di una partita vale la pena ricordare sta nel
              punteggio. Le note gia scritte non si perdono — il valore viaggia
              lo stesso al salvataggio. */}
          {/* Niente piu casella per il motivo della correzione: cosa e cambiato
              lo scrive il registro da solo. */}
          {editing && windowLeft ? (
            <p className="match-window">Le correzioni si chiudono fra {windowLeft}.</p>
          ) : null}
          </>
          ) : null}
          {error ? <p className="form-message error">{error}</p> : null}

          {editing ? (
            <section className="match-history">
              <h3>Storico del risultato</h3>
              {!historyReady ? (
                <p className="demo-profile-note">
                  Per registrare le correzioni esegui la migrazione
                  <code>migration-storico-partite.sql</code> in Supabase.
                </p>
              ) : events.length ? (
                <ol className="match-history-list">
                  {events.map((event) => (
                    <li key={event.id} className={event.kind === "created" ? "is-first" : ""}>
                      <div className="match-history-meta">
                        <b>{event.kind === "created" ? "Registrata" : "Corretta"}</b>
                        <span>
                          {new Intl.DateTimeFormat("it-IT", { dateStyle: "short", timeStyle: "short" }).format(new Date(event.created_at))}
                          {" · "}
                          {profiles.find((profile) => profile.id === event.author_id)?.display_name ?? "Sconosciuto"}
                        </span>
                      </div>
                      <p className="match-history-score">{event.summary}</p>
                      {event.comment ? <p className="match-history-comment">{event.comment}</p> : null}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="demo-profile-note">
                  Nessuna correzione registrata: lo storico parte dalla prossima modifica.
                </p>
              )}
            </section>
          ) : null}

          <div className="modal-actions">
            {/* Eliminare resta di chi ha registrato, senza scadenza: chi ha
                giocato puo correggere quello che c'e scritto, non far sparire
                la partita. */}
            {canDelete ? (
              <button type="button" className="button button-danger" onClick={() => void removeMatch()} disabled={busy}>
                Elimina
              </button>
            ) : null}
            <button type="button" className="button button-ghost" onClick={onClose}>{canEdit ? "Annulla" : "Chiudi"}</button>
            {twoStepForm && formStep === 2 ? <button type="button" className="button button-ghost" onClick={() => showMatchStep(1)}>Indietro</button> : null}
            {canEdit ? (
              <button className="button button-primary" disabled={busy || (randomTeams && players.length !== 4)}>
                {busy ? "Salvataggio…" : randomTeams ? "Crea partita" : twoStepForm && formStep === 1 ? "Avanti: il risultato →" : "Salva risultato"}
              </button>
            ) : null}
          </div>
        </form>
    </BottomSheet>
  );
}
