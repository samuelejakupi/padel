"use client";

import Image from "next/image";
import { useId } from "react";
import { type PadelMatch, type Profile } from "@/lib/supabase";
import CabinetMarquee from "../CabinetMarquee";
import { basePath, decidedSets, eloLabel, matchIsDraw, padelWinRateRatio, rankOf, sortPadelProfiles } from "../core";

export function youtubeId(url?: string | null) {
  if (!url) return null;
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/,
  );
  return match ? match[1] : null;
}

// ---------------------------------------------------------------------------
// Bacheca giocatore
//
// I badge sono primati comparativi calcolati dai dati già caricati. Non vanno
// salvati né aggiornati a mano: cambiano proprietario insieme alla classifica.
// ---------------------------------------------------------------------------

export type BadgeTone = "gold" | "red" | "ice" | "violet" | "bronze" | "steel";
export type BadgeGlyph =
  | "goat"
  | "summit"
  | "flame"
  | "sets"
  | "turkey"
  | "hook"
  | "dominator"
  | "comeback"
  | "marathon"
  | "duo"
  | "goat-slayer"
  | "mvp"
  | "centurion"
  | "trophy";

export type Badge = {
  id: string;
  tone: BadgeTone;
  glyph: BadgeGlyph;
  label: string;
  meaning: string;
  criterion: string;
  value: string;
  progressLabel: string;
  progress: number;
  unlocked: boolean;
};

export type PlayerBadgeMetrics = {
  bestWinStreak: number;
  bestLoseStreak: number;
  bestSetWinStreak: number;
  firstPlaceMatches: number;
  straightSetWins: number;
  comebackWins: number;
  matchesPlayed: number;
  weightedMatchesPlayed: number;
  winsAgainstGoat: number;
  bestPairMatches: number;
  bestPairRate: number;
  ownsTopPair: boolean;
  mvpWins: number;
};

export function emptyBadgeMetrics(): PlayerBadgeMetrics {
  return {
    bestWinStreak: 0,
    bestLoseStreak: 0,
    bestSetWinStreak: 0,
    firstPlaceMatches: 0,
    straightSetWins: 0,
    comebackWins: 0,
    matchesPlayed: 0,
    weightedMatchesPlayed: 0,
    winsAgainstGoat: 0,
    bestPairMatches: 0,
    bestPairRate: 0,
    ownsTopPair: false,
    mvpWins: 0,
  };
}

export function chronologicalMatches(matches: PadelMatch[]) {
  return matches.filter((match) => !match.is_friendly).sort((a, b) =>
    new Date(a.played_at).getTime() - new Date(b.played_at).getTime()
    || new Date(a.created_at ?? a.played_at).getTime() - new Date(b.created_at ?? b.played_at).getTime()
    || a.id.localeCompare(b.id),
  );
}

// Ogni partita competitiva vale uno negli emblemi, anche al set secco.
// Le amichevoli restano escluse; il peso Elo è calcolato separatamente.
export function emblemMatchWeight(match: PadelMatch) {
  return match.is_friendly ? 0 : 1;
}

// Vetta e Maratoneta misurano le presenze pesate, non le serie o i traguardi.
export function emblemPresenceWeight(match: PadelMatch) {
  return match.is_friendly ? 0 : match.sets.length === 1 ? 0.5 : 1;
}

export function formatEmblemCount(value: number) {
  return new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 }).format(value);
}

