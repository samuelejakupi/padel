"use client";

import Image from "next/image";
import { Fragment, FormEvent, useState } from "react";
import { type PadelMatch, type Profile, type Tournament, type TournamentTeam, supabase } from "@/lib/supabase";
import CabinetMarquee from "../CabinetMarquee";
import { drawTournamentTeams, type TournamentDraftTeam } from "@/lib/tournament-draw";
import { buildIndividualStandings } from "@/lib/individual-standings";
import { canRecordTournamentFixture } from "@/lib/tournament-fixture-order";
import { BottomSheet } from "../BottomSheet";
import { PadelTeam, basePath, decidedSets, teamLabel } from "../core";
import { Emblem } from "./emblems";
import { MATCH_EDIT_WINDOW_MS, windowLeftLabel } from "./matches";
import { BlockMark, NavGlyph } from "../ui";

export type TournamentTrophyKind = Tournament["trophy_badge"];
export type TournamentTrophyChoice = "none" | "theboyz" | "monkey";

// I percorsi restano quelli salvati nel database (.png); a schermo va la
// versione WebP accanto, 40-80 KB invece di 2 MB.
export function trophyImageSrc(path: string) {
  return `${basePath}/${path.replace(/^trophies\/(.+)\.png$/, "trophies/$1.webp")}`;
}
export const THEBOYZ_TROPHY_PATH = "trophies/coppa-theboyz.png";
export const MONKEY_TROPHY_PATH = "trophies/scimmia-padel-banana.png";
export const MONKEY_SILVER_MEDAL_PATH = "trophies/medaglia-scimmia-argento.png";
export const MONKEY_BRONZE_MEDAL_PATH = "trophies/medaglia-scimmia-bronzo.png";
export const TOURNAMENT_TROPHY_CHOICES: TournamentTrophyChoice[] = ["theboyz", "monkey", "none"];

export function trophyImagePath(choice: TournamentTrophyChoice) {
  return choice === "theboyz" ? THEBOYZ_TROPHY_PATH : choice === "monkey" ? MONKEY_TROPHY_PATH : null;
}

export function trophyChoiceFromTournament(tournament?: Tournament): TournamentTrophyChoice {
  if (tournament?.trophy_image_path === MONKEY_TROPHY_PATH) return "monkey";
  if (tournament?.trophy_image_path === THEBOYZ_TROPHY_PATH) return "theboyz";
  return "none";
}

export function NoTournamentTrophy({ compact = false }: { compact?: boolean }) {
  return <svg className={`tournament-no-trophy${compact ? " is-compact" : ""}`} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="5" aria-hidden="true">
    <circle cx="24" cy="24" r="18" />
    <path d="M11.3 11.3 36.7 36.7" />
  </svg>;
}

export type TournamentMatchContext = {
  fixtureId: string;
  tournamentName: string;
  eloMultiplier: number;
  // Quanti set si giocano: decide quante righe ha il tabellone del foglio.
  setsFormat: number;
  playerIds: [string, string, string, string];
};

export type TournamentStanding = {
  team: TournamentTeam;
  played: number;
  wins: number;
  losses: number;
  gamesWon: number;
  gamesLost: number;
  directWins: number;
};

export type RankingAward = { matchId: string; profileId: string; points: number };

// Il simbolo del trofeo e ora l'emblema esagonale, lo stesso della bacheca:
// i quattro glifi a tratto — coppa, corona, scudo, stella — erano disegnati
// qui a mano e non c'entravano piu niente con il resto.
// La forma resta nel prop e nella colonna trophy_badge del database: cambia
// solo quello che si vede, cosi i tornei gia creati non perdono il loro
// valore e si puo tornare indietro senza migrazioni.
export function TournamentTrophyBadge({ kind, compact = false }: { kind: TournamentTrophyKind; compact?: boolean }) {
  return (
    <div className={`tournament-trophy tournament-trophy-${kind}${compact ? " is-compact" : ""}`} aria-hidden="true">
      <Emblem name="trophy" className="tournament-trophy-art" />
    </div>
  );
}

export function TournamentAwardImage({ path, compact = false, alt = "" }: { path: string; compact?: boolean; alt?: string }) {
  return <Image
    className={`tournament-trophy-image${compact ? " is-compact" : ""}`}
    src={trophyImageSrc(path)}
    alt={alt}
    width={compact ? 34 : 86}
    height={compact ? 44 : 112}
    sizes={compact ? "44px" : "(max-width: 780px) 72px, 86px"}
  />;
}

export function TournamentTrophyChoiceVisual({ choice, compact = false }: { choice: TournamentTrophyChoice; compact?: boolean }) {
  const path = trophyImagePath(choice);
  return path ? <TournamentAwardImage path={path} compact={compact} />
    : <NoTournamentTrophy compact={compact} />;
}

export function TournamentTrophyVisual({
  tournament,
  compact = false,
}: {
  tournament: Tournament;
  compact?: boolean;
}) {
  if (compact && !tournament.trophy_image_path) return null;
  return tournament.trophy_image_path ? (
    <Image
      className={`tournament-trophy-image${compact ? " is-compact" : ""}`}
      src={trophyImageSrc(tournament.trophy_image_path)}
      alt=""
      width={compact ? 34 : 86}
      height={compact ? 44 : 112}
      sizes={compact ? "44px" : "(max-width: 780px) 72px, 86px"}
    />
  ) : (
    <NoTournamentTrophy compact={compact} />
  );
}

export function TournamentPrizeVisual({ tournament }: { tournament: Tournament }) {
  if (tournament.trophy_image_path !== MONKEY_TROPHY_PATH) return <TournamentTrophyVisual tournament={tournament} />;
  return <div className="tournament-award-set" aria-label="Premi: coppa al primo, argento al secondo, bronzo al terzo">
    <TournamentTrophyVisual tournament={tournament} />
    <TournamentAwardImage path={MONKEY_SILVER_MEDAL_PATH} alt="Medaglia d'argento per il secondo posto" />
    <TournamentAwardImage path={MONKEY_BRONZE_MEDAL_PATH} alt="Medaglia di bronzo per il terzo posto" />
  </div>;
}

export function TournamentPrizeChoicePreview({ choice }: { choice: TournamentTrophyChoice }) {
  return choice === "monkey" ? <div className="tournament-award-set" aria-label="Coppa al primo, argento al secondo, bronzo al terzo">
    <TournamentTrophyChoiceVisual choice={choice} />
    <TournamentAwardImage path={MONKEY_SILVER_MEDAL_PATH} alt="Secondo: argento" />
    <TournamentAwardImage path={MONKEY_BRONZE_MEDAL_PATH} alt="Terzo: bronzo" />
  </div> : <TournamentTrophyChoiceVisual choice={choice} />;
}

export function TournamentTrophyPicker({ choice, onChange }: { choice: TournamentTrophyChoice; onChange: (choice: TournamentTrophyChoice) => void }) {
  return <div className="tournament-trophy-picker" role="group" aria-label="Coppa del torneo">
    {TOURNAMENT_TROPHY_CHOICES.map((option) => <button
      className={choice === option ? "active" : ""}
      type="button"
      key={option}
      onClick={() => onChange(option)}
      aria-label={option === "monkey" ? "Coppa scimmia, con medaglie d'argento e bronzo" : option === "theboyz" ? "Coppa TheBoyz" : "Nessun trofeo"}
      title={option === "monkey" ? "Coppa scimmia" : option === "theboyz" ? "Coppa TheBoyz" : "Nessun trofeo"}
      aria-pressed={choice === option}
    ><TournamentTrophyChoiceVisual choice={option} compact /></button>)}
  </div>;
}

