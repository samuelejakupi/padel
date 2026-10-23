"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { type PadelMatch, type PadelSet, type PlannedMatch, type Profile, supabase } from "@/lib/supabase";
import { BottomSheet } from "../BottomSheet";
import { PadelTeam, countedSets, decidedSets, eloDeltaLabel, eloLabel, matchIsDraw, padelWinRate, ranksByRating, setIsIncomplete, teamLabel, teamRating, teamRatingLabel, teamSides } from "../core";
import { youtubeId } from "./emblems";
import { medalClass, rankingWindowStart } from "./ranking";
import { Avatar } from "../ui";

// Quante caselle di punteggio mostra una card partita, comunque sia finita:
// vedi scoreCells qui sotto.
export const MATCH_SETS_SHOWN = 3;

export function MatchCard({
  match,
  onEdit,
  onPlayVideo,
  onVoteMvp,
  onOpenPlayer,
  viewerId,
  actionLabel,
  compact = false,
}: {
  match: PadelMatch;
  onEdit?: (match: PadelMatch) => void;
  onPlayVideo?: (videoId: string) => void;
  onVoteMvp?: (match: PadelMatch) => void;
  // Chi passa questa funzione dice che qui le facce si possono aprire. Non e
  // sempre vero: la card della home e tutta un tasto che apre il foglio, e
  // dentro un tasto non ci va un altro tasto.
  onOpenPlayer?: (profile: Profile) => void;
  viewerId?: string;
  // Cosa succede toccando la card: non sempre e "modifica", quindi chi la
  // usa puo dirlo, altrimenti chi naviga con lo screen reader sentirebbe
  // annunciata un'azione che non avviene.
  actionLabel?: string;
  // Versione ridotta, quella dell'anteprima in home: una riga sola con data,
  // le due coppie e il punteggio. Cadono la miniatura del video, il campo e i
  // punti Elo — nell'anteprima sarebbero numeri troppo piccoli per essere
  // letti davvero, e per quelli c'e il foglio.
  compact?: boolean;
}) {
  // Chi guarda vede sempre la propria squadra a sinistra, a prescindere da
  // come è stata registrata la partita.
  const viewerTeam = viewerId
    ? match.players.find((player) => player.profile_id === viewerId)?.team
    : undefined;
  const flipped = viewerTeam === 2;
  const leftSide = flipped ? 2 : 1;
  const rightSide = flipped ? 1 : 2;

  const team1 = match.players.filter((player) => player.team === leftSide);
  const team2 = match.players.filter((player) => player.team === rightSide);
  const draw = matchIsDraw(match);
  const videoId = youtubeId(match.video_url);
  const mvpIds = new Set((match.mvps ?? []).map((mvp) => mvp.profile_id));
  const mvpNames = match.players
    .filter((player) => mvpIds.has(player.profile_id))
    .map((player) => player.profile.display_name);
  const viewerPlayed = Boolean(viewerId && match.players.some((player) => player.profile_id === viewerId));
  const closedWithoutMvp = Boolean(match.mvp_voting_enabled && match.mvp_voting_closed_at && mvpNames.length === 0);
  const canVoteMvp = Boolean(
    onVoteMvp
    && viewerPlayed
    && !match.is_friendly
    && !match.tournament_fixture_id
    && match.mvp_voting_enabled
    && !match.mvp_voting_closed_at
    && mvpNames.length === 0,
  );
  // Puoi votare e non l'hai ancora fatto: e l'unico caso in cui la partita ha
  // qualcosa da chiederti, ed e quello che accende la riga.
  const viewerMustVote = canVoteMvp && !match.viewer_mvp_vote;
  // Le caselle del punteggio sono sempre tre, anche quando la partita e
  // finita al primo set: con una casella sola la card veniva larga la meta
  // delle altre e la fila non tornava. Quelle non giocate sono 0-0 sbiadite,
  // come i set interrotti: stessa forma, ma si vede che non sono state
  // giocate.
  const countedSetNumbers = new Set(countedSets(match.sets).map((set) => set.set_number));
  const scoreCells: { key: string; left: number; right: number; tone: string; title?: string }[] = [...match.sets]
    .sort((a, b) => a.set_number - b.set_number)
    .map((set) => ({
      key: String(set.set_number),
      left: flipped ? set.team2_games : set.team1_games,
      right: flipped ? set.team1_games : set.team2_games,
      tone: !countedSetNumbers.has(set.set_number) ? "ignored"
        : setIsIncomplete(set) ? "unfinished" : "played",
      title: countedSetNumbers.has(set.set_number) ? undefined
        : "Set fuori partita: il match era già finito 2-0",
    }));
  while (scoreCells.length < MATCH_SETS_SHOWN) {
    scoreCells.push({ key: `empty-${scoreCells.length}`, left: 0, right: 0, tone: "empty" });
  }

  // Le facce della squadra. Nel foglio partite sono un varco verso la scheda
  // del giocatore, come le righe della classifica; altrove restano immagini.
  const renderAvatars = (players: typeof team1) => (
    <div className="mini-avatars">
      {players.map((player) => (onOpenPlayer ? (
        <button
          key={player.profile_id}
          type="button"
          className="mini-avatar-link"
          // La card intera apre la correzione: senza fermare qui la
          // propagazione, aprendo la scheda si aprirebbe anche quella.
          onClick={(event) => { event.stopPropagation(); onOpenPlayer(player.profile); }}
          aria-label={`Apri la scheda di ${player.profile.display_name}`}
        >
          <Avatar profile={player.profile} size="sm" mvp={mvpIds.has(player.profile_id)} />
        </button>
      ) : (
        <Avatar key={player.profile_id} profile={player.profile} size="sm" mvp={mvpIds.has(player.profile_id)} />
      )))}
    </div>
  );

  const formatTeam = (players: typeof team1) => (
    <span className="match-team-players">
      {players.map((player) => {
        const delta = player.rating_delta ?? 0;
        return (
          <span key={player.profile_id} className="match-team-player">
            {player.profile.display_name}
            {compact || match.is_friendly ? null : (
              <>
                {" "}
                <b className={`elo-delta ${delta >= 0 ? "up" : "down"}`}>
                  {eloDeltaLabel(delta)}
                </b>
              </>
            )}
          </span>
        );
      })}
    </span>
  );

  return (
    <div
      // Il filo lime sul fianco dice che la partita e nata dentro a un
      // torneo. Non ha una sezione sua nell'elenco: le partite di torneo
      // sono partite come le altre, contano nell'Elo e stanno nel loro mese
      // — solo, si vede da dove vengono.
      className={`match-card${onEdit ? " match-card-link" : ""}${compact ? " match-card-compact" : ""}${match.tournament_fixture_id ? " match-card-tournament" : ""}`}
      onClick={onEdit ? () => onEdit(match) : undefined}
      onKeyDown={onEdit ? (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onEdit(match);
        }
      } : undefined}
      role={onEdit ? "button" : undefined}
      tabIndex={onEdit ? 0 : undefined}
      aria-label={onEdit
        ? actionLabel ?? `Modifica la partita del ${new Intl.DateTimeFormat("it-IT").format(new Date(match.played_at))}`
        : undefined}
    >
      {/* Su desktop .match-head e display: contents, quindi .match-date resta
          una cella della card come prima; su mobile diventa una riga vera che
          tiene insieme data e campo. */}
      <div className="match-head">
        <div className="match-date">
          <b>{new Intl.DateTimeFormat("it-IT", { day: "2-digit" }).format(new Date(match.played_at))}</b>
          <span>{new Intl.DateTimeFormat("it-IT", { month: "short" }).format(new Date(match.played_at)).replace(".", "")}</span>
          {match.is_friendly ? <small className="match-friendly-label">Amichevole</small> : null}
        </div>
        {compact
          ? null
          : match.court
            ? <p className="match-court" title={match.court}>{match.court}</p>
            : <p className="match-court" aria-hidden="true" />}
      </div>
      <div className="match-main">
        {/* Nel pareggio nessuna delle due squadre e "winner": il segno sta
            sul terzo elemento, la classe drawn, che tinge i due contorni di
            giallo invece che di verde e rosso. */}
        <div className={`match-team ${draw ? "drawn" : match.winner_team === leftSide ? "winner" : ""}`}>
          {renderAvatars(team1)}
          {formatTeam(team1)}
          {draw ? <em>PAREGGIO</em> : match.winner_team === leftSide ? <em>VITTORIA</em> : null}
        </div>
        <div className="match-score">
          {scoreCells.map((cell) => (
            <span key={cell.key} className={cell.tone === "played" ? undefined : `match-score-${cell.tone}`}
              title={cell.title} aria-label={cell.title ? `${cell.left}-${cell.right}, ${cell.title}` : undefined}>
              <b>{cell.left}</b>
              <i>—</i>
              <b>{cell.right}</b>
            </span>
          ))}
        </div>
        <div className={`match-team team-right ${draw ? "drawn" : match.winner_team === rightSide ? "winner" : ""}`}>
          {renderAvatars(team2)}
          {formatTeam(team2)}
          {draw ? <em>PAREGGIO</em> : match.winner_team === rightSide ? <em>VITTORIA</em> : null}
        </div>
      </div>
      {/* Su telefono "VITTORIA" accanto alla squadra non c'e: chi ha vinto
          si legge qui, in parole, sotto i punteggi. */}
      <p className="match-result-line">
        {(() => {
          const sets = decidedSets(match.sets ?? []);
          const leftWins = sets.filter((set) => (leftSide === 1 ? set.team1_games > set.team2_games : set.team2_games > set.team1_games)).length;
          const rightWins = sets.filter((set) => (leftSide === 1 ? set.team2_games > set.team1_games : set.team1_games > set.team2_games)).length;
          if (draw) return <>Pareggio {leftWins}-{rightWins}</>;
          const leftWon = match.winner_team === leftSide;
          const winners = leftWon ? team1 : team2;
          const viewerWon = winners.some((player) => player.profile_id === viewerId);
          const others = winners.filter((player) => player.profile_id !== viewerId).map((player) => player.profile.display_name);
          const names = others.length > 1 ? `${others.slice(0, -1).join(", ")} e ${others.at(-1)}` : others[0] ?? "";
          const score = leftWon ? `${leftWins}-${rightWins}` : `${rightWins}-${leftWins}`;
          return viewerWon
            ? <><b>Hai vinto {score}</b>{names ? ` con ${names}` : ""}</>
            : <><b>Vincono {names}</b> {score}</>;
        })()}
      </p>
      {compact ? null : (
      <div className="match-video">
        {videoId ? (
          <button
            className="match-video-preview"
            // La card intera apre la modifica: qui fermiamo la propagazione,
            // altrimenti il video farebbe partire anche quella.
            onClick={(event) => { event.stopPropagation(); onPlayVideo?.(videoId); }}
            aria-label="Guarda il video della partita"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`https://img.youtube.com/vi/${videoId}/mqdefault.jpg`} alt="" />
            <b aria-hidden="true">▶</b>
          </button>
        ) : (
          // Segnaposto sbarrato: senza, le card con e senza video avevano
          // larghezze diverse e la fila non tornava allineata.
          <span className="match-video-empty" role="img" aria-label="Nessun video per questa partita">
            <b aria-hidden="true">▶</b>
          </span>
        )}
      </div>
      )}
      {!compact && (mvpNames.length > 0 || canVoteMvp || closedWithoutMvp) ? (
        <div className={`match-mvp-row${mvpNames.length ? " is-awarded" : ""}${viewerMustVote ? " is-pending" : ""}`}>
          {mvpNames.length ? (
            <span><b>MVP</b> {mvpNames.join(" · ")}</span>
          ) : closedWithoutMvp ? (
            <span><b>MVP non assegnato</b> · votazione terminata in parità</span>
          ) : (
            <span>
              <b>{viewerMustVote ? "Manca il tuo voto" : "MVP della partita"}</b>
              {typeof match.mvp_votes_cast === "number"
                ? ` ${match.mvp_votes_cast}/${match.mvp_total_voters ?? match.players.length} voti`
                : " Votazione aperta"}
            </span>
          )}
          {canVoteMvp ? (
            <button
              type="button"
              className="match-mvp-button"
              onClick={(event) => { event.stopPropagation(); onVoteMvp?.(match); }}
            >
              {match.viewer_mvp_vote ? "Cambia voto MVP" : "Vota MVP"}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// Quanto resta aperta una partita alle correzioni. Ventiquattro ore dalla
// registrazione, non dalla data della partita: il conto parte da quando il
// risultato e stato messo a referto, che e il momento in cui gli altri possono
// accorgersi che c'e uno sbaglio.
export const MATCH_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

// L'istante da cui contano le 24 ore. Non `created_at` della riga: correggere
// una partita la cancella e la riregistra, quindi quella data si sposterebbe a
// ogni correzione e la finestra non si chiuderebbe mai. Vedi origin_at in
// lib/supabase.ts e migration-permessi-partite.sql.
export function matchOpenUntil(match: PadelMatch) {
  const origin = match.origin_at ?? match.created_at;
  return origin ? new Date(origin).getTime() + MATCH_EDIT_WINDOW_MS : 0;
}

// Correggere il risultato lo puo fare chi c'era — piu chi l'ha registrato, che
// non sempre e in campo — e solo finche la finestra e aperta. Passate le 24 ore
// il risultato e storia, anche per chi ha giocato.
export function canEditMatch(match: PadelMatch, viewerId?: string | null) {
  if (!viewerId) return false;
  if (Date.now() > matchOpenUntil(match)) return false;
  return (match.origin_by ?? match.created_by) === viewerId
    || match.players.some((player) => player.profile_id === viewerId);
}

// Eliminare invece resta di chi ha registrato, per sempre: chi ha giocato puo
// correggere quello che c'e scritto, non far sparire la partita.
export function canDeleteMatch(match: PadelMatch, viewerId?: string | null) {
  if (!viewerId) return false;
  return (match.origin_by ?? match.created_by) === viewerId;
}

// Quanto manca alla chiusura, detto come lo direbbe una persona. La stessa
// frase serve alle partite e ai tornei: la finestra e la stessa e non ha
// motivo di leggersi in due modi diversi.
export function windowLeftLabel(deadline: number) {
  const left = deadline - Date.now();
  if (left <= 0) return null;
  const hours = Math.floor(left / (60 * 60 * 1000));
  if (hours >= 1) return `${hours} ${hours === 1 ? "ora" : "ore"}`;
  const minutes = Math.max(1, Math.round(left / (60 * 1000)));
  return `${minutes} ${minutes === 1 ? "minuto" : "minuti"}`;
}

export function matchWindowLeft(match: PadelMatch) {
  return windowLeftLabel(matchOpenUntil(match));
}

// Cosa e cambiato fra il risultato di prima e quello appena salvato, scritto da
// solo. Prima era una casella da riempire a mano: quasi sempre restava vuota, e
// quando non lo era diceva quello che si vedeva gia dal punteggio. Il registro
// deve dire cosa e stato toccato, non cosa l'autore aveva voglia di raccontare.
export function matchChangeSummary(
  before: PadelMatch,
  after: { playerIds: string[]; sets: PadelSet[]; playedAt: string; court: string; videoUrl: string; notes: string },
  profiles: Profile[],
) {
  const name = (id: string) => profiles.find((profile) => profile.id === id)?.display_name ?? "?";
  const changes: string[] = [];

  const beforePlayers = [
    ...before.players.filter((player) => player.team === 1).map((player) => player.profile_id),
    ...before.players.filter((player) => player.team === 2).map((player) => player.profile_id),
  ];
  if (beforePlayers.join("|") !== after.playerIds.join("|")) {
    const stessi = new Set(beforePlayers).size === new Set(after.playerIds).size
      && beforePlayers.every((id) => after.playerIds.includes(id));
    // Gli stessi quattro in caselle diverse non e un cambio di formazione: e una
    // coppia rifatta, e dirlo cosi si capisce al volo.
    changes.push(stessi
      ? "coppie rifatte"
      : `giocatori: ${after.playerIds.slice(0, 2).map(name).join(" · ")} vs ${after.playerIds.slice(2, 4).map(name).join(" · ")}`);
  }

  const scoreOf = (sets: PadelSet[]) => [...sets]
    .sort((a, b) => a.set_number - b.set_number)
    .map((set) => `${set.team1_games}-${set.team2_games}`)
    .join(" ");
  const scoreBefore = scoreOf(before.sets);
  const scoreAfter = scoreOf(after.sets);
  if (scoreBefore !== scoreAfter) changes.push(`punteggio ${scoreBefore || "—"} → ${scoreAfter}`);

  // Lo stesso taglio che fa il modulo quando riempie la casella della data:
  // confrontarlo con la stringa grezza direbbe "data cambiata" a chi non ha
  // toccato niente, per via del fuso.
  const dayBefore = new Date(before.played_at).toISOString().slice(0, 10);
  if (dayBefore !== after.playedAt) {
    const day = (value: string) => new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit" }).format(new Date(`${value}T12:00:00`));
    changes.push(`data ${day(dayBefore)} → ${day(after.playedAt)}`);
  }

  // Campo, video e nota si comportano tutti e tre allo stesso modo: si
  // aggiungono, si tolgono o cambiano. Cambiati, il valore non si riporta: in
  // una riga di registro un indirizzo YouTube per esteso coprirebbe tutto.
  const fields: [string, string, string][] = [
    ["campo", (before.court ?? "").trim(), after.court.trim()],
    ["video", (before.video_url ?? "").trim(), after.videoUrl.trim()],
    ["nota", (before.notes ?? "").trim(), after.notes.trim()],
  ];
  for (const [label, was, now] of fields) {
    if (was === now) continue;
    changes.push(!was ? `${label} aggiunto` : !now ? `${label} rimosso` : `${label} cambiato`);
  }

  // Salvare senza toccare niente non e un errore: capita di aprire, guardare e
  // confermare. Il registro lo dice com'e.
  return changes.length ? changes.join(" · ") : "nessun dato cambiato";
}

export function PlannedMatchCard({
  match,
  onResult,
}: {
  match: PlannedMatch;
  onResult: (match: PlannedMatch) => void;
}) {
  const team = (number: number) => match.players.filter((player) => player.team === number);

  return (
    <article className="planned-match-card">
      <div className="planned-match-date">
        <b>{new Intl.DateTimeFormat("it-IT", { day: "2-digit" }).format(new Date(match.played_at))}</b>
        <span>{new Intl.DateTimeFormat("it-IT", { month: "short" }).format(new Date(match.played_at)).replace(".", "")}</span>
      </div>
      <div className="planned-match-content">
        <div className="planned-match-status"><b>PARTITA DA GIOCARE</b>{match.court ? <span>{match.court}</span> : null}</div>
        <div className="planned-match-teams">
          {[1, 2].map((number) => (
            <div key={number} className="planned-match-team">
              <small>Squadra {number}</small>
              <div className="mini-avatars">{team(number).map((player) => <Avatar key={player.profile_id} profile={player.profile} size="sm" />)}</div>
              <b>{team(number).map((player) => player.profile.display_name).join(" · ")}</b>
            </div>
          ))}
        </div>
      </div>
      <button type="button" className="button button-primary planned-match-result" onClick={() => onResult(match)}>
        Inserisci risultato
      </button>
    </article>
  );
}

export function MvpVoteModal({
  match,
  viewerId,
  onClose,
  onSaved,
}: {
  match: PadelMatch;
  viewerId: string;
  onClose: () => void;
  onSaved: (result: { awarded: boolean; closed: boolean }) => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState(match.viewer_mvp_vote ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selectedId || !supabase) return;
    setBusy(true);
    setError("");
    const { data, error: voteError } = await supabase.rpc("vote_match_mvp", {
      p_match_id: match.id,
      p_target_id: selectedId,
    });
    if (voteError) {
      setError(voteError.message);
      setBusy(false);
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    await onSaved({ awarded: Boolean(row?.is_awarded), closed: Boolean(row?.is_closed) });
  }

  return (
    <BottomSheet title="Vota l'MVP" onClose={onClose}>
      <form className="sheet-form mvp-vote-form" onSubmit={submit}>
        <p className="mvp-vote-intro">
          Scegli il migliore della partita. Per essere MVP un giocatore deve ricevere almeno 3 voti.
          La votazione si chiude quando qualcuno li raggiunge, quando hanno votato tutti o dopo 12 ore;
          se nessuno arriva a 3 voti, l&apos;MVP non viene assegnato.
        </p>
        <fieldset className="mvp-candidates" disabled={busy}>
          <legend>Partecipanti</legend>
          {match.players.map((player) => {
            const isSelf = player.profile_id === viewerId;
            return (
              <label className={`${selectedId === player.profile_id ? "is-selected" : ""}${isSelf ? " is-disabled" : ""}`} key={player.profile_id}>
                <input
                  type="radio"
                  name="mvp"
                  value={player.profile_id}
                  checked={selectedId === player.profile_id}
                  onChange={() => setSelectedId(player.profile_id)}
                  disabled={isSelf}
                />
                <Avatar profile={player.profile} size="md" />
                <span>
                  <b>{player.profile.display_name}</b>
                  <small>{isSelf ? "Tu · non puoi autovotarti" : player.team === 1 ? "Squadra 1" : "Squadra 2"}</small>
                </span>
                <i aria-hidden="true">✓</i>
              </label>
            );
          })}
        </fieldset>
        {error ? <p className="form-message error">{error}</p> : null}
        <div className="modal-actions">
          <button type="button" className="button button-ghost" onClick={onClose}>Annulla</button>
          <button className="button button-primary" disabled={!selectedId || busy}>
            {busy ? "Salvataggio…" : match.viewer_mvp_vote ? "Aggiorna voto" : "Conferma voto"}
          </button>
        </div>
      </form>
    </BottomSheet>
  );
}

export function TeamAvatars({ team, size = "sm" }: { team: PadelTeam; size?: "sm" | "lg" }) {
  if (team.imageUrl) {
    return (
      <span className={`team-image team-image-${size}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={team.imageUrl} alt="" />
      </span>
    );
  }
  // Senza una foto di squadra la coppia è un cerchio solo con le iniziali dei
  // due giocatori: due avatar sovrapposti occupavano il doppio dello spazio e
  // rompevano l'allineamento con la classifica del singolo.
  const marks = team.players
    .map((profile) => profile.display_name.trim().charAt(0).toUpperCase())
    .join("");
  return (
    <span className={`avatar avatar-${size} team-initials`} aria-label={teamLabel(team)}>
      <span>{marks}</span>
    </span>
  );
}

export function TeamEditor({
  team,
  onSave,
  onDelete,
  disabled,
}: {
  team: PadelTeam;
  onSave: (pairId: string, name: string, file?: File) => Promise<void>;
  onDelete: (team: PadelTeam) => Promise<void>;
  disabled?: boolean;
}) {
  const [name, setName] = useState(team.name ?? "");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    await onSave(team.id, name);
    setBusy(false);
  }

  async function pickImage(file?: File) {
    if (!file) return;
    setBusy(true);
    await onSave(team.id, name, file);
    setBusy(false);
  }

  return (
    <form className="team-editor" onSubmit={submit}>
      <label className="team-editor-photo" title="Cambia la foto della squadra">
        <TeamAvatars team={team} />
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={disabled || busy}
          onChange={(event) => void pickImage(event.target.files?.[0])}
        />
      </label>
      <div className="team-editor-row">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={team.players.map((profile) => profile.display_name).join(" · ")}
          maxLength={40}
          disabled={disabled || busy}
          aria-label="Nome della squadra"
        />
        <small>{team.matches_played} partite · {teamRatingLabel(team)} pt</small>
        <button className="button button-dark" disabled={disabled || busy}>
          {busy ? "Salvo…" : "Salva"}
        </button>
        {/* Sciogliere la coppia toglie nome, foto e la riga in classifica. Le
            partite giocate restano dove sono: sono appese ai giocatori, non
            alla squadra. */}
        <button
          type="button"
          className="team-editor-remove"
          disabled={disabled || busy}
          onClick={() => void onDelete(team)}
          aria-label={`Sciogli ${teamLabel(team)}`}
        >
          Sciogli
        </button>
      </div>
    </form>
  );
}

// Formare una squadra non richiede piu di averci gia giocato insieme: si
// sceglie il compagno, le si da un nome e una faccia, e da quel momento
// esiste. Le partite, se ci sono gia state, se le trova appese da sole — la
// coppia e la stessa, e la chiave sono i due giocatori.
export function TeamCreateModal({
  profiles,
  teams,
  viewerId,
  onClose,
  onCreate,
}: {
  profiles: Profile[];
  teams: PadelTeam[];
  viewerId: string;
  onClose: () => void;
  onCreate: (pairId: string, name: string, file?: File) => Promise<void>;
}) {
  const [partnerId, setPartnerId] = useState("");
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | undefined>(undefined);
  // L'anteprima e l'immagine scelta, non uno stato a parte: derivarla evita di
  // chiamare un setState dentro all'effetto, che il lint (giustamente) rifiuta.
  // All'effetto resta solo il lavoro che gli compete, disfare quello che ha
  // creato il browser.
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const me = profiles.find((profile) => profile.id === viewerId) ?? null;
  const partner = profiles.find((profile) => profile.id === partnerId) ?? null;
  const pairId = partner && me ? [me.id, partner.id].sort().join("|") : "";
  // I compagni con cui la squadra c'e gia: non se ne formano due uguali.
  const takenPartners = new Set(
    teams
      .filter((team) => team.isSaved && team.players.some((profile) => profile.id === viewerId))
      .flatMap((team) => team.players.map((profile) => profile.id)),
  );
  const candidates = profiles.filter(
    (profile) => profile.id !== viewerId && !takenPartners.has(profile.id),
  );
  // Se i due hanno gia giocato insieme la coppia esiste gia nei risultati:
  // il riquadro mostra quello che ha fatto, non zero.
  const existing = pairId ? teams.find((team) => team.id === pairId) ?? null : null;
  const rating = me && partner ? teamRating([me, partner]) : null;
  const ratingNote = !me || !partner
    ? "Scegli il compagno"
    : rating === null
      ? "Nessuno dei due ha ancora giocato"
      : [me, partner].every((profile) => profile.matches_played > 0)
        ? "Media dei vostri Elo"
        : `Solo l'Elo di ${[me, partner].find((profile) => profile.matches_played > 0)?.display_name}`;

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!partner || !pairId) {
      setError("Scegli con chi giochi.");
      return;
    }
    if (name.trim().length < 2) {
      setError("Il nome della squadra è di almeno due lettere.");
      return;
    }
    setBusy(true);
    await onCreate(pairId, name.trim(), file);
    setBusy(false);
  }

  return (
    <BottomSheet title="Nuova squadra" onClose={onClose}>
      <form className="sheet-form team-create-form" onSubmit={submit}>
        <label>
          Compagno di squadra
          <select value={partnerId} onChange={(event) => setPartnerId(event.target.value)} required>
            <option value="">Scegli chi gioca con te</option>
            {candidates.map((profile) => (
              <option key={profile.id} value={profile.id}>{profile.display_name}</option>
            ))}
          </select>
        </label>
        {!candidates.length ? (
          <p className="tournament-rule-note">Hai già una squadra con tutti quanti.</p>
        ) : null}

        <label>
          Nome della squadra
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={partner && me ? `${me.display_name} & ${partner.display_name}` : "Come vi chiamate"}
            maxLength={40}
          />
        </label>

        <div className="team-create-photo">
          <label title="Scegli la foto della squadra">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <span className="team-image team-image-lg"><img src={preview} alt="" /></span>
            ) : (
              <span className="avatar avatar-lg team-initials">
                <span>{[me, partner].filter(Boolean).map((profile) => profile!.display_name.trim().charAt(0).toUpperCase()).join("") || "?"}</span>
              </span>
            )}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => setFile(event.target.files?.[0])}
            />
          </label>
          <div>
            <span className="tournament-field-label">Foto della squadra</span>
            <small>Facoltativa: senza, restano le vostre iniziali.</small>
          </div>
        </div>

        {/* Il punteggio di una coppia appena formata e la media dei due, e non
            e un dato acquisito: e quello che vale oggi, prima di aver giocato
            una partita insieme. */}
        <div className="tournament-choice team-create-preview">
          <div><p className="eyebrow dark">PUNTO DI PARTENZA</p><h3>{rating === null ? "N/C" : `${eloLabel(rating)} pt`}</h3><small>{ratingNote}</small></div>
          <span className="team-create-played">
            <b>{existing?.matches_played ?? 0}</b>
            <small>{(existing?.matches_played ?? 0) === 1 ? "PARTITA" : "PARTITE"}</small>
          </span>
        </div>

        {error ? <p className="form-message error">{error}</p> : null}
        <div className="modal-actions">
          <button className="button button-ghost" type="button" onClick={onClose}>Annulla</button>
          <button className="button button-lime" disabled={busy}>{busy ? "Creazione…" : "Crea squadra"}</button>
        </div>
      </form>
    </BottomSheet>
  );
}

// Menu costruito a mano: il <select> nativo non permette di intervenire né
// sull'evidenziazione né sull'aspetto della lista.
export function SeasonPicker({
  value,
  options,
  current,
  onChange,
}: {
  value: number;
  options: number[];
  // L'anno in corso non si chiama con il suo numero ma "stagione attuale":
  // è l'unica che cambia mentre la guardi.
  current?: number;
  onChange: (season: number) => void;
}) {
  const label = (year: number) => (year === current ? "Stagione attuale" : `Stagione ${year}`);
  const [open, setOpen] = useState(false);
  const holder = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: MouseEvent) => {
      if (holder.current && !holder.current.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="season-picker" ref={holder}>
      <button
        type="button"
        className="season"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        {label(value)}
        <i aria-hidden="true">▾</i>
      </button>
      {open ? (
        <ul className="season-menu" role="listbox">
          {options.map((year) => (
            <li key={year}>
              <button
                type="button"
                role="option"
                aria-selected={year === value}
                className={year === value ? "active" : ""}
                onClick={() => { onChange(year); setOpen(false); }}
              >
                {label(year)}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function TeamRankingList({
  teams,
  limit,
  focusId,
  expanded = false,
  showTrend = true,
  bare = false,
}: {
  teams: PadelTeam[];
  limit?: number;
  // Come per il singolo, ma qui la coppia su cui centrarsi è una sola: si può
  // far parte di più squadre insieme, e quella che interessa è l'ultima con
  // cui si è scesi in campo.
  focusId?: string | null;
  // Come per il singolo: nelle stagioni archiviate le frecce non hanno senso.
  showTrend?: boolean;
  // Come per il singolo: in home la lista è compatta, nella pagina del
  // ranking diventa tabella. Senza questo le due classifiche in home si
  // presentavano con due impaginazioni diverse.
  expanded?: boolean;
  bare?: boolean;
}) {
  const ranks = ranksByRating(teams);
  const start = limit === undefined
    ? 0
    : rankingWindowStart(teams.length, limit, teams.findIndex((team) => team.id === focusId));
  const visible = limit === undefined ? teams : teams.slice(start, start + limit);
  return (
    <div className={`${expanded ? "ranking-table ranking-table-team" : "ranking-list ranking-list-team"}${bare ? " ranking-table-bare" : ""}`}>
      {visible.map((team, index) => {
        const rank = ranks[start + index];
        const winRate = padelWinRate(team.wins, team.losses);
        return (
          <div className={`ranking-row ${medalClass(rank)}`} key={team.id}>
            <span className={`rank-number rank-${rank}`}>{rank}</span>
            <TeamAvatars team={team} />
            <div className="ranking-name">
              <b>{teamLabel(team)}</b>
              <span>
                {team.name
                  ? team.players.map((profile) => profile.display_name).join(" · ")
                  : teamSides(team) ?? `${team.matches_played} partite`}
              </span>
            </div>
            {expanded ? (
              <>
                <span className="table-stat"><b>{team.matches_played}</b><small>Partite</small></span>
                <span className="table-stat"><b>{team.wins}</b><small>Vinte</small></span>
                <span className="table-stat"><b>{winRate}%</b><small>Win rate</small></span>
                <span className={`streak ${team.current_streak >= 0 ? "up" : "down"}`}>
                  {`${team.current_streak >= 0 ? "↗" : "↘"} ${Math.abs(team.current_streak)}`}
                </span>
              </>
            ) : (
              <span className={`trend ${showTrend ? (team.current_streak >= 0 ? "up" : "down") : ""}`}>
                {showTrend ? (team.current_streak >= 0 ? "↑" : "↓") : ""}
              </span>
            )}
            <span className="ranking-points">
              <b>{teamRatingLabel(team)}</b>
              <small>PT</small>
            </span>
          </div>
        );
      })}
      {/* Righe vuote a pareggio. In anteprima la card deve restare alta
          uguale sia che si guardi il singolo sia le squadre: con due sole
          coppie in classifica si accorciava, e passando da una all'altra la
          home si muoveva sotto il dito. Gli slot sono muti per i lettori di
          schermo, non c'e niente da leggere. */}
      {limit !== undefined && visible.length < limit
        ? Array.from({ length: limit - visible.length }, (_, index) => (
            <div className="ranking-row ranking-row-empty" key={`empty-${index}`} aria-hidden="true" />
          ))
        : null}
    </div>
  );
}