export function buildBadgeMetrics(profiles: Profile[], matches: PadelMatch[]) {
  const metrics = new Map(profiles.map((profile) => [profile.id, emptyBadgeMetrics()]));
  const currentWinRuns = new Map<string, number>();
  const currentLoseRuns = new Map<string, number>();
  const currentSetRuns = new Map<string, number>();
  const ratings = new Map(profiles.map((profile) => [profile.id, profile.rating]));
  const played = new Map(profiles.map((profile) => [profile.id, 0]));
  const ordered = chronologicalMatches(matches);

  // Ricostruisce i rating iniziali per sapere chi fosse davvero primo prima
  // di ogni partita, invece di applicare retroattivamente la classifica odierna.
  ordered.forEach((match) => match.players.forEach((player) => {
    ratings.set(player.profile_id, (ratings.get(player.profile_id) ?? 1000) - (player.rating_delta ?? 0));
  }));

  ordered.forEach((match) => {
    const matchWeight = emblemMatchWeight(match);
    const activeBefore = profiles.filter((profile) => (played.get(profile.id) ?? 0) > 0);
    const leaderRatingBefore = activeBefore.length
      ? Math.max(...activeBefore.map((profile) => ratings.get(profile.id) ?? 1000))
      : null;
    const goatsBefore = new Set(
      activeBefore
        .filter((profile) => (ratings.get(profile.id) ?? 1000) === leaderRatingBefore)
        .map((profile) => profile.id),
    );
    const drawn = matchIsDraw(match);
    const losingGoat = !drawn && match.players.some(
      (player) => goatsBefore.has(player.profile_id) && player.team !== match.winner_team,
    );

    (match.mvps ?? []).forEach((mvp) => {
      const item = metrics.get(mvp.profile_id);
      if (item) item.mvpWins += matchWeight;
    });

    match.players.forEach((player) => {
      const item = metrics.get(player.profile_id);
      if (!item) return;
      const won = !drawn && player.team === match.winner_team;
      // Le serie di vittorie e di sconfitte restano com'erano: un pareggio
      // non le allunga e non le azzera, esattamente come nel database.
      const winRun = drawn
        ? currentWinRuns.get(player.profile_id) ?? 0
        : won ? (currentWinRuns.get(player.profile_id) ?? 0) + matchWeight : 0;
      const loseRun = drawn
        ? currentLoseRuns.get(player.profile_id) ?? 0
        : won ? 0 : (currentLoseRuns.get(player.profile_id) ?? 0) + matchWeight;
      currentWinRuns.set(player.profile_id, winRun);
      currentLoseRuns.set(player.profile_id, loseRun);
      item.bestWinStreak = Math.max(item.bestWinStreak, winRun);
      item.bestLoseStreak = Math.max(item.bestLoseStreak, loseRun);
      item.matchesPlayed += matchWeight;
      item.weightedMatchesPlayed += emblemPresenceWeight(match);
      if (won && losingGoat) item.winsAgainstGoat += matchWeight;

      // Il set interrotto sta fuori da tutti i conteggi sui set: non e stato
      // vinto da nessuno dei due, e contarlo come perso falserebbe la serie.
      const sets = decidedSets(match.sets).sort((a, b) => a.set_number - b.set_number);
      const setResults = sets.map((set) => player.team === 1
        ? set.team1_games > set.team2_games
        : set.team2_games > set.team1_games);
      setResults.forEach((setWon) => {
        const run = setWon ? (currentSetRuns.get(player.profile_id) ?? 0) + 1 : 0;
        currentSetRuns.set(player.profile_id, run);
        item.bestSetWinStreak = Math.max(item.bestSetWinStreak, run);
      });

      if (won) {
        const ownSetWins = setResults.filter(Boolean).length;
        const lostSets = setResults.length - ownSetWins;
        if (ownSetWins >= 2 && lostSets === 0) item.straightSetWins += 1;
        // Una rimonta esiste soltanto dentro una vittoria: i pareggi vengono
        // esclusi a monte da `won`, anche se il primo set era stato perso.
        if (!drawn && setResults[0] === false) item.comebackWins += 1;
      }
    });

    match.players.forEach((player) => {
      ratings.set(player.profile_id, (ratings.get(player.profile_id) ?? 1000) + (player.rating_delta ?? 0));
      played.set(player.profile_id, (played.get(player.profile_id) ?? 0) + 1);
    });

    const activeAfter = profiles.filter((profile) => (played.get(profile.id) ?? 0) > 0);
    if (activeAfter.length) {
      const top = Math.max(...activeAfter.map((profile) => ratings.get(profile.id) ?? 1000));
      activeAfter.forEach((profile) => {
        if ((ratings.get(profile.id) ?? 1000) === top) {
          const item = metrics.get(profile.id);
          if (item) item.firstPlaceMatches += emblemPresenceWeight(match);
        }
      });
    }
  });

  type PairRun = { ids: string[]; matches: number; wins: number; losses: number };
  const pairs = new Map<string, PairRun>();
  ordered.forEach((match) => ([1, 2] as const).forEach((side) => {
    const matchWeight = emblemMatchWeight(match);
    const ids = match.players.filter((player) => player.team === side).map((player) => player.profile_id).sort();
    if (ids.length !== 2) return;
    const key = ids.join("|");
    const pair = pairs.get(key) ?? { ids, matches: 0, wins: 0, losses: 0 };
    pair.matches += matchWeight;
    if (!matchIsDraw(match)) {
      pair.wins += match.winner_team === side ? matchWeight : 0;
      pair.losses += match.winner_team === side ? 0 : matchWeight;
    }
    pairs.set(key, pair);
  }));

  const eligiblePairs = [...pairs.values()].filter(
    (pair) => pair.matches >= 5 && pair.wins + pair.losses > 0,
  );
  const topPairRate = eligiblePairs.length
    ? Math.max(...eligiblePairs.map((pair) => padelWinRateRatio(pair.wins, pair.losses)))
    : 0;
  pairs.forEach((pair) => {
    const rate = padelWinRateRatio(pair.wins, pair.losses);
    pair.ids.forEach((id) => {
      const item = metrics.get(id);
      if (!item) return;
      const shouldUseEligiblePair = pair.matches >= 5 && (
        item.bestPairMatches < 5
        || rate > item.bestPairRate
        || (rate === item.bestPairRate && pair.matches > item.bestPairMatches)
      );
      const shouldUseDevelopingPair = pair.matches < 5
        && item.bestPairMatches < 5
        && pair.matches > item.bestPairMatches;
      if (shouldUseEligiblePair || shouldUseDevelopingPair) {
        item.bestPairMatches = pair.matches;
        item.bestPairRate = rate;
      }
      if (pair.matches >= 5 && rate === topPairRate) item.ownsTopPair = true;
    });
  });

  return { metrics, topPairRate };
}