// Riga di un torneo nel riquadro della home: stesso impianto della riga
// partita, con le sole informazioni che servono a colpo d'occhio.
export function TournamentRow({
  tournament,
  matches,
  profiles,
  onOpen,
}: {
  tournament: Tournament;
  matches: PadelMatch[];
  profiles: Profile[];
  onOpen: () => void;
}) {
  const played = tournament.fixtures.filter((fixture) => fixture.match_id).length;
  const total = tournament.mode === "individual" ? tournament.target_matches ?? 0 : tournament.fixtures.length;
  // Stessa definizione usata dalla pagina tornei, invece di ricalcolarla qui.
  const done = tournamentIsCompleted(tournament, matches);
  const standings = tournament.mode === "individual" ? null : buildTournamentStandings(tournament, matches);
  // A torneo finito conta chi ha vinto; mentre e in corso, chi guida.
  const individualLeaders = tournament.mode === "individual" ? buildIndividualStandings(tournament, matches).filter((row) => row.rankPosition === 1 && row.played) : [];
  const leader = individualLeaders.length
    ? individualLeaders.map((row) => profiles.find((profile) => profile.id === row.profileId)?.display_name ?? "Giocatore").join(" · ")
    : standings?.[0]?.played ? standings[0].team.name : null;

  return (
    <div
      className="match-card match-card-link tournament-row"
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Apri il torneo ${tournament.name}`}
    >
      <div className="match-head">
        <div className="match-date tournament-row-date">
          <b>{new Intl.DateTimeFormat("it-IT", { day: "2-digit" }).format(new Date(tournament.created_at))}</b>
          <span>{new Intl.DateTimeFormat("it-IT", { month: "short" }).format(new Date(tournament.created_at)).replace(".", "")}</span>
        </div>
        <p className="match-court">{done ? "COMPLETATO" : "IN CORSO"}</p>
      </div>
      <div className="match-main tournament-row-main">
        <div className="tournament-row-badge">
          <TournamentTrophyVisual tournament={tournament} compact />
        </div>
        <div className="tournament-row-text">
          <b>{tournament.name}</b>
          <span>
            {leader ? `${done ? "Vince" : "Guida"} ${leader}` : "Nessuna partita giocata"}
          </span>
        </div>
      </div>
      <div className="match-video tournament-row-meta">
        <b>{played}/{total}</b>
        <small>×{tournament.elo_multiplier}</small>
      </div>
    </div>
  );
}

export function buildTournamentStandings(tournament: Tournament, matches: PadelMatch[]) {
  const matchMap = new Map(matches.map((match) => [match.id, match]));
  const rows = new Map<string, TournamentStanding>(tournament.teams.map((team) => [team.id, {
    team,
    played: 0,
    wins: 0,
    losses: 0,
    gamesWon: 0,
    gamesLost: 0,
    directWins: 0,
  }]));

  tournament.fixtures.forEach((fixture) => {
    const match = fixture.match_id ? matchMap.get(fixture.match_id) : null;
    const team1 = fixture.team1_id ? rows.get(fixture.team1_id) : null;
    const team2 = fixture.team2_id ? rows.get(fixture.team2_id) : null;
    if (!match || !team1 || !team2) return;
    team1.played += 1;
    team2.played += 1;
    team1.wins += match.winner_team === 1 ? 1 : 0;
    team1.losses += match.winner_team === 2 ? 1 : 0;
    team2.wins += match.winner_team === 2 ? 1 : 0;
    team2.losses += match.winner_team === 1 ? 1 : 0;
    decidedSets(match.sets).forEach((set) => {
      team1.gamesWon += set.team1_games;
      team1.gamesLost += set.team2_games;
      team2.gamesWon += set.team2_games;
      team2.gamesLost += set.team1_games;
    });
  });

  const standings = [...rows.values()];
  const tiedByWins = new Map<number, TournamentStanding[]>();
  standings.forEach((row) => tiedByWins.set(row.wins, [...(tiedByWins.get(row.wins) ?? []), row]));
  tiedByWins.forEach((tiedRows) => {
    if (tiedRows.length < 2) return;
    const tiedIds = new Set(tiedRows.map((row) => row.team.id));
    tournament.fixtures.forEach((fixture) => {
      if (!fixture.team1_id || !fixture.team2_id || !tiedIds.has(fixture.team1_id) || !tiedIds.has(fixture.team2_id) || !fixture.match_id) return;
      const match = matchMap.get(fixture.match_id);
      if (!match) return;
      const winnerId = match.winner_team === 1 ? fixture.team1_id : fixture.team2_id;
      const winner = rows.get(winnerId);
      if (winner) winner.directWins += 1;
    });
  });

  return standings.sort((a, b) =>
    b.wins - a.wins
    || b.directWins - a.directWins
    || (b.gamesWon - b.gamesLost) - (a.gamesWon - a.gamesLost)
    || b.gamesWon - a.gamesWon
    || a.team.sort_order - b.team.sort_order,
  );
}

// Lo stesso foglio serve a creare un torneo e a correggerlo, come per le
// partite: si arriva qui dal tasto della pagina tornei o dalla scheda di uno
// gia creato, e sarebbe strano trovare due moduli diversi per le stesse voci.
export function TournamentFormModal({
  profiles,
  savedTeams,
  tournament,
  viewerId,
  onClose,
  onSaved,
  onDeleted,
}: {
  profiles: Profile[];
  // Le coppie gia formate (vedi "le mie squadre"): un torneo si gioca con
  // quelle, e riscriverne il nome a mano ogni volta era il modo piu sicuro
  // per ritrovarsi lo stesso doppio con tre nomi diversi.
  savedTeams: PadelTeam[];
  tournament?: Tournament | null;
  viewerId?: string | null;
  onClose: () => void;
  onSaved: (kind: "created" | "edited") => Promise<void>;
  onDeleted: () => Promise<void>;
}) {
  const editing = Boolean(tournament);
  const canEdit = !tournament || canEditTournament(tournament, viewerId);
  const canDelete = Boolean(tournament && canDeleteTournament(tournament, viewerId));
  const windowLeft = tournament ? windowLeftLabel(tournamentOpenUntil(tournament)) : null;
  // Con un risultato gia dentro, le squadre non si toccano piu: il girone
  // andrebbe rifatto da capo e le partite gia giocate resterebbero appese al
  // nulla. Il database rifiuta comunque il cambio (update_tournament).
  const playedFixtures = tournament?.fixtures.filter((fixture) => fixture.match_id).length ?? 0;
  const initialTeams = tournament
    ? [...tournament.teams]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((team) => ({ playerA: team.player_a, playerB: team.player_b, name: team.name }))
    // Vuote, non riempite con i primi sei della lista: quelle coppie non le
    // aveva scelte nessuno, e bastava non accorgersene per iscrivere al
    // torneo tre doppi a caso. Adesso ogni casella e un suggerimento —
    // Player 1, Player 2 — come nel foglio della partita.
    : [0, 1, 2].map(() => ({ playerA: "", playerB: "", name: "" }));
  const [name, setName] = useState(tournament?.name ?? "Torneo TheBoyz");
  const [teams, setTeams] = useState(initialTeams);
  const [creationMode, setCreationMode] = useState<"teams" | "individual">("teams");
  const [teamSelectionMode, setTeamSelectionMode] = useState<"manual" | "random">("manual");
  const [randomParticipantIds, setRandomParticipantIds] = useState<string[]>(
    tournament ? initialTeams.flatMap((team) => [team.playerA, team.playerB]) : [],
  );
  const [drawnTeams, setDrawnTeams] = useState<TournamentDraftTeam[]>([]);
  const [trophyName, setTrophyName] = useState(tournament?.trophy_name ?? "Coppa TheBoyz");
  const [trophyChoice, setTrophyChoice] = useState<TournamentTrophyChoice>(tournament ? trophyChoiceFromTournament(tournament) : "theboyz");
  const [eloMultiplier, setEloMultiplier] = useState<1 | 2>(tournament?.elo_multiplier === 1 ? 1 : 2);
  const [setsFormat, setSetsFormat] = useState<1 | 3>(tournament && tournamentSetsFormat(tournament) === 1 ? 1 : 3);
  const [legs, setLegs] = useState<1 | 2>(tournament && tournamentLegs(tournament) === 2 ? 2 : 1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Il conto delle partite lo fa il modulo mentre lo compili: e l'unico modo
  // per accorgersi che l'andata e ritorno con quattro coppie sono dodici sere.
  const teamCount = teamSelectionMode === "random"
    ? randomParticipantIds.length === 8 ? 4 : randomParticipantIds.length === 6 ? 3 : 0
    : teams.length;
  const fixtureCount = (teamCount * (teamCount - 1) / 2) * legs;

  // A, B, C, D. Il numero lo tiene il database (sort_order); qui dentro le
  // squadre si chiamano per lettera, cosi non si confondono con i due Player
  // che stanno dentro a ciascuna.
  function teamLetter(index: number) {
    return String.fromCharCode(65 + index);
  }

  function pairKeyOf(playerA: string, playerB: string) {
    return playerA && playerB ? [playerA, playerB].sort().join("|") : "";
  }

  function savedTeamOf(playerA: string, playerB: string) {
    const key = pairKeyOf(playerA, playerB);
    return key ? savedTeams.find((saved) => saved.id === key) ?? null : null;
  }

  function updateTeam(index: number, key: "playerA" | "playerB" | "name", value: string) {
    setTeams((current) => current.map((team, teamIndex) => {
      if (teamIndex !== index) return team;
      const next = { ...team, [key]: value };
      if (key === "name") return next;
      // Cambiati i giocatori, il nome segue: se la coppia e gia formata prende
      // il suo, e se non lo e piu si porta via quello di prima invece di
      // restare addosso alla coppia sbagliata. Un nome scritto a mano su una
      // coppia senza squadra non si tocca.
      const before = savedTeamOf(team.playerA, team.playerB);
      const after = savedTeamOf(next.playerA, next.playerB);
      if (after) return { ...next, name: after.name ?? "" };
      if (before && team.name === (before.name ?? "")) return { ...next, name: "" };
      return next;
    }));
  }

  // Scelta la squadra, i due giocatori si compilano da soli: e la stessa cosa
  // detta dall'altro verso.
  function pickSavedTeam(index: number, teamId: string) {
    const saved = savedTeams.find((team) => team.id === teamId);
    if (!saved) return;
    setTeams((current) => current.map((team, teamIndex) => teamIndex === index
      ? { playerA: saved.players[0].id, playerB: saved.players[1].id, name: saved.name ?? "" }
      : team));
  }

  function toggleRandomParticipant(profileId: string) {
    setRandomParticipantIds((current) => current.includes(profileId)
      ? current.filter((id) => id !== profileId)
      : current.length < 8 ? [...current, profileId] : current);
    setDrawnTeams([]);
    setError("");
  }

  function drawTeams() {
    try {
      setDrawnTeams(drawTournamentTeams(randomParticipantIds));
      setError("");
    } catch (drawError) {
      setError(drawError instanceof Error ? drawError.message : "Impossibile sorteggiare le squadre.");
    }
  }

  // Quando una migrazione non e stata eseguita il database risponde con il
  // nome della funzione che non trova: si dice cosa manca invece di girare
  // quel messaggio cosi com'e.
  function saveErrorMessage(message: string) {
    return message.includes("_with_trophy")
      ? "Per scegliere la coppa e le medaglie esegui migration-tornei-premi-scimmia.sql nel SQL Editor di Supabase."
      : message.includes("update_tournament")
      || message.includes("delete_tournament")
      || message.includes("p_sets_format")
      || message.includes("p_legs")
      ? "Per il formato, l'andata e ritorno e le modifiche esegui migration-tornei-formato.sql nel SQL Editor di Supabase."
      : message;
  }

  async function saveTournament(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (teamSelectionMode === "random" && !drawnTeams.length) {
      setError("Sorteggia le squadre prima di creare il torneo.");
      return;
    }
    const selectedTeams = teamSelectionMode === "random" ? drawnTeams : teams;
    const playerIds = selectedTeams.flatMap((team) => [team.playerA, team.playerB]);
    if (selectedTeams.length < 3 || selectedTeams.some((team) => !team.playerA || !team.playerB)) {
      setError("Servono almeno tre squadre complete.");
      return;
    }
    if (new Set(playerIds).size !== playerIds.length) {
      setError("Ogni partecipante può giocare in una sola squadra.");
      return;
    }
    if (!name.trim() || (trophyChoice !== "none" && !trophyName.trim())) {
      setError("Inserisci il nome del torneo e del trofeo.");
      return;
    }
    if (!supabase) return;
    setBusy(true);
    const teamPayload = selectedTeams.map((team, index) => {
      return {
        player_a: team.playerA,
        player_b: team.playerB,
        // Lasciato vuoto vale quello che dice il segnaposto. Prima ci finivano
        // i due nomi dei giocatori, che nelle tabelle del torneo stanno gia
        // scritti sotto al nome della squadra: due volte la stessa cosa, e in
        // una colonna che non ci sta.
        name: team.name.trim()
          || savedTeamOf(team.playerA, team.playerB)?.name?.trim()
          || `Squadra ${teamLetter(index)}`,
        sort_order: index + 1,
      };
    });
    const { error: saveError } = tournament
      ? await supabase.rpc("update_tournament_with_trophy", {
          p_tournament_id: tournament.id,
          p_name: name.trim(),
          p_trophy_name: trophyChoice === "none" ? "Nessun trofeo" : trophyName.trim(),
          p_trophy_badge: "cup",
          p_trophy_image_path: trophyImagePath(trophyChoice),
          p_elo_multiplier: eloMultiplier,
          p_sets_format: setsFormat,
          p_legs: legs,
          p_teams: teamPayload,
        })
      : await supabase.rpc("create_round_robin_tournament_with_trophy", {
          p_name: name.trim(),
          p_trophy_name: trophyChoice === "none" ? "Nessun trofeo" : trophyName.trim(),
          p_trophy_badge: "cup",
          p_trophy_image_path: trophyImagePath(trophyChoice),
          p_elo_multiplier: eloMultiplier,
          p_sets_format: setsFormat,
          p_legs: legs,
          p_teams: teamPayload,
        });
    if (saveError) {
      setError(saveErrorMessage(saveError.message));
      setBusy(false);
      return;
    }
    await onSaved(tournament ? "edited" : "created");
  }

  // Eliminare un torneo porta via i suoi risultati: sono partite giocate in un
  // formato deciso dal torneo e pesate con il suo moltiplicatore. Quante sono
  // si dice prima, non dopo.
  async function removeTournament() {
    if (!tournament || !supabase) return;
    const question = playedFixtures
      ? `Eliminare il torneo? Spariscono anche le ${playedFixtures} partite già giocate e la classifica verrà ricalcolata.`
      : "Eliminare definitivamente questo torneo?";
    if (!window.confirm(question)) return;
    setError("");
    setBusy(true);
    const { error: deleteError } = await supabase.rpc("delete_tournament", { p_tournament_id: tournament.id });
    if (deleteError) {
      setError(saveErrorMessage(deleteError.message));
      setBusy(false);
      return;
    }
    await onDeleted();
  }

  return (
    // Stesso foglio della partita: si arriva qui dallo stesso tasto, scorrendo
    // di lato, e sarebbe strano trovare due pannelli diversi a un dito di
    // distanza.
    <BottomSheet title={editing ? "Modifica il torneo" : "Crea un torneo"} onClose={onClose}>
      {!editing && creationMode === "individual" ? (
        <IndividualTournamentForm profiles={profiles} onChooseTeams={() => setCreationMode("teams")} onSaved={async () => onSaved("created")} />
      ) : (
      <form className="sheet-form tournament-create-form" onSubmit={saveTournament}>
          {!editing ? <div className="tournament-choice">
            <div><p className="eyebrow dark">MODALITÀ</p><h3>Come si gioca?</h3></div>
            <div className="ranking-switch tournament-team-mode" role="group" aria-label="Modalità del torneo">
              <button type="button" className="active" aria-pressed="true">A coppie fisse</button>
              <button type="button" aria-pressed="false" onClick={() => setCreationMode("individual")}>Individuale</button>
            </div>
          </div> : null}
          {/* Passate le 24 ore il foglio resta, ma non si tocca piu niente:
              un torneo in corso e fatto anche di quello che gli altri hanno
              gia giocato dentro. */}
          {!canEdit ? (
            <p className="match-locked">
              <b>Il torneo è chiuso alle modifiche.</b>
              Restano aperte 24 ore dalla creazione, e solo per chi l&apos;ha creato o ci gioca.
            </p>
          ) : null}
          {canEdit ? (
          <>
          <label>Nome del torneo<input value={name} onChange={(event) => setName(event.target.value)} maxLength={70} required /></label>

          {!playedFixtures ? (
            <div className="ranking-switch tournament-team-mode" role="group" aria-label="Come formare le squadre">
              <button type="button" className={teamSelectionMode === "manual" ? "active" : ""} onClick={() => { setTeamSelectionMode("manual"); setError(""); }} aria-pressed={teamSelectionMode === "manual"}>Scelgo le squadre</button>
              <button type="button" className={teamSelectionMode === "random" ? "active" : ""} onClick={() => { setTeamSelectionMode("random"); setError(""); }} aria-pressed={teamSelectionMode === "random"}>Squadre casuali</button>
            </div>
          ) : null}

          <div className="tournament-form-head">
            <div><p className="eyebrow dark">PARTECIPANTI E SQUADRE</p><h3>{teamSelectionMode === "random" ? `${randomParticipantIds.length} partecipanti` : `${teams.length} coppie`} · {fixtureCount} partite</h3></div>
            {teamSelectionMode === "manual" && !playedFixtures && teams.length < 4 && profiles.length >= (teams.length + 1) * 2 ? (
              <button className="button button-ghost tournament-add-team" type="button" onClick={() => setTeams((current) => [...current, { playerA: "", playerB: "", name: "" }])}>+ Squadra</button>
            ) : null}
          </div>
          {playedFixtures ? (
            <p className="tournament-rule-note">Le squadre non si cambiano più: nel torneo c&apos;è già un risultato.</p>
          ) : null}
          {teamSelectionMode === "random" && !playedFixtures ? (
            <div className="tournament-random-builder">
              <p className="tournament-rule-note">Seleziona 6 o 8 persone. Ogni partecipante finirà in una sola squadra.</p>
              <div className="tournament-participant-list">
                {profiles.map((profile) => {
                  const selected = randomParticipantIds.includes(profile.id);
                  return (
                    <label className={`tournament-participant${selected ? " is-selected" : ""}`} key={profile.id}>
                      <input type="checkbox" checked={selected} disabled={!selected && randomParticipantIds.length === 8} onChange={() => toggleRandomParticipant(profile.id)} />
                      <span>{profile.display_name}</span>
                    </label>
                  );
                })}
              </div>
              <button className="button button-ghost" type="button" onClick={drawTeams} disabled={randomParticipantIds.length !== 6 && randomParticipantIds.length !== 8}>
                {drawnTeams.length ? "↻ Risorteggia squadre" : "Sorteggia squadre"}
              </button>
              {drawnTeams.length ? (
                <div className="tournament-draw-preview" aria-live="polite">
                  <p className="eyebrow dark">SQUADRE ESTRATTE</p>
                  {drawnTeams.map((team, index) => (
                    <div key={index}><b>{savedTeamOf(team.playerA, team.playerB)?.name || `Squadra ${teamLetter(index)}`}</b><span>{profiles.find((profile) => profile.id === team.playerA)?.display_name} · {profiles.find((profile) => profile.id === team.playerB)?.display_name}</span></div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
          <div className="tournament-team-builder">
            {teams.map((team, index) => {
              // I giocatori gia impegnati in un'altra squadra di questo torneo:
              // servono a non proporre una coppia che poi il database rifiuta.
              const takenElsewhere = new Set(
                teams.flatMap((other, otherIndex) => otherIndex === index ? [] : [other.playerA, other.playerB]).filter(Boolean),
              );
              const chosenTeam = savedTeamOf(team.playerA, team.playerB);
              const pickable = savedTeams.filter((saved) =>
                saved.id === chosenTeam?.id || !saved.players.some((profile) => takenElsewhere.has(profile.id)));
              return (
                <fieldset key={index} disabled={Boolean(playedFixtures)}>
                  <legend>Squadra {teamLetter(index)}</legend>
                  {/* Prima le squadre gia formate: nove volte su dieci il
                      doppio che scende in campo e uno di quelli, e sceglierlo
                      da qui riempie tutto il resto. */}
                  {savedTeams.length ? (
                    <select
                      className={`tournament-team-pick${chosenTeam ? "" : " is-empty"}`}
                      value={chosenTeam?.id ?? ""}
                      onChange={(event) => pickSavedTeam(index, event.target.value)}
                      aria-label={`Squadra già formata, squadra ${teamLetter(index)}`}
                    >
                      <option value="">Squadra formata</option>
                      {pickable.map((saved) => (
                        <option key={saved.id} value={saved.id}>{teamLabel(saved)}</option>
                      ))}
                    </select>
                  ) : null}
                  <div className="tournament-team-selects">
                    {(["playerA", "playerB"] as const).map((key, position) => (
                      <select
                        key={key}
                        className={team[key] ? "" : "is-empty"}
                        value={team[key]}
                        onChange={(event) => updateTeam(index, key, event.target.value)}
                        aria-label={`Giocatore ${position + 1} squadra ${teamLetter(index)}`}
                      >
                        <option value="">Giocatore {position + 1}</option>
                        {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.display_name}</option>)}
                      </select>
                    ))}
                  </div>
                  <input
                    value={team.name}
                    onChange={(event) => updateTeam(index, "name", event.target.value)}
                    placeholder={chosenTeam ? teamLabel(chosenTeam) : `Squadra ${teamLetter(index)}`}
                    maxLength={50}
                    aria-label={`Nome squadra ${teamLetter(index)}`}
                  />
                  {teams.length > 3 ? <button className="tournament-team-remove" type="button" onClick={() => setTeams((current) => current.filter((_, teamIndex) => teamIndex !== index))}>Rimuovi</button> : null}
                </fieldset>
              );
            })}
          </div>
          )}

          <div className="tournament-prize-form">
            <div className={`tournament-prize-preview${trophyChoice === "monkey" ? " has-medals" : ""}`}><TournamentPrizeChoicePreview choice={trophyChoice} /><span><b>{trophyChoice === "none" ? "Nessun trofeo" : trophyName || "Trofeo"}</b>{trophyChoice !== "none" ? <small>{trophyChoice === "monkey" ? "COPPA · ARGENTO · BRONZO" : "IN PALIO"}</small> : null}</span></div>
            <div>
              {trophyChoice !== "none" ? <label>Nome del trofeo<input value={trophyName} onChange={(event) => setTrophyName(event.target.value)} maxLength={60} required /></label> : null}
              <span className="tournament-field-label">Coppa del torneo</span>
              <TournamentTrophyPicker choice={trophyChoice} onChange={setTrophyChoice} />
            </div>
          </div>

          {/* Il formato determina il peso Elo insieme ai set vinti e persi. */}
          <div className="tournament-choice">
            <div><p className="eyebrow dark">FORMATO</p><h3>Quanti set si giocano?</h3><small>Il set secco pesa meno; fra due e tre set conta anche il risultato finale.</small></div>
            <div className="ranking-switch" role="group" aria-label="Formato delle partite">
              <button type="button" className={setsFormat === 1 ? "active" : ""} onClick={() => setSetsFormat(1)}>Set secco</button>
              <button type="button" className={setsFormat === 3 ? "active" : ""} onClick={() => setSetsFormat(3)}>Fino a 3 set</button>
            </div>
          </div>

          <div className="tournament-choice">
            <div><p className="eyebrow dark">CALENDARIO</p><h3>Quante volte si incontrano?</h3><small>Al ritorno le squadre si scambiano di posto e le partite raddoppiano.</small></div>
            <div className="ranking-switch" role="group" aria-label="Incontri del girone">
              <button type="button" className={legs === 1 ? "active" : ""} onClick={() => setLegs(1)}>Solo andata</button>
              <button type="button" className={legs === 2 ? "active" : ""} onClick={() => setLegs(2)}>Andata e ritorno</button>
            </div>
          </div>

          <div className="tournament-choice">
            <div><p className="eyebrow dark">ELO IN PALIO</p><h3>Quanto valgono le partite?</h3><small>Il moltiplicatore si applica sia ai punti guadagnati sia a quelli persi.</small></div>
            <div className="ranking-switch" role="group" aria-label="Moltiplicatore Elo">
              <button type="button" className={eloMultiplier === 1 ? "active" : ""} onClick={() => setEloMultiplier(1)}>Normale ×1</button>
              <button type="button" className={eloMultiplier === 2 ? "active" : ""} onClick={() => setEloMultiplier(2)}>Doppio ×2</button>
            </div>
          </div>
          {editing && windowLeft ? (
            <p className="match-window">Le modifiche si chiudono fra {windowLeft}.</p>
          ) : null}
          </>
          ) : null}
          {error ? <p className="form-message error">{error}</p> : null}
          <div className="modal-actions">
            {/* Eliminare resta di chi ha creato il torneo, senza scadenza:
                chi ci gioca puo correggere quello che c'e scritto, non far
                sparire il trofeo di tutti. */}
            {canDelete ? (
              <button type="button" className="button button-danger" onClick={() => void removeTournament()} disabled={busy}>
                Elimina
              </button>
            ) : null}
            <button className="button button-ghost" type="button" onClick={onClose}>{canEdit ? "Annulla" : "Chiudi"}</button>
            {canEdit ? (
              <button className="button button-lime" disabled={busy}>{busy ? "Salvataggio…" : editing ? "Salva modifiche" : "Crea torneo"}</button>
            ) : null}
          </div>
        </form>
      )}
    </BottomSheet>
  );
}

export function tournamentIsCompleted(tournament: Tournament, matches: PadelMatch[]) {
  const matchIds = new Set(matches.map((match) => match.id));
  return Boolean(
    tournament.fixtures.length
    && (tournament.mode !== "individual" || tournament.fixtures.length === tournament.target_matches)
    && tournament.fixtures.every((fixture) => fixture.match_id && matchIds.has(fixture.match_id)),
  );
}

export function tournamentVictoryDate(tournament: Tournament, matches: PadelMatch[]) {
  const matchDates = tournament.fixtures.flatMap((fixture) => {
    const match = matches.find((item) => item.id === fixture.match_id);
    return match ? [new Date(match.played_at).getTime()] : [];
  });
  return new Date(matchDates.length ? Math.max(...matchDates) : tournament.created_at);
}

export type TournamentAwardEntry = { tournament: Tournament; placement: 1 | 2 | 3 };

export function TournamentTrophyTile({
  award,
  matches,
  ghost,
}: {
  award: TournamentAwardEntry;
  matches: PadelMatch[];
  ghost: boolean;
}) {
  const { tournament, placement } = award;
  const imagePath = placement === 2 ? MONKEY_SILVER_MEDAL_PATH
    : placement === 3 ? MONKEY_BRONZE_MEDAL_PATH : tournament.trophy_image_path;
  const prizeLabel = placement === 1 ? "Coppa" : placement === 2 ? "Medaglia d'argento" : "Medaglia di bronzo";
  const victoryDate = new Intl.DateTimeFormat("it-IT", { dateStyle: "long" })
    .format(tournamentVictoryDate(tournament, matches));
  return (
    <article
      className="trophy-room-card"
      tabIndex={ghost ? -1 : 0}
      aria-hidden={ghost ? true : undefined}
      aria-label={ghost ? undefined : `${prizeLabel} del ${tournament.name}, ${placement}° posto il ${victoryDate}`}
    >
      {imagePath ? (
        <Image
          className="trophy-room-image"
          src={trophyImageSrc(imagePath)}
          alt={ghost ? "" : `${prizeLabel} del ${tournament.name}`}
          width={128}
          height={168}
        />
      ) : (
        <TournamentTrophyBadge kind={tournament.trophy_badge} />
      )}
      <span className="trophy-room-tooltip" role="tooltip">
        <b>{prizeLabel} · {tournament.name}</b>
        <small>{placement}° posto · {victoryDate}</small>
      </span>
    </article>
  );
}

export function TrophyList({ awards, matches }: { awards: TournamentAwardEntry[]; matches: PadelMatch[] }) {
  return (
    <CabinetMarquee
      items={awards}
      rowClassName="trophy-room-list"
      keyOf={(award) => `${award.tournament.id}:${award.placement}`}
      renderItem={(award, ghost) => (
        <TournamentTrophyTile award={award} matches={matches} ghost={ghost} />
      )}
    />
  );
}

// I tornei creati prima di migration-tornei-formato.sql non hanno le due
// colonne: valgono per loro le regole di allora, due set su tre e sola andata.
// Il premio di fine torneo, in punti Elo: primi e secondi. I numeri veri
// stanno in migration-tornei-premio-elo.sql, che e anche l'unico posto dove
// vengono davvero assegnati — qui servono solo a dirlo prima di giocare.
export const TOURNAMENT_ELO_AWARDS = [30, 15];

export function tournamentSetsFormat(tournament: Tournament) {
  return tournament.sets_format === 1 ? 1 : 3;
}

export function tournamentLegs(tournament: Tournament) {
  return tournament.legs === 2 ? 2 : 1;
}

export function tournamentFormatLabel(tournament: Tournament) {
  if (tournament.mode === "individual") return tournament.individual_schedule === "complete"
    ? `Individuale · girone completo · ${tournament.target_matches ?? 5} partite`
    : "Individuale · coppie variabili · set secco";
  const sets = tournamentSetsFormat(tournament) === 1 ? "Set secco" : "Fino a tre set";
  return `${sets} · ${tournamentLegs(tournament) === 2 ? "andata e ritorno" : "solo andata"}`;
}

// Le stesse due regole delle partite, applicate al torneo: si corregge entro
// 24 ore dalla creazione e lo puo fare chi l'ha montato o chi ci gioca; si
// elimina solo se l'hai creato tu, senza scadenza. Il controllo vero sta sul
// database (migration-tornei-formato.sql): qui si decide solo cosa mostrare.
export function tournamentOpenUntil(tournament: Tournament) {
  return new Date(tournament.created_at).getTime() + MATCH_EDIT_WINDOW_MS;
}

export function canEditTournament(tournament: Tournament, viewerId?: string | null) {
  if (tournament.mode === "individual") return false;
  if (!viewerId) return false;
  if (Date.now() > tournamentOpenUntil(tournament)) return false;
  return tournament.created_by === viewerId
    || tournament.teams.some((team) => team.player_a === viewerId || team.player_b === viewerId);
}

export function canDeleteTournament(tournament: Tournament, viewerId?: string | null) {
  return Boolean(viewerId) && tournament.created_by === viewerId;
}

export function TournamentStandingsContent({
  tournament,
  profiles,
  matches,
  title,
  actionLabel,
}: {
  tournament: Tournament;
  profiles: Profile[];
  matches: PadelMatch[];
  title: string;
  actionLabel?: string;
}) {
  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
  const standings = buildTournamentStandings(tournament, matches);
  // Il premio si mostra solo a conti chiusi: finche manca una partita la
  // classifica e provvisoria e i 30 punti non sono di nessuno.
  const completed = tournamentIsCompleted(tournament, matches);
  if (tournament.mode === "individual") {
    const individual = buildIndividualStandings(tournament, matches);
    return <>
      <div className="player-history-head"><div><p className="eyebrow dark">CLASSIFICA INDIVIDUALE</p><h2>{title}</h2></div></div>
      <div className="tournament-table">
        <div className="tournament-table-head"><span>#</span><span>Giocatore</span><span>G</span><span>V</span><span>GF</span><span>Diff.</span></div>
        {individual.map((row) => <div className={`tournament-table-row${row.rankPosition === 1 && row.played ? " is-leader" : ""}`} key={row.profileId}>
          {/* Prima di giocare sarebbero tutti "1": niente posizione finche
              non si e giocato. */}
          <b>{row.played ? row.rankPosition : "—"}</b><span className="tournament-team-cell"><strong>{profileMap.get(row.profileId)?.display_name ?? "Giocatore"}{completed && row.award ? <em className="tournament-award">+{row.award.toLocaleString("it-IT", { maximumFractionDigits: 4 })}</em> : null}</strong></span>
          <span>{row.played}</span><span>{row.wins}</span><span>{row.gamesWon}</span><span>{row.gamesWon - row.gamesLost > 0 ? "+" : ""}{row.gamesWon - row.gamesLost}</span>
        </div>)}
      </div>
      <p className="tournament-rule-note">Parità: vittorie negli scontri diretti, differenza game complessiva, differenza game negli scontri diretti, poi game vinti complessivi. Premi: +30, +20 e +10 Elo; a pari merito si dividono i premi dei posti occupati.</p>
    </>;
  }
  return (
    <>
      <div className="player-history-head">
        <div><p className="eyebrow dark">CLASSIFICA</p><h2>{title}</h2></div>
        {actionLabel ? <span className="tournament-open-label">{actionLabel} →</span> : null}
      </div>
      <div className="tournament-table">
        <div className="tournament-table-head"><span>#</span><span>Squadra</span><span>G</span><span>V</span><span>SD</span><span>Diff.</span></div>
        {standings.map((row, index) => (
          <div className={`tournament-table-row${index === 0 && row.played ? " is-leader" : ""}`} key={row.team.id}>
            <b>{index + 1}</b>
            <span className="tournament-team-cell"><strong>{row.team.name}{completed && TOURNAMENT_ELO_AWARDS[index] ? <em className="tournament-award">+{TOURNAMENT_ELO_AWARDS[index]}</em> : null}</strong><small>{profileMap.get(row.team.player_a)?.display_name} · {profileMap.get(row.team.player_b)?.display_name}</small></span>
            <span>{row.played}</span><span>{row.wins}</span><span>{row.directWins}</span><span>{row.gamesWon - row.gamesLost > 0 ? "+" : ""}{row.gamesWon - row.gamesLost}</span>
          </div>
        ))}
      </div>
      <p className="tournament-rule-note">Parità: scontri diretti, poi differenza game e infine game vinti. A torneo finito i primi prendono +{TOURNAMENT_ELO_AWARDS[0]} Elo a testa, i secondi +{TOURNAMENT_ELO_AWARDS[1]}.</p>
    </>
  );
}

export function TournamentFixtures({
  tournament,
  matches,
  profiles,
  onRecord,
  onDraw,
}: {
  tournament: Tournament;
  matches: PadelMatch[];
  profiles: Profile[];
  onRecord?: (context: TournamentMatchContext) => void;
  onDraw?: (tournament: Tournament) => void;
}) {
  if (tournament.mode === "individual") {
    const matchMap = new Map(matches.map((match) => [match.id, match]));
    const name = (id?: string | null) => profiles.find((profile) => profile.id === id)?.display_name ?? "Giocatore";
    const pending = tournament.fixtures.some((fixture) => !fixture.match_id);
    const completeSchedule = tournament.individual_schedule === "complete";
    return <section className="tournament-fixtures">
      <div className="player-history-head"><div><p className="eyebrow dark">ABBINAMENTI</p><h2>{completeSchedule ? "Girone completo" : "Una partita alla volta"}</h2></div><span>{tournament.fixtures.filter((fixture) => fixture.match_id).length}/{tournament.target_matches} partite</span></div>
      <div className="tournament-fixture-list">
        {tournament.fixtures.map((fixture) => {
          const match = fixture.match_id ? matchMap.get(fixture.match_id) : null;
          return <article className={`tournament-fixture${match ? " is-played" : ""}`} key={fixture.id}>
            <span className="tournament-match-number">{String(fixture.match_number).padStart(2, "0")}</span>
            <div><b className={match?.winner_team === 1 ? "winner" : ""}>{name(fixture.player1_id)} · {name(fixture.player2_id)}</b><small>vs</small><b className={match?.winner_team === 2 ? "winner" : ""}>{name(fixture.player3_id)} · {name(fixture.player4_id)}</b></div>
            {match ? <strong className="tournament-score">{match.sets[0]?.team1_games}-{match.sets[0]?.team2_games}</strong>
              : onRecord && canRecordTournamentFixture(tournament, fixture) && fixture.player1_id && fixture.player2_id && fixture.player3_id && fixture.player4_id
                ? <button className="button button-ghost tournament-record" onClick={() => onRecord({ fixtureId: fixture.id, tournamentName: tournament.name, eloMultiplier: tournament.elo_multiplier, setsFormat: 1, playerIds: [fixture.player1_id!, fixture.player2_id!, fixture.player3_id!, fixture.player4_id!] })}>Inserisci risultato</button>
                : <span className="tournament-awaiting">Da giocare</span>}
          </article>;
        })}
      </div>
      {!completeSchedule && !pending && !tournamentIsCompleted(tournament, matches) && onDraw ? <button className="button button-lime" type="button" onClick={() => onDraw(tournament)}>Sorteggia prossima partita</button> : null}
      <p className="tournament-rule-note">{completeSchedule
        ? "Le 5 partite sono già pronte. Ognuno gioca 4 volte, riposa una volta, fa coppia con tutti una volta e affronta ogni avversario due volte."
        : "Gli abbinamenti cambiano dopo ogni risultato. Nessuno gioca più di una partita in più degli altri."}</p>
    </section>;
  }
  const matchMap = new Map(matches.map((match) => [match.id, match]));
  const teamMap = new Map(tournament.teams.map((team) => [team.id, team]));
  const playedMatches = tournament.fixtures.filter((fixture) => fixture.match_id && matchMap.has(fixture.match_id)).length;
  const legs = tournamentLegs(tournament);
  const ordered = [...tournament.fixtures].sort((a, b) => a.match_number - b.match_number);
  // Con il ritorno le stesse coppie tornano una seconda volta: senza una riga
  // che divide, il calendario sembra un elenco con le partite doppie.
  const groups = legs === 2
    ? [
        { label: "ANDATA", fixtures: ordered.filter((fixture) => (fixture.leg ?? 1) === 1) },
        { label: "RITORNO", fixtures: ordered.filter((fixture) => (fixture.leg ?? 1) === 2) },
      ]
    : [{ label: null, fixtures: ordered }];
  return (
    <section className="tournament-fixtures">
      <div className="player-history-head"><div><p className="eyebrow dark">CALENDARIO</p><h2>{legs === 2 ? "Andata e ritorno" : "Tutte contro tutte"}</h2></div><span>{playedMatches}/{tournament.fixtures.length}</span></div>
      <div className="tournament-fixture-list">
        {groups.map((group) => (
          <Fragment key={group.label ?? "girone"}>
            {group.label ? <p className="tournament-leg-label">{group.label}</p> : null}
            {group.fixtures.map((fixture) => {
              const team1 = fixture.team1_id ? teamMap.get(fixture.team1_id) : null;
              const team2 = fixture.team2_id ? teamMap.get(fixture.team2_id) : null;
              const match = fixture.match_id ? matchMap.get(fixture.match_id) : null;
              if (!team1 || !team2) return null;
              const score = match ? [...match.sets].sort((a, b) => a.set_number - b.set_number).map((set) => `${set.team1_games}-${set.team2_games}`).join("  ") : null;
              return (
                <article className={`tournament-fixture${match ? " is-played" : ""}`} key={fixture.id}>
                  <span className="tournament-match-number">{String(fixture.match_number).padStart(2, "0")}</span>
                  <div><b className={match?.winner_team === 1 ? "winner" : ""}>{team1.name}</b><small>vs</small><b className={match?.winner_team === 2 ? "winner" : ""}>{team2.name}</b></div>
                  {match ? <strong className="tournament-score">{score}</strong> : onRecord ? (
                    <button className="button button-ghost tournament-record" onClick={() => onRecord({
                      fixtureId: fixture.id,
                      tournamentName: tournament.name,
                      eloMultiplier: tournament.elo_multiplier,
                      setsFormat: tournamentSetsFormat(tournament),
                      playerIds: [team1.player_a, team1.player_b, team2.player_a, team2.player_b],
                    })}>Inserisci risultato</button>
                  ) : <span className="tournament-awaiting">Da giocare</span>}
                </article>
              );
            })}
          </Fragment>
        ))}
      </div>
    </section>
  );
}

export function IndividualTournamentForm({ profiles, onChooseTeams, onSaved }: {
  profiles: Profile[];
  onChooseTeams: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState("Torneo individuale TheBoyz");
  const [trophyName, setTrophyName] = useState("Coppa individuale");
  const [trophyChoice, setTrophyChoice] = useState<TournamentTrophyChoice>("theboyz");
  const [playerIds, setPlayerIds] = useState<string[]>([]);
  const [cycles, setCycles] = useState(2);
  const [eloMultiplier, setEloMultiplier] = useState(2);
  const [scheduleMode, setScheduleMode] = useState<"adaptive" | "complete">("adaptive");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const n = playerIds.length;
  const gamesPerCycle = n % 4 === 0 ? n / 4 : n % 2 === 0 ? n / 2 : n;
  return <form className="sheet-form tournament-create-form" onSubmit={async (event) => {
      event.preventDefault();
      if (!supabase || n < 4 || n > 8 || (scheduleMode === "complete" && n !== 5)) {
        setError(scheduleMode === "complete" ? "Il girone completo richiede esattamente 5 partecipanti." : "Seleziona da 4 a 8 partecipanti.");
        return;
      }
      setBusy(true); setError("");
      const commonParams = {
        p_name: name.trim(), p_trophy_name: trophyChoice === "none" ? "Nessun trofeo" : trophyName.trim(), p_trophy_badge: "cup",
        p_trophy_image_path: trophyImagePath(trophyChoice),
        p_elo_multiplier: eloMultiplier, p_players: playerIds,
      };
      const { error: saveError } = scheduleMode === "complete"
        ? await supabase.rpc("create_complete_individual_tournament_with_trophy", commonParams)
        : await supabase.rpc("create_individual_tournament_with_trophy", { ...commonParams, p_cycles: cycles });
      if (saveError) { setError(saveError.message.includes("_with_trophy")
        ? "Per scegliere la coppa e le medaglie esegui migration-tornei-premi-scimmia.sql nel SQL Editor di Supabase."
        : saveError.message); setBusy(false); return; }
      await onSaved();
    }}>
      <div className="tournament-choice">
        <div><p className="eyebrow dark">MODALITÀ</p><h3>Come si gioca?</h3></div>
        <div className="ranking-switch tournament-team-mode" role="group" aria-label="Modalità del torneo">
          <button type="button" aria-pressed="false" onClick={onChooseTeams}>A coppie fisse</button>
          <button type="button" className="active" aria-pressed="true">Individuale</button>
        </div>
      </div>
      <p className="tournament-rule-note">Coppie variabili, un set per partita. Scegli se sorteggiare un incontro alla volta o preparare il girone completo.</p>
      <label>Nome torneo<input value={name} onChange={(event) => setName(event.target.value)} maxLength={70} required /></label>
      <div className="tournament-prize-form">
        <div className={`tournament-prize-preview${trophyChoice === "monkey" ? " has-medals" : ""}`}><TournamentPrizeChoicePreview choice={trophyChoice} /><span><b>{trophyChoice === "none" ? "Nessun trofeo" : trophyName || "Trofeo"}</b>{trophyChoice !== "none" ? <small>{trophyChoice === "monkey" ? "COPPA · ARGENTO · BRONZO" : "IN PALIO"}</small> : null}</span></div>
        <div>
          {trophyChoice !== "none" ? <label>Nome trofeo<input value={trophyName} onChange={(event) => setTrophyName(event.target.value)} maxLength={60} required /></label> : null}
          <span className="tournament-field-label">Coppa del torneo</span>
          <TournamentTrophyPicker choice={trophyChoice} onChange={setTrophyChoice} />
        </div>
      </div>
      <div className="tournament-form-head"><div><p className="eyebrow dark">PARTECIPANTI</p><h3>{n} selezionati</h3></div></div>
      <div className="tournament-participant-list">{profiles.map((profile) => {
        const selected = playerIds.includes(profile.id);
        return <label className={`tournament-participant${selected ? " is-selected" : ""}`} key={profile.id}>
          <input type="checkbox" checked={selected} disabled={!selected && n >= 8} onChange={() => {
            const next = selected ? playerIds.filter((id) => id !== profile.id) : [...playerIds, profile.id];
            setPlayerIds(next);
            if (next.length !== 5) setScheduleMode("adaptive");
          }} />
          <span>{profile.display_name}</span>
        </label>;
      })}</div>
      <div className="tournament-form-head"><div><p className="eyebrow dark">CALENDARIO</p><h3>Come creare le partite?</h3></div></div>
      <div className="ranking-switch tournament-team-mode" role="group" aria-label="Calendario individuale">
        <button type="button" className={scheduleMode === "adaptive" ? "active" : ""} aria-pressed={scheduleMode === "adaptive"} onClick={() => setScheduleMode("adaptive")}>Una alla volta</button>
        <button type="button" className={scheduleMode === "complete" ? "active" : ""} aria-pressed={scheduleMode === "complete"} disabled={n !== 5} onClick={() => setScheduleMode("complete")}>Girone completo</button>
      </div>
      <p className="tournament-rule-note">{scheduleMode === "complete"
        ? "Solo con 5 giocatori: 5 partite già programmate. Ognuno riposa una volta, gioca con tutti una volta e affronta ogni altro giocatore due volte."
        : "Il prossimo incontro si sorteggia dopo ogni risultato. Il girone completo è disponibile selezionando esattamente 5 giocatori."}</p>
      {scheduleMode === "adaptive" ? <label>Cicli completi<select value={cycles} onChange={(event) => setCycles(Number(event.target.value))}><option value={1}>1 ciclo</option><option value={2}>2 cicli</option><option value={3}>3 cicli</option></select></label> : null}
      <label>Moltiplicatore Elo<select value={eloMultiplier} onChange={(event) => setEloMultiplier(Number(event.target.value))}><option value={1}>×1</option><option value={2}>×2</option></select></label>
      {n >= 4 ? <p className="tournament-rule-note">{scheduleMode === "complete" ? 5 : gamesPerCycle * cycles} partite totali · premio finale: +30 / +20 / +10 Elo ai primi tre.</p> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <button className="button button-lime" disabled={busy || n < 4}>{busy ? "Creazione…" : "Crea torneo individuale"}</button>
    </form>;
}

export function TournamentsPage({
  tournaments,
  profiles,
  matches,
  viewerId,
  schemaReady,
  onCreate,
  onEdit,
  onRecord,
  onDraw,
  onDelete,
}: {
  tournaments: Tournament[];
  profiles: Profile[];
  matches: PadelMatch[];
  viewerId?: string | null;
  schemaReady: boolean;
  onCreate: () => void;
  onEdit: (tournament: Tournament) => void;
  onRecord: (context: TournamentMatchContext) => void;
  onDraw: (tournament: Tournament) => void;
  onDelete: (tournament: Tournament) => void;
}) {
  const [detailId, setDetailId] = useState<string | null>(null);
  const [showAllCompleted, setShowAllCompleted] = useState(false);
  const activeTournaments = tournaments.filter((tournament) => !tournamentIsCompleted(tournament, matches));
  const completedTournaments = tournaments.filter((tournament) => tournamentIsCompleted(tournament, matches));
  const detailTournament = detailId ? tournaments.find((tournament) => tournament.id === detailId) ?? null : null;

  if (detailTournament) {
    const completed = tournamentIsCompleted(detailTournament, matches);
    const playedMatches = detailTournament.fixtures.filter((fixture) => fixture.match_id && matches.some((match) => match.id === fixture.match_id)).length;
    return (
      <section className="page-section tournament-page tournament-detail-page">
        <button className="tournament-back" type="button" onClick={() => setDetailId(null)}>← Tutti i tornei</button>
        <article className="section-hero tournament-hero tournament-detail-hero">
          <BlockMark size="lg" />
          <div className="section-hero-head">
            <div><p className="eyebrow">{completed ? "TORNEO COMPLETATO" : "TORNEO IN CORSO"}</p><h1>{detailTournament.name}</h1><p>{playedMatches}/{detailTournament.mode === "individual" ? detailTournament.target_matches : detailTournament.fixtures.length} partite · Elo ×{detailTournament.elo_multiplier}</p></div>
            {/* Il tasto sta qui e non nella riga della home: si corregge un
                torneo dopo averlo aperto e aver visto cosa c'e da correggere. */}
            {canEditTournament(detailTournament, viewerId) || canDeleteTournament(detailTournament, viewerId) ? (
              <button className="button button-ghost" type="button" onClick={() => detailTournament.mode === "individual" ? onDelete(detailTournament) : onEdit(detailTournament)}>{detailTournament.mode === "individual" ? "Elimina" : "Modifica"}</button>
            ) : null}
          </div>
        </article>
        <article className="tournament-board-head">
          {/* Senza trofeo non c'e un riquadro "Nessun trofeo": era la superficie
              piu accesa della pagina per dire che manca qualcosa. */}
          {detailTournament.trophy_image_path ? <div className={`tournament-prize-card${detailTournament.trophy_image_path === MONKEY_TROPHY_PATH ? " has-medals" : ""}`}><TournamentPrizeVisual tournament={detailTournament} /><span><small>{detailTournament.trophy_image_path === MONKEY_TROPHY_PATH ? completed ? "PREMI ASSEGNATI" : "PREMI IN PALIO" : completed ? "TROFEO ASSEGNATO" : "TROFEO IN PALIO"}</small><b>{detailTournament.trophy_name}</b></span></div> : null}
          <div className="tournament-title-card"><p className="eyebrow dark">FORMULA</p><h2>{detailTournament.mode === "individual" ? "Coppie variabili" : "Girone all’italiana"}</h2><span>{tournamentFormatLabel(detailTournament)}</span></div>
        </article>
        <div className="tournament-layout">
          <section className="tournament-standings">
            <TournamentStandingsContent tournament={detailTournament} profiles={profiles} matches={matches} title={completed ? "Classifica finale" : "Situazione attuale"} />
          </section>
          <TournamentFixtures tournament={detailTournament} matches={matches} profiles={profiles} onRecord={completed ? undefined : onRecord} onDraw={onDraw} />
        </div>
      </section>
    );
  }

  return (
    <section className="page-section tournament-page tournament-home-page">
      <article className="section-hero tournament-hero">
        <BlockMark size="lg" />
        <div className="section-hero-head">
          <div><p className="eyebrow">THEBOYZ CUP</p><h1>Tornei</h1><p>A coppie fisse o individuali con coppie variabili.</p></div>
          <button className="button button-primary tournament-new-button" onClick={onCreate} disabled={!schemaReady}>+ NUOVO TORNEO</button>
        </div>
      </article>

      {!schemaReady ? (
        <p className="demo-profile-note">Per creare i tornei esegui <code>migration-tornei.sql</code> e <code>migration-tornei-formato.sql</code> nel SQL Editor di Supabase.</p>
      ) : (
        <>
          {activeTournaments.length ? (
            <section className="tournament-live-section">
              <div className="section-head tournament-section-head"><div className="section-head-label"><p className="eyebrow dark">IN CORSO</p><h2>Situazione del torneo</h2></div></div>
              {activeTournaments.map((tournament) => {
                const playedMatches = tournament.fixtures.filter((fixture) => fixture.match_id && matches.some((match) => match.id === fixture.match_id)).length;
                const target = tournament.mode === "individual" ? tournament.target_matches ?? 1 : tournament.fixtures.length;
                const progress = Math.round((playedMatches / target) * 100);
                return (
                  <article className="tournament-live-card" key={tournament.id}>
                    <div className="tournament-board-head">
                      {tournament.trophy_image_path ? <div className={`tournament-prize-card${tournament.trophy_image_path === MONKEY_TROPHY_PATH ? " has-medals" : ""}`}><TournamentPrizeVisual tournament={tournament} /><span><small>{tournament.trophy_image_path === MONKEY_TROPHY_PATH ? "PREMI IN PALIO" : "TROFEO IN PALIO"}</small><b>{tournament.trophy_name}</b></span></div> : null}
                      <div className="tournament-title-card">
                        <p className="eyebrow dark">TORNEO IN CORSO</p><h2>{tournament.name}</h2><span>{playedMatches}/{target} partite · Elo ×{tournament.elo_multiplier} · {tournamentFormatLabel(tournament).toLowerCase()}{tournament.trophy_image_path ? "" : " · senza trofeo"}</span>
                        <span className="tournament-progress" role="progressbar" aria-label="Partite giocate" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><i style={{ width: `${progress}%` }} /></span>
                      </div>
                      {/* Anche qui, non solo nella scheda: un torneo in corso
                          sta tutto in questa card — classifica e calendario
                          compresi — e nessuno pensa di doverla aprire per
                          correggerlo o eliminarlo. */}
                      {canEditTournament(tournament, viewerId) || canDeleteTournament(tournament, viewerId) ? (
                        <button className="button button-ghost tournament-card-edit" type="button" onClick={() => tournament.mode === "individual" ? onDelete(tournament) : onEdit(tournament)}>{tournament.mode === "individual" ? "Elimina" : "Modifica"}</button>
                      ) : null}
                    </div>
                    <div className="tournament-layout">
                      <div
                        className="tournament-standings tournament-standings-link"
                        role="button"
                        tabIndex={0}
                        onClick={() => setDetailId(tournament.id)}
                        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setDetailId(tournament.id); }}
                      >
                        <TournamentStandingsContent tournament={tournament} profiles={profiles} matches={matches} title="Situazione attuale" actionLabel="Dettagli" />
                      </div>
                      <TournamentFixtures tournament={tournament} matches={matches} profiles={profiles} onRecord={onRecord} onDraw={onDraw} />
                    </div>
                  </article>
                );
              })}
            </section>
          ) : null}

          <section className="tournament-recent-section">
            <div className="section-head tournament-section-head"><div className="section-head-label"><p className="eyebrow dark">ARCHIVIO</p><h2>Tornei</h2></div></div>
            {completedTournaments.length ? (
              <div className="tournament-recent-list">
                {(showAllCompleted ? completedTournaments : completedTournaments.slice(0, 3)).map((tournament) => {
                  const individual = tournament.mode === "individual" ? buildIndividualStandings(tournament, matches) : null;
                  const standings = individual ? null : buildTournamentStandings(tournament, matches);
                  const winner = standings?.[0];
                  return (
                    <article className="tournament-recent-card" key={tournament.id}>
                      <div className="tournament-recent-head">
                        <TournamentTrophyVisual tournament={tournament} compact />
                        <div><p className="eyebrow dark">COMPLETATO</p><h3>{tournament.name}</h3><span>{tournament.fixtures.length} partite · Elo ×{tournament.elo_multiplier}</span></div>
                        <div className="tournament-winner"><small>VINCITORI</small><b>{individual ? individual.filter((row) => row.rankPosition === 1).map((row) => profiles.find((profile) => profile.id === row.profileId)?.display_name ?? "—").join(" · ") : winner?.team.name ?? "—"}</b></div>
                      </div>
                      <button className="tournament-recent-ranking" type="button" onClick={() => setDetailId(tournament.id)}>
                        <span>CLASSIFICA FINALE</span>
                        <div>
                          {individual ? individual.filter((row) => row.rankPosition <= 3).map((row) => <span key={row.profileId}><b>#{row.rankPosition}</b>{profiles.find((profile) => profile.id === row.profileId)?.display_name}<strong>{row.wins}V</strong></span>) : standings?.slice(0, 3).map((row, index) => <span key={row.team.id}><b>#{index + 1}</b>{row.team.name}<strong>{row.wins}V</strong></span>)}
                        </div>
                        <strong>Apri dettagli →</strong>
                      </button>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="compact-empty tournament-recent-empty"><span className="compact-empty-icon"><NavGlyph name="ranking" /></span><p>{tournaments.length ? "Nessun torneo concluso." : "Nessun torneo creato."}</p></div>
            )}
            {completedTournaments.length > 3 ? (
              <button className="button button-ghost button-full tournament-see-all" type="button" onClick={() => setShowAllCompleted((current) => !current)}>{showAllCompleted ? "Vedi gli ultimi 3" : `Vedi tutto (${completedTournaments.length})`}</button>
            ) : null}
          </section>
        </>
      )}
    </section>
  );
}