export function clampProgress(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

// Gli emblemi rifatti sono disegnati qui e non caricati da public/SVG come
// immagini. Dentro a un <img> un SVG e un documento chiuso in se stesso: non
// vede i caratteri della pagina — il "#1" ricadeva su un font di sistema — e
// le sue animazioni su iOS non partono. Inlineato, il colore lo scrive il
// CSS di globals.css come per ogni altra cosa, il filo di luce si muove
// davvero, e il numero resta testo, quindi si cambia senza ridisegnare
// niente. Quelli non ancora rifatti continuano a pescare il webp.
export type EmblemName = "kraken" | "trophy" | "mvp";

export const EMBLEM_COMPONENT: Partial<Record<BadgeGlyph, EmblemName>> = {
  trophy: "trophy",
};

// Il contorno esterno e quello interno sono gli stessi per tutti: cambia
// solo il disegno in mezzo.
export const EMBLEM_HEX_INNER = "64 12.64 114.59 35.56 100 96.24 64 115.02 28 96.24 13.41 35.56";
export const EMBLEM_HEX_OUTER = "64 0 0 29 18.03 104.03 64 128 109.97 104.03 128 29";
export const EMBLEM_FRAME =
  "M64,12.64l50.59,22.92-14.58,60.68-36,18.78-36-18.78-14.58-60.68L64,12.64h0ZM64,0L0,29l18.03,75.03,45.97,23.97,45.97-23.97,18.03-75.03L64,0h0Z";

export function Emblem({ name, rank = "#1", className }: { name: EmblemName; rank?: string; className?: string }) {
  // I due gradienti sono riferiti per id, e lo stesso emblema compare piu
  // volte nella stessa pagina: senza un identificatore unico tutte le copie
  // pescherebbero dal primo.
  const id = useId();
  const fillId = `${id}-fill`;
  const ringId = `${id}-ring`;
  const stops = [0, 0.25, 0.5, 0.75, 1];

  return (
    <svg
      className={`emblem${className ? ` ${className}` : ""}`}
      viewBox="-4 -4 136 136"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {/* Le fermate non hanno colore qui: glielo da il CSS, che le anima
            una sfalsata dall'altra. E cosi che la luce sembra viaggiare
            lungo il gradiente invece di accendersi tutta insieme. */}
        <linearGradient className="emblem-fill" id={fillId} x1="0" y1="0" x2="1" y2="1">
          {stops.map((offset) => <stop key={offset} offset={offset} />)}
        </linearGradient>
        <linearGradient className="emblem-ring" id={ringId} x1="0" y1="0" x2="1" y2="1">
          {stops.map((offset) => <stop key={offset} offset={offset} />)}
        </linearGradient>
      </defs>

      <polygon fill={`url(#${fillId})`} points={EMBLEM_HEX_INNER} />

      <g className="emblem-art">
        <path
          d={name === "kraken"
            ? "M64,12.64l50.59,22.92-14.58,60.68-36,18.78-36-18.78-14.58-60.68,50.59-22.92h0ZM64,0L0,29l18.03,75.03,45.97,23.97,45.97-23.97,18.03-75.03L64,0h0Z"
            : EMBLEM_FRAME}
        />
        {name === "kraken" ? (
          <polygon points="97.43 50.63 84.06 50.63 77.37 50.63 70.69 57.32 77.37 57.32 90.74 64 97.43 70.69 97.43 84.06 90.74 90.75 84.06 90.75 77.37 84.06 77.37 77.38 84.06 77.38 77.37 84.06 90.74 84.06 90.74 77.37 84.06 70.69 70.69 70.69 57.31 84.06 57.31 90.75 64 97.43 70.69 90.75 70.69 84.06 64 90.75 64 84.06 70.69 84.06 77.37 90.75 70.69 97.43 64 104.12 57.31 97.43 50.63 90.75 50.63 77.38 57.31 64 43.94 70.69 37.26 77.37 37.26 90.75 43.94 84.06 43.94 90.75 37.26 90.75 30.57 84.06 30.57 70.69 37.26 64 50.63 57.32 57.31 57.32 50.63 50.63 30.57 50.64 37.26 57.32 37.26 57.32 30.57 57.32 30.57 50.64 37.26 43.95 43.94 43.95 50.63 50.63 43.94 30.57 64 23.88 84.06 30.57 77.37 50.63 84.06 43.95 90.74 43.95 97.43 50.63 97.43 57.32 90.74 57.32 90.74 57.32 97.43 50.63" />
        ) : null}
        {name === "trophy" ? (
          <path d="M86.25,45.87l.82-19.24-23.08,11.55-23.08-11.56.82,19.26h-20.19l4,23.08,30.74,15.39-15.36,5.7,1,7.38,22.08,11,22.07-11,1-7.38-15.36-5.7,30.76-15.39,4-23.08h-20.21ZM30.05,66.27l-2-16.18h13.86l.96,22.6-12.82-6.42ZM85.11,72.69l.96-22.6h13.86l-2,16.18-12.82,6.42Z" />
        ) : null}
        {name === "mvp" ? (
          <path d="M27 82 23 43l24 17 17-34 17 34 24-17-4 39-37 18Zm9-7h56l2-17-18 13-12-24-12 24-18-13Zm2 14h52v10H38Z" />
        ) : null}
      </g>

      {/* Ancorato al centro e non al bordo sinistro: il numero puo crescere
          — #2, #10 — e resta comunque in mezzo alla coppa. */}
      {name === "trophy" ? (
        <text className="emblem-rank" x="64" y="71.49" textAnchor="middle">{rank}</text>
      ) : null}

      <polygon className="emblem-stroke" points={EMBLEM_HEX_OUTER} stroke={`url(#${ringId})`} />
    </svg>
  );
}

export function playerBadges(profile: Profile, profiles: Profile[], matches: PadelMatch[]): Badge[] {
  const { metrics, topPairRate } = buildBadgeMetrics(profiles, matches);
  const own = metrics.get(profile.id) ?? emptyBadgeMetrics();
  const all = [...metrics.values()];
  const ranked = sortPadelProfiles(profiles).filter((item) => item.matches_played > 0);
  const rank = rankOf(ranked, profile.id);
  const leaderRating = ranked[0]?.rating ?? profile.rating;
  const lastRating = ranked[ranked.length - 1]?.rating ?? profile.rating;
  const isGoat = rank === 1;
  const isLast = ranked.length > 1 && profile.matches_played > 0 && profile.rating === lastRating;
  const maxOf = (pick: (item: PlayerBadgeMetrics) => number) => all.length ? Math.max(...all.map(pick)) : 0;

  const recordBadge = (
    id: string,
    tone: BadgeTone,
    glyph: BadgeGlyph,
    label: string,
    meaning: string,
    criterion: string,
    value: number,
    target: number,
    unit: string,
  ): Badge => {
    const unlocked = target > 0 && value === target;
    const remaining = Math.max(0, target - value);
    return {
      id,
      tone,
      glyph,
      label,
      meaning,
      criterion,
      value: `${formatEmblemCount(value)} ${unit}`,
      progress: target ? clampProgress((value / target) * 100) : 0,
      // Quando il primato è già suo, il valore sopra basta: ripeterlo come
      // "Primato" non aggiunge alcuna informazione. La seconda riga serve
      // soltanto a chi deve ancora raggiungere il record.
      progressLabel: unlocked ? "" : target ? `Ne mancano ${formatEmblemCount(remaining)}` : "In attesa del primo risultato",
      unlocked,
    };
  };

  const goatGap = Math.max(0, leaderRating - profile.rating);
  const pairReady = own.bestPairMatches >= 5;
  const pairProgress = pairReady && topPairRate
    ? (own.bestPairRate / topPairRate) * 100
    : (own.bestPairMatches / 5) * 100;

  return [
    {
      id: "goat", tone: "gold", glyph: "goat", label: "GOAT",
      meaning: "Il giocatore al comando della classifica individuale.",
      criterion: "Occupa il primo posto per Elo; i pari merito condividono il titolo.",
      value: profile.matches_played ? `#${rank} · ${eloLabel(profile.rating)} Elo` : "Non classificato",
      progress: isGoat ? 100 : leaderRating ? clampProgress((profile.rating / leaderRating) * 100) : 0,
      progressLabel: isGoat ? "Sei in vetta" : profile.matches_played ? `${eloLabel(goatGap)} Elo dalla vetta` : "Gioca la prima partita",
      unlocked: isGoat,
    },
    recordBadge("summit", "gold", "summit", "RE DELLA VETTA", "Chi ha trascorso più partite al primo posto.", "Conta ogni partita dopo la quale sei rimasto o salito al numero uno: una partita standard vale 1, un set secco 0,5.", own.firstPlaceMatches, maxOf((item) => item.firstPlaceMatches), "turni in vetta"),
    recordBadge("flame", "red", "flame", "FIAMMA VINCENTE", "La serie di vittorie più lunga.", "Ottieni il maggior numero di vittorie consecutive nella cronologia.", own.bestWinStreak, maxOf((item) => item.bestWinStreak), "vittorie di fila"),
    {
      id: "turkey", tone: "bronze", glyph: "turkey", label: "TACCHINO DI CODA",
      meaning: "Il giocatore attualmente ultimo in classifica.",
      criterion: "Viene assegnato all'ultimo classificato che abbia disputato almeno una partita.",
      value: profile.matches_played ? `Posizione #${rank}` : "Non classificato",
      progress: isLast ? 100 : 0,
      progressLabel: isLast ? "Ultimo posto attuale" : "Badge non assegnato",
      unlocked: isLast,
    },
    recordBadge("hook", "bronze", "hook", "AL GANCIO", "La serie di sconfitte consecutive più lunga.", "Detieni il record storico di sconfitte una dopo l'altra.", own.bestLoseStreak, maxOf((item) => item.bestLoseStreak), "sconfitte di fila"),
    recordBadge("marathon", "steel", "marathon", "MARATONETA", "Il giocatore con più presenze.", "Detieni il maggior numero di presenze: una partita standard vale 1, un set secco 0,5.", own.weightedMatchesPlayed, maxOf((item) => item.weightedMatchesPlayed), "partite"),
    {
      id: "duo", tone: "violet", glyph: "duo", label: "COPPIA D'ORO",
      meaning: "I componenti della coppia con il rendimento migliore.",
      criterion: "Miglior percentuale di vittorie tra le coppie con almeno 5 partite insieme.",
      value: own.bestPairMatches ? `${Math.round(own.bestPairRate * 100)}% · ${formatEmblemCount(own.bestPairMatches)} match` : "Nessuna coppia",
      progress: own.ownsTopPair ? 100 : clampProgress(pairProgress),
      progressLabel: own.ownsTopPair ? "Miglior coppia" : pairReady ? `${Math.round(topPairRate * 100)}% da raggiungere` : `${formatEmblemCount(own.bestPairMatches)}/5 partite di coppia`,
      unlocked: own.ownsTopPair,
    },
    recordBadge("goat-slayer", "red", "goat-slayer", "AMMAZZA-GOAT", "Chi ha battuto più volte il numero uno.", "Conta solo quando l'avversario era GOAT prima dell'inizio della partita.", own.winsAgainstGoat, maxOf((item) => item.winsAgainstGoat), "GOAT battuti"),
    recordBadge("mvp", "gold", "mvp", "RE DEGLI MVP", "Chi ha conquistato più riconoscimenti MVP.", "Conta gli MVP assegnati nelle partite abilitate alla votazione; le votazioni finite in parità non assegnano punti.", own.mvpWins, maxOf((item) => item.mvpWins), "MVP"),
    {
      id: "trophy", tone: "gold", glyph: "trophy", label: "CAMPIONE",
      meaning: "Chi ha vinto almeno un torneo del gruppo.",
      criterion: "Si conquista alzando il trofeo di una THEBOYZ CUP conclusa.",
      value: "Sala trofei",
      progress: 0,
      progressLabel: "Vinci un torneo",
      unlocked: false,
    },
    {
      id: "centurion", tone: "steel", glyph: "centurion", label: "CENTURIONE",
      meaning: "Il riconoscimento personale per chi ha raggiunto 20 presenze.",
      criterion: "Si conquista disputando almeno 20 partite e non dipende dai risultati degli altri.",
      value: `${formatEmblemCount(own.matchesPlayed)} partite`,
      progress: clampProgress((own.matchesPlayed / 20) * 100),
      progressLabel: own.matchesPlayed >= 20 ? "Traguardo conquistato" : `${formatEmblemCount(own.matchesPlayed)}/20 partite`,
      unlocked: own.matchesPlayed >= 20,
    },
  ];
}

export function BadgeGlyphIcon({ name }: { name: BadgeGlyph }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {name === "trophy" ? (
        <>
          <path d="M7.4 3.8h9.2v5.1a4.6 4.6 0 0 1-9.2 0z" />
          <path d="M7.4 5.4H4.9v1.4a3.1 3.1 0 0 0 2.9 3.1M16.6 5.4h2.5v1.4a3.1 3.1 0 0 1-2.9 3.1" />
          <path d="M12 13.5v3.2M8.6 20.2h6.8l-.7-3.5H9.3z" />
        </>
      ) : null}
      {name === "flame" ? (
        <path d="M12 2.9c3.4 3 5.1 5.5 5.1 7.6 0 1.2-.5 2.2-1.4 2.9.3-1.7-.4-3.2-2-4.6.2 3-1 4.5-2.4 5.7-1 .9-1.6 1.8-1.6 3 0 .6.2 1.2.5 1.7-2.1-.9-3.5-2.9-3.5-5.4 0-2.1 1-3.9 2.4-5.5-.1 1.2.2 2.1.9 2.7.5-3.6 1.4-6.2 2-8.1Z" />
      ) : null}
      {name === "goat" ? (
        <>
          <path d="M8.2 7.2C4.1 7.4 3.3 3.1 5 2.3c-.2 2.1 1.2 3 3.8 2.8M15.8 7.2c4.1.2 4.9-4.1 3.2-4.9.2 2.1-1.2 3-3.8 2.8" />
          <path d="M7.8 6.1 5.6 9l2.1.2C7.4 14 9 19.7 12 21c3-1.3 4.6-7 4.3-11.8l2.1-.2-2.2-2.9M9.4 12.1h.1m5 0h.1M10 16.4c1.3.8 2.7.8 4 0" />
        </>
      ) : null}
      {name === "summit" ? <><path d="m3 18 6.2-9 2.1 2.8L14.8 6 21 18z" /><path d="M8.4 4.8 9.3 2l2.7 2 2.7-2 .9 2.8zM12 18v4" /></> : null}
      {name === "sets" ? <><rect x="5" y="3.5" width="14" height="4.5" rx="1" /><rect x="5" y="9.8" width="14" height="4.5" rx="1" /><rect x="5" y="16.1" width="14" height="4.5" rx="1" /><path d="M9 5.8h6M9 12h6M9 18.3h6" /></> : null}
      {name === "turkey" ? <><path d="M12 9C5 9 3.4 4.6 5.2 3.2c.8 2.2 2.5 3.1 4 3.4C7.8 3.9 9.4 2.1 11 5c.5-3 2.5-3 2.8.2 2.3-2.6 3.7-.7 1.7 2.2 2.7 4.6 3.1 7" /><path d="M10.4 8.3c-2 1.3-2.3 4.1-.6 5.3-1.7 1.6-1.1 5.5 2.2 6.4 3.3-.9 3.9-4.8 2.2-6.4 1.7-1.2 1.4-4-.6-5.3M12.7 10.1h.1M12.8 11.8l1.8.6-1.7.8" /></> : null}
      {name === "hook" ? <><path d="M12 3v11.2a5.3 5.3 0 1 1-5.3-5.3" /><path d="m4.2 10.4 2.5-1.5.6 2.8" /><circle cx="12" cy="3.5" r="1.8" /></> : null}
      {name === "dominator" ? <><rect x="3.7" y="6" width="16.6" height="12" rx="2" /><text x="12" y="14.7" textAnchor="middle" stroke="none" fill="currentColor" fontSize="7" fontWeight="900">2–0</text></> : null}
      {name === "comeback" ? <><path d="M5 17c1.8-7.8 8.2-10.2 14-7" /><path d="m15.8 6.4 3.2 3.7-4.7 2M5 17l3-1.2L6.9 20" /></> : null}
      {name === "marathon" ? <><path d="M7 3h10M7 21h10M8 3c0 5 1.7 6.7 4 9-2.3 2.3-4 4-4 9M16 3c0 5-1.7 6.7-4 9 2.3 2.3 4 4 4 9" /><path d="M3 8h4m10 0h4M4 6 2 8l2 2m16-4 2 2-2 2" /></> : null}
      {name === "duo" ? <><path d="M9.5 4 4 6.2v5c0 3.5 2.2 6.2 5.5 7.5 3.3-1.3 5.5-4 5.5-7.5v-5z" /><path d="M14.5 4 20 6.2v5c0 3.5-2.2 6.2-5.5 7.5M9.5 11.2l2.5 2.5 2.5-2.5" /></> : null}
      {name === "goat-slayer" ? <><path d="m5 6 2-3 3 2 2-3 2 3 3-2 2 3-3 3H8z" /><path d="M6 19c4.5-7.5 7-9 12-7-3.2.8-4.7 3.4-5 7M4 20 20 8" /></> : null}
      {name === "centurion" ? <><path d="M6 18V9a6 6 0 0 1 12 0v9M6 11h12M9 18v-4m6 4v-4M9 5.2C10 3.5 11 2.5 12 2c1 1.5 1.7 3 1.7 5" /><text x="12" y="10" textAnchor="middle" stroke="none" fill="currentColor" fontSize="5" fontWeight="900">XX</text></> : null}
    </svg>
  );
}

export function BadgeTile({ badge, ghost }: { badge: Badge; ghost: boolean }) {
  const emblem = EMBLEM_COMPONENT[badge.glyph];
  return (
    <article
      className={`badge badge-${badge.tone} ${badge.unlocked ? "is-unlocked" : "is-locked"}`}
      // La copia del nastro non si raggiunge col tab: sono gli stessi emblemi
      // scritti due volte, e chi naviga da tastiera li sentirebbe annunciare
      // tutti in doppio.
      tabIndex={ghost ? -1 : 0}
      aria-hidden={ghost ? true : undefined}
      aria-label={ghost ? undefined : `${badge.label}. ${badge.meaning}${badge.progressLabel ? ` ${badge.progressLabel}` : ""}`}
    >
      <div className="badge-emblem" aria-hidden="true">
        {emblem ? (
          <Emblem name={emblem} className="badge-art" />
        ) : (
          <Image className="badge-art" src={`${basePath}/emblems/${badge.glyph}.webp?v=rework-20261011`} alt="" width={128} height={168} />
        )}
      </div>
      <div className="badge-tooltip" role="tooltip">
        <strong>{badge.label}</strong>
        <p>{badge.meaning}</p>
        <span>{badge.criterion}</span>
        <small>{badge.value}{badge.progressLabel ? ` · ${badge.progressLabel}` : ""}</small>
      </div>
    </article>
  );
}

export function BadgeList({ badges }: { badges: Badge[] }) {
  return (
    <CabinetMarquee
      items={badges}
      rowClassName="badge-grid"
      keyOf={(badge) => badge.id}
      renderItem={(badge, ghost) => <BadgeTile badge={badge} ghost={ghost} />}
    />
  );
}

export function FieldRegister({
  badges,
}: {
  badges: Badge[];
}) {
  // Il registro non ripete statistiche generiche: mette davanti gli emblemi
  // ancora bloccati per cui il giocatore ha gia fatto strada. Quelli a zero
  // restano in coda, cosi il foglio e utile anche a chi ha appena iniziato.
  const registerEntries = [...badges]
    .filter((badge) => !badge.unlocked && badge.id !== "trophy")
    .sort((a, b) => b.progress - a.progress || a.label.localeCompare(b.label))
    .slice(0, 3);

  if (!registerEntries.length) return null;
  return (
    <section className="field-register" aria-labelledby="field-register-title">
      <header className="field-register-head">
        <h3 id="field-register-title">Prossimi traguardi</h3>
        <small>Gli emblemi più vicini</small>
      </header>
      <ul className="field-register-list">
        {registerEntries.map((entry) => (
          <li className="field-register-card" key={entry.id}>
            <span className="field-register-icon" aria-hidden="true">
              <BadgeGlyphIcon name={entry.glyph} />
            </span>
            <div>
              <b>{entry.label}</b>
              <p>{entry.value} · {entry.progressLabel}</p>
              <span className="field-register-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={entry.progress} aria-label={`${entry.label}: ${entry.progress}% del percorso`}>
                <i style={{ width: `${entry.progress}%` }} />
              </span>
            </div>
            <strong>{entry.progress}<small>%</small></strong>
          </li>
        ))}
      </ul>
    </section>
  );
}
