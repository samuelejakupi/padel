"use client";

import Image from "next/image";
import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  hasSupabaseConfig,
  type MatchEvent,
  type PadelMatch,
  type PadelSet,
  type PlayerPlay,
  type Profile,
  supabase,
} from "@/lib/supabase";

type View = "padel" | "pizza";
type PadelView = "overview" | "ranking" | "matches" | "player";
type PizzaRankingMode = "contemporary" | "classic";
type PizzaRankingEntry = {
  name: string;
  place?: string;
  address?: string;
  location: number;
  pizza: number;
  dessert: number;
  price: number;
  fabio: number;
  total: number;
};

type PizzaVote = {
  restaurant_id: string;
  voter_id: string;
  location: number;
  pizza: number;
  dessert: number;
  price: number;
  bonus_fabio: number;
};

type PizzaRestaurantRecord = {
  id: string;
  name: string;
  place: string | null;
  created_by: string;
  created_at: string;
  votes: PizzaVote[];
};

type PizzaDisplayEntry = PizzaRankingEntry & {
  id?: string;
  isNew?: boolean;
  votesCount?: number;
  votes?: PizzaVote[];
  pending?: boolean;
};

type PizzaSession = {
  id: string;
  restaurant_id: string;
  opened_by: string;
  opened_at: string;
  completed_at: string | null;
  participants: PizzaSessionParticipant[];
};

type PizzaSessionParticipant = {
  voter_id: string;
  voted_at: string | null;
};

type PizzaSessionVote = {
  session_id: string;
  voter_id: string;
  location: number;
  pizza: number;
  dessert: number;
  price: number;
  bonus_fabio: number;
};

// Le quattro categorie ordinarie mantengono i vecchi pesi e valgono 93 punti.
// Gli eventuali 7 punti di Fabio completano il totale; senza Fabio il valore
// ordinario viene riscalato da 93 a 100.
const PIZZA_WEIGHTS = { location: 21, pizza: 30, dessert: 12, price: 30 } as const;
const PIZZA_BASE_TOTAL = 93;

function pizzaScore(vote: { location: number; pizza: number; dessert: number; price: number }) {
  return (
    (vote.location / 10) * PIZZA_WEIGHTS.location
    + (vote.pizza / 10) * PIZZA_WEIGHTS.pizza
    + (vote.dessert / 10) * PIZZA_WEIGHTS.dessert
    + (vote.price / 10) * PIZZA_WEIGHTS.price
  );
}

function sessionIsOpen(session: PizzaSession) {
  return session.completed_at === null;
}

function roundPizzaScore(value: number) {
  return Math.floor(value + 0.5);
}

function sessionHasFabio(session: PizzaSession, profiles: Profile[]) {
  return session.participants.some(({ voter_id }) => {
    const profile = profiles.find((item) => item.id === voter_id);
    return profile?.display_name.toLowerCase() === "fabio";
  });
}

function finalPizzaScore(votes: PizzaSessionVote[], session: PizzaSession, profiles: Profile[]) {
  if (!votes.length) return 0;
  const ordinary = votes.reduce((sum, vote) => sum + pizzaScore(vote), 0) / votes.length;
  if (!sessionHasFabio(session, profiles)) {
    return roundPizzaScore((ordinary / PIZZA_BASE_TOTAL) * 100);
  }
  const fabioId = session.participants.find(({ voter_id }) => (
    profiles.find((profile) => profile.id === voter_id)?.display_name.toLowerCase() === "fabio"
  ))?.voter_id;
  const fabioBonus = votes.find((vote) => vote.voter_id === fabioId)?.bonus_fabio ?? 0;
  return roundPizzaScore(ordinary + fabioBonus);
}

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const groupUsers = ["Samu", "Dani", "Atti", "Matte", "Fabio", "Alban", "Mattia", "Manu"] as const;
const pizzaRanking: readonly PizzaRankingEntry[] = [
  { name: "Portego De Mà", location: 16, pizza: 25, dessert: 8, price: 22, fabio: 7, total: 78, address: "Calata Giovanni Battista Cuneo, 29, 18100 Imperia (IM)" },
  { name: "Oasi La Pizza", location: 17, pizza: 21, dessert: 7, price: 19, fabio: 6, total: 70, address: "Piazza Sant'Antonio, 15, 18100 Imperia (IM)" },
  { name: "Fermento", location: 15, pizza: 24, dessert: 5, price: 17, fabio: 7, total: 68, address: "Calata Gian Battista Cuneo, 49, 18100 Imperia (IM)" },
  { name: "Senese", place: "Sanremo", location: 11, pizza: 25, dessert: 5, price: 18, fabio: 7, total: 66, address: "Via Privata Scoglio, 14, 18038 Sanremo (IM)" },
  { name: "Santa Fè", location: 9, pizza: 22, dessert: 5, price: 24, fabio: 6, total: 66, address: "Via Nino Lamboglia, 4, 18100 Imperia (IM)" },
  { name: "Sciabecco", location: 9, pizza: 23, dessert: 8, price: 19, fabio: 6, total: 65, address: "Via Nizza, 29, 18100 Imperia (IM)" },
  { name: "Le Cave Ristoro e Caffè", location: 9, pizza: 21, dessert: 7, price: 21, fabio: 6, total: 64, address: "Via Nazionale, 6, 18100 Imperia (IM)" },
  { name: "Locanda Fra Diavolo", place: "Diano", location: 11, pizza: 23, dessert: 8, price: 14, fabio: 6, total: 62, address: "Corso Giuseppe Garibaldi, 1, 18013 Diano Marina (IM)" },
  { name: "La Bonga", location: 11, pizza: 21, dessert: 6, price: 17, fabio: 7, total: 62, address: "Via Nino Lamboglia, 10, 18100 Imperia (IM)" },
  { name: "Le Logge", location: 8, pizza: 20, dessert: 4, price: 17, fabio: 7, total: 56, address: "Piazza San Giovanni, 2, 18021 Borgomaro (IM)" },
  { name: "Kilo", location: 10, pizza: 24, dessert: 7, price: 14, fabio: 0, total: 55, address: "Lungomare C. Colombo, 188, 18100 Imperia (IM)" },
  { name: "A Ghe Semmu", location: 6, pizza: 16, dessert: 6, price: 18, fabio: 6, total: 52, address: "Via Trento, 77, 18100 Imperia (IM)" },
];

const pizzaCriteria = [
  { label: "Location", max: PIZZA_WEIGHTS.location, source: "1–10", tone: "cyan" },
  { label: "Pizza", max: PIZZA_WEIGHTS.pizza, source: "1–10", tone: "lime" },
  { label: "Dolce", max: PIZZA_WEIGHTS.dessert, source: "1–10", tone: "pink" },
  { label: "Prezzo", max: PIZZA_WEIGHTS.price, source: "1–10", tone: "yellow" },
  { label: "Bonus Fabio", max: 7, source: "0–7", tone: "blue" },
] as const;

// Le schede storiche erano su scale diverse e comprendevano il bonus Fabio.
// Qui vengono riportate sugli stessi pesi delle nuove, così la classifica ha
// un metro solo: si divide per il vecchio massimo e si moltiplica per il peso.
const HISTORIC_MAX = { location: 21, pizza: 30, dessert: 12, price: 30 } as const;

function averagePizzaVotes(votes: PizzaSessionVote[]) {
  return votes.length
    ? {
        location: votes.reduce((sum, vote) => sum + vote.location, 0) / votes.length,
        pizza: votes.reduce((sum, vote) => sum + vote.pizza, 0) / votes.length,
        dessert: votes.reduce((sum, vote) => sum + vote.dessert, 0) / votes.length,
        price: votes.reduce((sum, vote) => sum + vote.price, 0) / votes.length,
      }
    : { location: 0, pizza: 0, dessert: 0, price: 0 };
}

function sortPizzaEntries(entries: PizzaDisplayEntry[]) {
  return entries.sort((a, b) => {
    const aReady = !a.pending;
    const bReady = !b.pending;
    if (aReady !== bReady) return aReady ? -1 : 1;
    return b.total - a.total || a.name.localeCompare(b.name, "it");
  });
}

function buildContemporaryPizzaRanking(
  restaurants: PizzaRestaurantRecord[],
  sessions: PizzaSession[],
  sessionVotes: PizzaSessionVote[],
  profiles: Profile[],
): PizzaDisplayEntry[] {
  const historical: PizzaDisplayEntry[] = pizzaRanking.map((entry) => ({
    ...entry,
    location: (entry.location / HISTORIC_MAX.location) * 10,
    pizza: (entry.pizza / HISTORIC_MAX.pizza) * 10,
    dessert: (entry.dessert / HISTORIC_MAX.dessert) * 10,
    price: (entry.price / HISTORIC_MAX.price) * 10,
    total: entry.total,
    isNew: false,
    votesCount: 3,
  }));
  const interactive = restaurants.map((restaurant) => {
    // Di una pizzeria conta l'ultima votazione. Finché non hanno votato tutti,
    // il database non restituisce i voti altrui e il risultato resta sospeso.
    const own = sessions
      .filter((session) => session.restaurant_id === restaurant.id)
      .sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime());
    const session = own[0];
    const votes = session ? sessionVotes.filter((vote) => vote.session_id === session.id) : [];
    const pending = !session || sessionIsOpen(session) || votes.length === 0;

    const average = averagePizzaVotes(votes);

    return {
      id: restaurant.id,
      name: restaurant.name,
      place: restaurant.place ?? undefined,
      ...average,
      fabio: 0,
      total: session ? finalPizzaScore(votes, session, profiles) : 0,
      isNew: true,
      pending,
      votesCount: session?.participants.filter((participant) => participant.voted_at).length ?? 0,
    } as PizzaDisplayEntry;
  });

  return sortPizzaEntries([...historical, ...interactive]);
}

function buildClassicPizzaRanking(
  restaurants: PizzaRestaurantRecord[],
  sessions: PizzaSession[],
  sessionVotes: PizzaSessionVote[],
  profiles: Profile[],
): PizzaDisplayEntry[] {
  const classicNames = new Set(["samu", "dani", "fabio"]);
  const classicIds = new Set(
    profiles
      .filter((profile) => classicNames.has(profile.display_name.toLowerCase()))
      .map((profile) => profile.id),
  );
  const historical: PizzaDisplayEntry[] = pizzaRanking.map((entry) => ({
    ...entry,
    location: (entry.location / HISTORIC_MAX.location) * 10,
    pizza: (entry.pizza / HISTORIC_MAX.pizza) * 10,
    dessert: (entry.dessert / HISTORIC_MAX.dessert) * 10,
    price: (entry.price / HISTORIC_MAX.price) * 10,
    total: entry.total,
    isNew: false,
    votesCount: 3,
  }));
  if (classicIds.size !== 3) return sortPizzaEntries(historical);

  const interactive = restaurants.flatMap((restaurant) => {
    const session = sessions
      .filter((item) => item.restaurant_id === restaurant.id)
      .filter((item) => [...classicIds].every((id) => item.participants.some((participant) => participant.voter_id === id)))
      .sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime())[0];
    if (!session) return [];
    const votes = sessionVotes.filter(
      (vote) => vote.session_id === session.id && classicIds.has(vote.voter_id),
    );
    const pending = sessionIsOpen(session) || votes.length !== 3;
    return [{
      id: restaurant.id,
      name: restaurant.name,
      place: restaurant.place ?? undefined,
      ...averagePizzaVotes(votes),
      fabio: votes.find((vote) => (
        profiles.find((profile) => profile.id === vote.voter_id)?.display_name.toLowerCase() === "fabio"
      ))?.bonus_fabio ?? 0,
      total: pending ? 0 : finalPizzaScore(votes, session, profiles),
      isNew: true,
      pending,
      votesCount: votes.length,
    } as PizzaDisplayEntry];
  });

  return sortPizzaEntries([...historical, ...interactive]);
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function sortPadelProfiles(profiles: Profile[]) {
  return [...profiles].sort((a, b) => {
    const aRanked = a.matches_played > 0;
    const bRanked = b.matches_played > 0;
    if (aRanked !== bRanked) return aRanked ? -1 : 1;
    if (!aRanked) return a.display_name.localeCompare(b.display_name, "it");
    return b.rating - a.rating || a.display_name.localeCompare(b.display_name, "it");
  });
}

// Saluti della home: una frase a caso a ogni caricamento, scelta in base a
// come sta andando chi guarda. {nome} viene sostituito col display_name.
// Il saluto sta sempre in cima ed e indipendente dalla frase. La forma e
// sempre "Ciao <qualcuno>," senza virgola dopo "Ciao" e senza punto finale:
// la frase sotto ne e la continuazione.
const heroSalutes = {
  // "GOAT" spetta solo a chi comanda, "Gancio" solo a chi chiude.
  first: ["Ciao {nome},", "Ciao GOAT,"],
  last: ["Ciao {nome},", "Ciao Gancio,"],
  any: ["Ciao {nome},"],
} as const;

function heroSalutePool(rank: number, isLast: boolean) {
  if (rank === 0) return heroSalutes.any;
  if (isLast) return heroSalutes.last;
  if (rank === 1) return heroSalutes.first;
  return heroSalutes.any;
}

// Le frasi sotto la barra. Sono gia senza saluto e con l'iniziale
// maiuscola: cosi non c'e niente da ritagliare o correggere a video.
const heroGreetings = {
  first: [
    "Bella giornata per stare al top!",
    "Quanto brucia agli altri?",
    "Fino a un mese fa non ti voleva nemmeno tua madre e ora guardati!",
  ],
  second: [
    "Manca poco alla vetta.",
    "Non mollare, ci sei quasi!",
  ],
  third: [
    "Comunque a podio, non male!",
    "Allora? Scaliamo o scendiamo?",
  ],
  fourth: [
    "Ti giuro che siamo arrivati, il podio è lì davanti.",
    "Ancora uno sforzo dai!",
  ],
  rest: [
    "Quanto fa freddo qua giù?",
    "Per Natale ci siamo a podio?",
  ],
  last: [
    "Mai pensato di darti all'ippica?",
    "Sei proprio un gancio!",
  ],
  narrowLead: [
    "Sei un intenditore di ippica, musetto davanti, bravo!",
  ],
  unranked: [
    "Il ranking si attiva dopo il primo risultato.",
  ],
} as const;

// I casi speciali vincono sulla posizione: prima il vantaggio risicato, poi
// l'ultimo posto, e solo dopo la classifica.
function heroGreetingPool(rank: number, isLast: boolean, hasNarrowLead: boolean) {
  if (rank === 0) return heroGreetings.unranked;
  if (hasNarrowLead) return heroGreetings.narrowLead;
  if (isLast) return heroGreetings.last;
  if (rank === 1) return heroGreetings.first;
  if (rank === 2) return heroGreetings.second;
  if (rank === 3) return heroGreetings.third;
  if (rank === 4) return heroGreetings.fourth;
  return heroGreetings.rest;
}

// Parimerito: a punteggio uguale la posizione è la stessa, e quella successiva
// riparte contando anche gli ex aequo (1, 1, 3) come nelle classifiche sportive.
// Parimerito "densi": due primi a pari punti sono entrambi 1°, e chi viene
// dopo è 2°, non 3°. Nello sport si usa spesso l'altra convenzione (1, 1, 3),
// ma qui la posizione conta come gradino del podio, non come piazzamento.
function padelRanks(sorted: Profile[]) {
  let lastRating: number | null = null;
  let rank = 0;
  return sorted.map((profile) => {
    if (profile.matches_played === 0) return 0;
    if (lastRating === null || profile.rating !== lastRating) {
      rank += 1;
      lastRating = profile.rating;
    }
    return rank;
  });
}

type SeasonStanding = {
  season: number;
  profile_id: string;
  position: number;
  rating: number;
  matches_played: number;
  wins: number;
  losses: number;
  current_streak: number;
};

type PadelTeamRecord = {
  id: string;
  player_a: string;
  player_b: string;
  name: string | null;
  image_path: string | null;
  image_url?: string | null;
};

type PadelTeam = {
  id: string;
  players: Profile[];
  rating: number;
  matches_played: number;
  wins: number;
  losses: number;
  current_streak: number;
  name?: string | null;
  imageUrl?: string | null;
};

function teamLabel(team: PadelTeam) {
  return team.name?.trim() || team.players.map((profile) => profile.display_name).join(" · ");
}

// Le coppie non stanno su Supabase: le ricaviamo dalle partite già registrate,
// così una squadra nuova entra in classifica da sola al primo risultato.
// Da padel_teams arrivano soltanto nome e immagine scelti dai due membri.
function buildPadelTeams(
  matches: PadelMatch[],
  profiles: Profile[],
  records: PadelTeamRecord[] = [],
): PadelTeam[] {
  const meta = new Map(records.map((record) => [`${record.player_a}|${record.player_b}`, record]));
  const byId = new Map(profiles.map((profile) => [profile.id, profile]));
  const teams = new Map<string, PadelTeam>();
  const chronological = [...matches].sort(
    (a, b) => new Date(a.played_at).getTime() - new Date(b.played_at).getTime(),
  );

  chronological.forEach((match) => {
    ([1, 2] as const).forEach((side) => {
      const members = match.players.filter((player) => player.team === side);
      if (members.length !== 2) return;

      const ids = members.map((member) => member.profile_id).sort();
      const key = ids.join("|");
      const won = match.winner_team === side;
      const team = teams.get(key);

      if (team) {
        team.matches_played += 1;
        team.wins += won ? 1 : 0;
        team.losses += won ? 0 : 1;
        team.current_streak = won
          ? Math.max(1, team.current_streak + 1)
          : Math.min(-1, team.current_streak - 1);
      } else {
        const players = ids.map((id) => byId.get(id)).filter(Boolean) as Profile[];
        const record = meta.get(key);
        teams.set(key, {
          id: key,
          players,
          // Media dei punteggi attuali dei due componenti.
          rating: players.length
            ? Math.round(players.reduce((sum, profile) => sum + profile.rating, 0) / players.length)
            : 0,
          matches_played: 1,
          wins: won ? 1 : 0,
          losses: won ? 0 : 1,
          current_streak: won ? 1 : -1,
          name: record?.name ?? null,
          imageUrl: record?.image_url ?? null,
        });
      }
    });
  });

  return [...teams.values()]
    .filter((team) => team.players.length === 2)
    .sort(
      (a, b) =>
        b.rating - a.rating ||
        a.players[0].display_name.localeCompare(b.players[0].display_name, "it"),
    );
}

function ranksByRating(items: { rating: number }[]) {
  let lastRating: number | null = null;
  let rank = 0;
  return items.map((item) => {
    if (lastRating === null || item.rating !== lastRating) {
      rank += 1;
      lastRating = item.rating;
    }
    return rank;
  });
}

function teamSides(team: PadelTeam) {
  const sides = team.players.map((profile) =>
    profile.court_side === "sinistra" ? "Rovescio" : profile.court_side === "destra" ? "Dritto" : null,
  );
  return sides.every(Boolean) ? sides.join(" / ") : null;
}

function rankOf(sorted: Profile[], profileId?: string) {
  if (!profileId) return 0;
  const index = sorted.findIndex((profile) => profile.id === profileId);
  return index < 0 ? 0 : padelRanks(sorted)[index];
}

// In padel il lato di campo si chiama dritto (destra) e rovescio (sinistra).
function padelTraits(profile: Profile) {
  const hand = profile.handedness === "mancino" ? "Mancino" : profile.handedness === "destro" ? "Destro" : null;
  const side = profile.court_side === "sinistra" ? "Rovescio" : profile.court_side === "destra" ? "Dritto" : null;
  const parts = [hand, side].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

function Avatar({
  profile,
  size = "md",
  rank,
}: {
  profile: Profile;
  size?: "sm" | "md" | "lg" | "xl";
  rank?: number;
}) {
  return (
    <span className={`avatar avatar-${size}`} aria-label={`Foto di ${profile.display_name}`}>
      {profile.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={profile.avatar_url} alt="" />
      ) : (
        <span>{initials(profile.display_name)}</span>
      )}
      {rank === 1 ? (
        <b className="rank-badge rank-badge-award" title="Primo in classifica">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="https://cdn-icons-gif.flaticon.com/18830/18830460.gif" alt="Primo in classifica" />
        </b>
      ) : null}
    </span>
  );
}

type GlyphName = "home" | "ranking" | "racket" | "rackets" | "pizza";

// Glifi in stile SF Symbols: tratto uniforme, estremi arrotondati, nessun
// riempimento. Ereditano currentColor, così seguono lo stato della barra.
function NavGlyph({ name }: { name: GlyphName }) {
  return (
    <svg
      className="nav-glyph"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {name === "home" ? (
        <path d="M12 3.7a1.6 1.6 0 0 0-1 .35L3.7 10.4a1.6 1.6 0 0 0-.6 1.25V19a1.7 1.7 0 0 0 1.7 1.7h14.4a1.7 1.7 0 0 0 1.7-1.7v-7.35a1.6 1.6 0 0 0-.6-1.25L13 4.05a1.6 1.6 0 0 0-1-.35Z" />
      ) : null}
      {/* Trancio di pizza: crosta in alto, punta in basso. */}
      {name === "pizza" ? (
        <>
          <path d="M4.2 6.9c4.8-2.9 10.8-2.9 15.6 0l-6.4 12.9a1.6 1.6 0 0 1-2.8 0Z" />
          <path d="M6.6 10.2c3.4-1.7 7.4-1.7 10.8 0" />
          <g fill="currentColor" stroke="none">
            <circle cx="11.8" cy="12.6" r="1" />
            <circle cx="9.7" cy="15.3" r="0.85" />
            <circle cx="13.7" cy="15.1" r="0.85" />
          </g>
        </>
      ) : null}
      {/* Podio: il gradino centrale è il più alto. */}
      {name === "ranking" ? (
        <>
          <rect x="9.1" y="8.6" width="5.8" height="12" rx="1.6" />
          <rect x="2.8" y="13.2" width="6.3" height="7.4" rx="1.6" />
          <rect x="14.9" y="11.2" width="6.3" height="9.4" rx="1.6" />
        </>
      ) : null}
      {/* Racchetta da padel: piatto pieno e forato, manico corto. */}
      {name === "racket" ? (
        <>
          <path d="M9.6 16.2C7 15 5.3 12.4 5.3 9.4 5.3 5.7 8.3 2.7 12 2.7s6.7 3 6.7 6.7c0 3-1.7 5.6-4.3 6.8Z" />
          {/* Manico aperto in alto: il tratto orizzontale sarebbe doppiato
              sul bordo inferiore del piatto. */}
          <path d="M10.4 16.2v3.1a1.6 1.6 0 0 0 3.2 0v-3.1" />
          <g fill="currentColor" stroke="none">
            <circle cx="12" cy="7.4" r="0.95" />
            <circle cx="9.3" cy="10.3" r="0.95" />
            <circle cx="14.7" cy="10.3" r="0.95" />
            <circle cx="12" cy="12.8" r="0.95" />
          </g>
        </>
      ) : null}
      {/* Due racchette incrociate: la coppia. Disegnate con la loro geometria
          invece che scalando quella del singolo, che a questa dimensione
          diventava illeggibile. I manici si incrociano, i piatti restano
          separati: nessun tratto passa sopra a un altro dentro la stessa
          racchetta. */}
      {name === "rackets" ? (
        <>
          <ellipse cx="8.7" cy="8.9" rx="4.1" ry="5" transform="rotate(-20 8.7 8.9)" />
          <path d="m10.3 13.7 2.1 6.1" />
          <ellipse cx="15.3" cy="8.9" rx="4.1" ry="5" transform="rotate(20 15.3 8.9)" />
          <path d="m13.7 13.7-2.1 6.1" />
        </>
      ) : null}
    </svg>
  );
}

// Schermata di attesa: fondo blu sfumato e logo al centro. La usano sia
// l'avvio dell'app sia il caricamento dei dati, cosi il passaggio da una
// all'altra non si vede.
function LoadingScreen() {
  return (
    <main className="splash" role="status" aria-label="Caricamento in corso">
      <div className="splash-mark">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${basePath}/theBOYZwhite.png`} alt="TheBoyz" width={150} height={150} />
      </div>
    </main>
  );
}

function Brand() {
  return (
    <div className="brand" aria-label="TheBoyz">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="brand-logo" src={`${basePath}/theboyz-mark.png`} alt="TheBoyz" width={46} height={46} />
    </div>
  );
}

// Marchio in filigrana dentro i blocchi scuri: decorativo, mai cliccabile.
function BlockMark({ size = "md" }: { size?: "md" | "lg" }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={`block-mark${size === "lg" ? " block-mark-lg" : ""}`}
      src={`${basePath}/theboyz-mark.png`}
      alt=""
      aria-hidden="true"
    />
  );
}

function LoginScreen() {
  const [username, setUsername] = useState<(typeof groupUsers)[number]>("Samu");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setMessage("");

    const email = `${username.toLowerCase()}@theboyz.local`;
    const result = await supabase.auth.signInWithPassword({ email, password });

    if (result.error) {
      setMessage("Nome o password non corretti.");
    }
    setBusy(false);
  }

  return (
    <main className="login-page">
      <section className="login-showcase">
        <Brand />
        <div className="boyz-grid" aria-hidden="true">
          <span>TB</span>
        </div>
        <div className="login-copy">
          <h1>Benvenuto<br />nel quartier generale.</h1>
        </div>
      </section>

      <section className="login-panel">
        <div className="login-card">
          <p className="eyebrow dark">AREA RISERVATA THEBOYZ</p>
          <h2>Entra nel gruppo</h2>
          <p className="login-subtitle">Scegli il tuo nome e inserisci la password assegnata.</p>

          <form onSubmit={submit}>
            <label>
              Nome
              <select
                value={username}
                onChange={(event) => setUsername(event.target.value as (typeof groupUsers)[number])}
                required
              >
                {groupUsers.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
            <label>
              Password
              <input type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Almeno 6 caratteri" required />
            </label>
            {message ? <p className="form-message">{message}</p> : null}
            <button className="button button-primary button-full" disabled={busy}>
              {busy ? "Un momento…" : "Entra in TheBoyz"}
            </button>
          </form>
        </div>
        <p className="login-footer">Accesso protetto da Supabase · Solo per TheBoyz</p>
      </section>
    </main>
  );
}

function SetupScreen() {
  return (
    <main className="setup-page">
      <Brand />
      <section>
        <p className="eyebrow dark">CONFIGURAZIONE NECESSARIA</p>
        <h1>Collega Supabase<br />a TheBoyz.</h1>
        <p>
          Questa installazione non contiene dati dimostrativi. Configura
          <code>NEXT_PUBLIC_SUPABASE_URL</code> e
          <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> per visualizzare soltanto
          giocatori e partite reali.
        </p>
      </section>
    </main>
  );
}

function youtubeId(url?: string | null) {
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

type BadgeTone = "gold" | "red" | "ice" | "violet" | "bronze" | "steel";
type BadgeGlyph =
  | "goat"
  | "summit"
  | "flame"
  | "sets"
  | "turkey"
  | "hook"
  | "dominator"
  | "comeback"
  | "clutch"
  | "marathon"
  | "duo"
  | "goat-slayer"
  | "centurion"
  | "trophy";

type Badge = {
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

type PlayerBadgeMetrics = {
  bestWinStreak: number;
  bestLoseStreak: number;
  bestSetWinStreak: number;
  firstPlaceMatches: number;
  straightSetWins: number;
  comebackWins: number;
  decidingSetWins: number;
  matchesPlayed: number;
  winsAgainstGoat: number;
  bestPairMatches: number;
  bestPairRate: number;
  ownsTopPair: boolean;
};

function emptyBadgeMetrics(): PlayerBadgeMetrics {
  return {
    bestWinStreak: 0,
    bestLoseStreak: 0,
    bestSetWinStreak: 0,
    firstPlaceMatches: 0,
    straightSetWins: 0,
    comebackWins: 0,
    decidingSetWins: 0,
    matchesPlayed: 0,
    winsAgainstGoat: 0,
    bestPairMatches: 0,
    bestPairRate: 0,
    ownsTopPair: false,
  };
}

function chronologicalMatches(matches: PadelMatch[]) {
  return [...matches].sort((a, b) =>
    new Date(a.played_at).getTime() - new Date(b.played_at).getTime()
    || new Date(a.created_at ?? a.played_at).getTime() - new Date(b.created_at ?? b.played_at).getTime()
    || a.id.localeCompare(b.id),
  );
}

function buildBadgeMetrics(profiles: Profile[], matches: PadelMatch[]) {
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
    const activeBefore = profiles.filter((profile) => (played.get(profile.id) ?? 0) > 0);
    const leaderRatingBefore = activeBefore.length
      ? Math.max(...activeBefore.map((profile) => ratings.get(profile.id) ?? 1000))
      : null;
    const goatsBefore = new Set(
      activeBefore
        .filter((profile) => (ratings.get(profile.id) ?? 1000) === leaderRatingBefore)
        .map((profile) => profile.id),
    );
    const losingGoat = match.players.some(
      (player) => goatsBefore.has(player.profile_id) && player.team !== match.winner_team,
    );

    match.players.forEach((player) => {
      const item = metrics.get(player.profile_id);
      if (!item) return;
      const won = player.team === match.winner_team;
      const winRun = won ? (currentWinRuns.get(player.profile_id) ?? 0) + 1 : 0;
      const loseRun = won ? 0 : (currentLoseRuns.get(player.profile_id) ?? 0) + 1;
      currentWinRuns.set(player.profile_id, winRun);
      currentLoseRuns.set(player.profile_id, loseRun);
      item.bestWinStreak = Math.max(item.bestWinStreak, winRun);
      item.bestLoseStreak = Math.max(item.bestLoseStreak, loseRun);
      item.matchesPlayed += 1;
      if (won && losingGoat) item.winsAgainstGoat += 1;

      const sets = [...match.sets].sort((a, b) => a.set_number - b.set_number);
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
        if (setResults[0] === false) item.comebackWins += 1;
        if (setResults.length >= 3 && lostSets > 0) item.decidingSetWins += 1;
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
          if (item) item.firstPlaceMatches += 1;
        }
      });
    }
  });

  type PairRun = { ids: string[]; matches: number; wins: number };
  const pairs = new Map<string, PairRun>();
  ordered.forEach((match) => ([1, 2] as const).forEach((side) => {
    const ids = match.players.filter((player) => player.team === side).map((player) => player.profile_id).sort();
    if (ids.length !== 2) return;
    const key = ids.join("|");
    const pair = pairs.get(key) ?? { ids, matches: 0, wins: 0 };
    pair.matches += 1;
    pair.wins += match.winner_team === side ? 1 : 0;
    pairs.set(key, pair);
  }));

  const eligiblePairs = [...pairs.values()].filter((pair) => pair.matches >= 5);
  const topPairRate = eligiblePairs.length
    ? Math.max(...eligiblePairs.map((pair) => pair.wins / pair.matches))
    : 0;
  pairs.forEach((pair) => {
    const rate = pair.matches ? pair.wins / pair.matches : 0;
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

function clampProgress(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function playerBadges(profile: Profile, profiles: Profile[], matches: PadelMatch[]): Badge[] {
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
      value: `${value} ${unit}`,
      progress: target ? clampProgress((value / target) * 100) : 0,
      progressLabel: unlocked ? `Primato: ${value} ${unit}` : target ? `Ne mancano ${remaining}` : "In attesa del primo risultato",
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
      value: profile.matches_played ? `#${rank} · ${profile.rating} Elo` : "Non classificato",
      progress: isGoat ? 100 : leaderRating ? clampProgress((profile.rating / leaderRating) * 100) : 0,
      progressLabel: isGoat ? "Sei in vetta" : profile.matches_played ? `${goatGap} Elo dalla vetta` : "Gioca la prima partita",
      unlocked: isGoat,
    },
    recordBadge("summit", "gold", "summit", "RE DELLA VETTA", "Chi ha trascorso più partite al primo posto.", "Conta ogni partita dopo la quale il giocatore è rimasto o salito al numero uno.", own.firstPlaceMatches, maxOf((item) => item.firstPlaceMatches), "turni in vetta"),
    recordBadge("flame", "red", "flame", "FIAMMA VINCENTE", "La serie di vittorie più lunga.", "Ottieni il maggior numero di vittorie consecutive nella cronologia.", own.bestWinStreak, maxOf((item) => item.bestWinStreak), "vittorie di fila"),
    recordBadge("sets", "red", "sets", "SET D'ACCIAIO", "La serie di set vinti consecutivamente più lunga.", "I set restano consecutivi anche attraversando partite diverse.", own.bestSetWinStreak, maxOf((item) => item.bestSetWinStreak), "set di fila"),
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
    recordBadge("dominator", "ice", "dominator", "DOMINATORE", "Chi ha vinto più partite senza concedere set.", "Conta le vittorie concluse 2–0.", own.straightSetWins, maxOf((item) => item.straightSetWins), "vittorie 2–0"),
    recordBadge("comeback", "ice", "comeback", "RE DELLA RIMONTA", "Chi ha ribaltato più partite dopo aver perso il primo set.", "Conta le vittorie ottenute partendo da 0–1 nei set.", own.comebackWins, maxOf((item) => item.comebackWins), "rimonte"),
    recordBadge("clutch", "ice", "clutch", "SANGUE FREDDO", "Chi ha vinto più partite al set decisivo.", "Conta le vittorie in tre set, dopo averne concesso almeno uno.", own.decidingSetWins, maxOf((item) => item.decidingSetWins), "set decisivi"),
    recordBadge("marathon", "steel", "marathon", "MARATONETA", "Il giocatore con più presenze.", "Detieni il maggior numero totale di partite disputate.", own.matchesPlayed, maxOf((item) => item.matchesPlayed), "partite"),
    {
      id: "duo", tone: "violet", glyph: "duo", label: "COPPIA D'ORO",
      meaning: "I componenti della coppia con il rendimento migliore.",
      criterion: "Miglior percentuale di vittorie tra le coppie con almeno 5 partite insieme.",
      value: own.bestPairMatches ? `${Math.round(own.bestPairRate * 100)}% · ${own.bestPairMatches} match` : "Nessuna coppia",
      progress: own.ownsTopPair ? 100 : clampProgress(pairProgress),
      progressLabel: own.ownsTopPair ? "Miglior coppia" : pairReady ? `${Math.round(topPairRate * 100)}% da raggiungere` : `${own.bestPairMatches}/5 partite di coppia`,
      unlocked: own.ownsTopPair,
    },
    recordBadge("goat-slayer", "red", "goat-slayer", "AMMAZZA-GOAT", "Chi ha battuto più volte il numero uno.", "Conta solo quando l'avversario era GOAT prima dell'inizio della partita.", own.winsAgainstGoat, maxOf((item) => item.winsAgainstGoat), "GOAT battuti"),
    {
      id: "centurion", tone: "steel", glyph: "centurion", label: "CENTURIONE",
      meaning: "Il riconoscimento personale per chi ha raggiunto 20 presenze.",
      criterion: "Si conquista disputando almeno 20 partite e non dipende dai risultati degli altri.",
      value: `${profile.matches_played} partite`,
      progress: clampProgress((profile.matches_played / 20) * 100),
      progressLabel: profile.matches_played >= 20 ? "Traguardo conquistato" : `${profile.matches_played}/20 partite`,
      unlocked: profile.matches_played >= 20,
    },
  ];
}

function BadgeGlyphIcon({ name }: { name: BadgeGlyph }) {
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
      {name === "clutch" ? <path d="m12 3 6.6 5.1L16 19l-4 2-4-2L5.4 8.1zM12 3v18M5.4 8.1h13.2M8 19l4-10.9L16 19" /> : null}
      {name === "marathon" ? <><path d="M7 3h10M7 21h10M8 3c0 5 1.7 6.7 4 9-2.3 2.3-4 4-4 9M16 3c0 5-1.7 6.7-4 9 2.3 2.3 4 4 4 9" /><path d="M3 8h4m10 0h4M4 6 2 8l2 2m16-4 2 2-2 2" /></> : null}
      {name === "duo" ? <><path d="M9.5 4 4 6.2v5c0 3.5 2.2 6.2 5.5 7.5 3.3-1.3 5.5-4 5.5-7.5v-5z" /><path d="M14.5 4 20 6.2v5c0 3.5-2.2 6.2-5.5 7.5M9.5 11.2l2.5 2.5 2.5-2.5" /></> : null}
      {name === "goat-slayer" ? <><path d="m5 6 2-3 3 2 2-3 2 3 3-2 2 3-3 3H8z" /><path d="M6 19c4.5-7.5 7-9 12-7-3.2.8-4.7 3.4-5 7M4 20 20 8" /></> : null}
      {name === "centurion" ? <><path d="M6 18V9a6 6 0 0 1 12 0v9M6 11h12M9 18v-4m6 4v-4M9 5.2C10 3.5 11 2.5 12 2c1 1.5 1.7 3 1.7 5" /><text x="12" y="10" textAnchor="middle" stroke="none" fill="currentColor" fontSize="5" fontWeight="900">XX</text></> : null}
    </svg>
  );
}

function BadgeList({ badges }: { badges: Badge[] }) {
  return (
    <div className="badge-grid">
      {badges.map((badge) => (
        <article
          className={`badge badge-${badge.tone} ${badge.unlocked ? "is-unlocked" : "is-locked"}`}
          key={badge.id}
          tabIndex={0}
          aria-label={`${badge.label}. ${badge.meaning} ${badge.progressLabel}`}
        >
          <div className="badge-emblem" aria-hidden="true">
            <span className="badge-crown">◆</span>
            <span className="badge-icon"><Image src={`/emblems/${badge.glyph}.png`} alt="" width={58} height={58} /></span>
            <span className="badge-laurel badge-laurel-left">❯</span>
            <span className="badge-laurel badge-laurel-right">❮</span>
          </div>
          <aside className="badge-tooltip" role="tooltip">
            <strong>{badge.label}</strong>
            <p>{badge.meaning}</p>
            <span>{badge.criterion}</span>
            <small>{badge.value} · {badge.progressLabel}</small>
          </aside>
        </article>
      ))}
    </div>
  );
}

function FieldRegister({
  profile,
  profiles,
  matches,
}: {
  profile: Profile;
  profiles: Profile[];
  matches: PadelMatch[];
}) {
  const own = buildBadgeMetrics(profiles, matches).metrics.get(profile.id) ?? emptyBadgeMetrics();
  const registerEntries = [
    {
      id: "clean", glyph: "dominator" as BadgeGlyph, tone: "plain", label: "VITTORIE NETTE",
      detail: `${own.straightSetWins} partite vinte senza perdere set`,
      footer: `${own.straightSetWins} ${own.straightSetWins === 1 ? "VOLTA" : "VOLTE"}`, locked: false,
    },
    {
      id: "pair", glyph: "duo" as BadgeGlyph, tone: "plain", label: "COPPIA MIGLIORE",
      detail: own.bestPairMatches ? `${Math.round(own.bestPairRate * 100)}% di vittorie in ${own.bestPairMatches} match` : "Nessuna coppia registrata",
      footer: own.bestPairMatches >= 5 ? "DATI CONSOLIDATI" : "SERVONO 5 MATCH", locked: false,
    },
    {
      id: "centurion", glyph: "centurion" as BadgeGlyph, tone: "plain", label: "CENTURIONE",
      detail: profile.matches_played >= 20 ? "Hai disputato almeno 20 partite." : "Gioca 20 partite.",
      footer: profile.matches_played >= 20 ? "CONQUISTATO" : `${profile.matches_played}/20`,
      locked: profile.matches_played < 20,
    },
  ];

  return (
    <article className="field-register">
      <header className="field-register-head">
        <span>THEBOYZ PADEL CLUB</span>
        <b>REGISTRO DI CAMPO</b>
        <i aria-hidden="true">{new Date().getFullYear()}</i>
      </header>
      <div className="field-register-page">
        {registerEntries.map((entry) => (
          <div className={`field-register-card is-${entry.tone} ${entry.locked ? "is-locked" : ""}`} key={entry.id}>
            <span className="field-register-icon" aria-hidden="true">
              {entry.locked ? <b>⌑</b> : <BadgeGlyphIcon name={entry.glyph} />}
            </span>
            <div>
              <b>{entry.label}</b>
              <p>{entry.detail}</p>
              <small>{entry.footer}</small>
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

// Secondi ⇄ mm:ss. Chi segna uno spezzone legge il tempo sul player di
// YouTube, non conta i secondi dall'inizio.
function formatClock(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function parseClock(value: string) {
  const clean = value.trim();
  if (!clean) return null;
  const parts = clean.split(":").map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part) || part < 0)) return null;
  if (parts.length === 1) return Math.floor(parts[0]);
  if (parts.length === 2) return Math.floor(parts[0]) * 60 + Math.floor(parts[1]);
  if (parts.length === 3) return Math.floor(parts[0]) * 3600 + Math.floor(parts[1]) * 60 + Math.floor(parts[2]);
  return null;
}

function MatchCard({
  match,
  onEdit,
  onPlayVideo,
  viewerId,
  actionLabel,
}: {
  match: PadelMatch;
  onEdit?: (match: PadelMatch) => void;
  onPlayVideo?: (videoId: string) => void;
  viewerId?: string;
  // Cosa succede toccando la card: non sempre e "modifica", quindi chi la
  // usa puo dirlo, altrimenti chi naviga con lo screen reader sentirebbe
  // annunciata un'azione che non avviene.
  actionLabel?: string;
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
  const videoId = youtubeId(match.video_url);
  const formatTeam = (players: typeof team1) => (
    <span className="match-team-players">
      {players.map((player) => {
        const delta = player.rating_delta ?? 0;
        return (
          <span key={player.profile_id} className="match-team-player">
            {player.profile.display_name}{" "}
            <b className={`elo-delta ${delta >= 0 ? "up" : "down"}`}>
              {delta > 0 ? "+" : ""}{delta}
            </b>
          </span>
        );
      })}
    </span>
  );

  return (
    <article
      className={`match-card${onEdit ? " match-card-link" : ""}`}
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
        </div>
        {match.court ? <p className="match-court" title={match.court}>{match.court}</p> : <p className="match-court" aria-hidden="true" />}
      </div>
      <div className="match-main">
        <div className={`match-team ${match.winner_team === leftSide ? "winner" : ""}`}>
          <div className="mini-avatars">{team1.map((player) => <Avatar key={player.profile_id} profile={player.profile} size="sm" />)}</div>
          {formatTeam(team1)}
          {match.winner_team === leftSide ? <em>VITTORIA</em> : null}
        </div>
        <div className="match-score">
          {match.sets
            .sort((a, b) => a.set_number - b.set_number)
            .map((set) => (
              <span key={set.set_number}>
                <b>{flipped ? set.team2_games : set.team1_games}</b>
                <i>—</i>
                <b>{flipped ? set.team1_games : set.team2_games}</b>
              </span>
            ))}
        </div>
        <div className={`match-team team-right ${match.winner_team === rightSide ? "winner" : ""}`}>
          <div className="mini-avatars">{team2.map((player) => <Avatar key={player.profile_id} profile={player.profile} size="sm" />)}</div>
          {formatTeam(team2)}
          {match.winner_team === rightSide ? <em>VITTORIA</em> : null}
        </div>
      </div>
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
    </article>
  );
}

function TeamAvatars({ team, size = "sm" }: { team: PadelTeam; size?: "sm" | "lg" }) {
  if (team.imageUrl) {
    return (
      <span className={`team-image team-image-${size}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={team.imageUrl} alt="" />
      </span>
    );
  }
  return (
    <div className={size === "lg" ? "podium-avatars" : "team-avatars"}>
      {team.players.map((profile) => (
        <Avatar key={profile.id} profile={profile} size={size} />
      ))}
    </div>
  );
}

function TeamEditor({
  team,
  onSave,
  disabled,
}: {
  team: PadelTeam;
  onSave: (team: PadelTeam, name: string, file?: File) => Promise<void>;
  disabled?: boolean;
}) {
  const [name, setName] = useState(team.name ?? "");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    await onSave(team, name);
    setBusy(false);
  }

  async function pickImage(file?: File) {
    if (!file) return;
    setBusy(true);
    await onSave(team, name, file);
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
        <small>{team.matches_played} partite · {team.rating} pt</small>
        <button className="button button-dark" disabled={disabled || busy}>
          {busy ? "Salvo…" : "Salva"}
        </button>
      </div>
    </form>
  );
}

// Menu costruito a mano: il <select> nativo non permette di intervenire né
// sull'evidenziazione né sull'aspetto della lista.
function SeasonPicker({
  value,
  options,
  onChange,
}: {
  value: number;
  options: number[];
  onChange: (season: number) => void;
}) {
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
        Stagione {value}
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
                Stagione {year}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function TeamRankingList({
  teams,
  limit,
  bare = false,
}: {
  teams: PadelTeam[];
  limit?: number;
  bare?: boolean;
}) {
  const ranks = ranksByRating(teams);
  const visible = limit === undefined ? teams : teams.slice(0, limit);
  return (
    <div className={`ranking-table ranking-table-team${bare ? " ranking-table-bare" : ""}`}>
      {visible.map((team, index) => {
        const rank = ranks[index];
        const winRate = team.matches_played ? Math.round((team.wins / team.matches_played) * 100) : 0;
        return (
          <div className={`ranking-row ${rankTone(rank)}`} key={team.id}>
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
            <span className="table-stat"><b>{team.matches_played}</b><small>Partite</small></span>
            <span className="table-stat"><b>{team.wins}</b><small>Vinte</small></span>
            <span className="table-stat"><b>{winRate}%</b><small>Win rate</small></span>
            <span className={`streak ${team.current_streak >= 0 ? "up" : "down"}`}>
              {`${team.current_streak >= 0 ? "↗" : "↘"} ${Math.abs(team.current_streak)}`}
            </span>
            <span className="ranking-points">
              <b>{team.rating}</b>
              <small>PT</small>
            </span>
          </div>
        );
      })}
    </div>
  );
}

// Podio a tre gradini: un gradino per posizione, non per persona. Con dei
// parimerito sullo stesso gradino salgono in due, e i gradini restano tre.
type PodiumEntry = {
  key: string;
  avatar: ReactNode;
  name: string;
  detail: string;
  onSelect?: () => void;
};

function Podium({ steps }: { steps: { rank: number; entries: PodiumEntry[] }[] }) {
  const byRank = new Map(steps.map((step) => [step.rank, step.entries]));
  // Ordine di lettura del podio: secondo, primo, terzo.
  return (
    <div className="podium">
      {[2, 1, 3].map((rank) => {
        const entries = byRank.get(rank) ?? [];
        if (!entries.length) return null;
        return (
          <div className={`podium-step podium-step-${rank}`} key={rank}>
            <div className="podium-people">
              {entries.map((entry) => {
                const content = (
                  <>
                    {entry.avatar}
                    <b>{entry.name}</b>
                    <span>{entry.detail}</span>
                  </>
                );
                return entry.onSelect ? (
                  <button className="podium-person" key={entry.key} type="button" onClick={entry.onSelect}>
                    {content}
                  </button>
                ) : (
                  <div className="podium-person" key={entry.key}>{content}</div>
                );
              })}
            </div>
            <div className="podium-bar"><span>#{rank}</span></div>
          </div>
        );
      })}
    </div>
  );
}

// Il colore della card dice la posizione, e basta quello: giallo il primo
// (o i primi, se sono a pari punti), azzurro secondo e terzo, chiaro il
// resto. Tutte le righe portano le stesse informazioni.
function rankTone(rank: number) {
  if (rank === 1) return "ranking-row-gold";
  if (rank === 2 || rank === 3) return "ranking-row-blue";
  return "";
}

function RankingList({
  profiles,
  expanded = false,
  onSelect,
  limit,
  bare = false,
}: {
  profiles: Profile[];
  expanded?: boolean;
  onSelect?: (profile: Profile) => void;
  // Numero massimo di righe da mostrare. Si conta per righe e non per
  // posizione: con dei parimerito una soglia sulla posizione mostrerebbe un
  // numero di persone diverso da quello promesso.
  limit?: number;
  bare?: boolean;
}) {
  const sorted = sortPadelProfiles(profiles);
  const ranks = padelRanks(sorted);
  const visible = limit === undefined ? sorted : sorted.slice(0, limit);
  return (
    <div className={`${expanded ? "ranking-table" : "ranking-list"}${bare ? " ranking-table-bare" : ""}`}>
      {visible.map((profile, index) => {
        const isRanked = profile.matches_played > 0;
        const rank = ranks[index];
        const winRate = profile.matches_played ? Math.round((profile.wins / profile.matches_played) * 100) : 0;
        const content = (
          <>
            <span className={`rank-number ${isRanked ? `rank-${rank}` : "rank-nc"}`}>
              {isRanked ? rank : "N/C"}
            </span>
            <Avatar profile={profile} size={expanded ? "md" : "sm"} />
            <div className="ranking-name">
              <b>{profile.display_name}</b>
              <span>{padelTraits(profile) ?? `${profile.matches_played} partite`}</span>
            </div>
            {expanded ? (
              <>
                <span className="table-stat"><b>{profile.matches_played}</b><small>Partite</small></span>
                <span className="table-stat"><b>{profile.wins}</b><small>Vinte</small></span>
                <span className="table-stat"><b>{winRate}%</b><small>Win rate</small></span>
                <span className={`streak ${isRanked ? (profile.current_streak >= 0 ? "up" : "down") : ""}`}>
                  {isRanked ? `${profile.current_streak >= 0 ? "↗" : "↘"} ${Math.abs(profile.current_streak)}` : "N/C"}
                </span>
              </>
            ) : (
              <span className={`trend ${isRanked ? (profile.current_streak >= 0 ? "up" : "down") : ""}`}>
                {isRanked ? (profile.current_streak >= 0 ? "↑" : "↓") : "—"}
              </span>
            )}
            <span className="ranking-points">
              <b>{isRanked ? profile.rating : "N/C"}</b>
              <small>{isRanked ? "PT" : "0 PARTITE"}</small>
            </span>
          </>
        );
        const tone = isRanked ? rankTone(rank) : "";
        return onSelect ? (
          <button
            type="button"
            className={`ranking-row ranking-row-link ${tone} ${isRanked ? "" : "unranked"}`}
            key={profile.id}
            onClick={() => onSelect(profile)}
            aria-label={`Apri la scheda di ${profile.display_name}`}
          >
            {content}
          </button>
        ) : (
          <div className={`ranking-row ${tone} ${isRanked ? "" : "unranked"}`} key={profile.id}>
            {content}
          </div>
        );
      })}
    </div>
  );
}

function EloChart({ profile, matches, isSelf }: { profile: Profile; matches: PadelMatch[]; isSelf?: boolean }) {
  const personalMatches = [...matches]
    .filter((match) => match.players.some((player) => player.profile_id === profile.id))
    .sort((a, b) =>
      new Date(a.played_at).getTime() - new Date(b.played_at).getTime()
      || new Date(a.created_at ?? a.played_at).getTime() - new Date(b.created_at ?? b.played_at).getTime()
      || a.id.localeCompare(b.id),
    );
  const deltas = personalMatches.map(
    (match) => match.players.find((player) => player.profile_id === profile.id)?.rating_delta ?? 0,
  );
  const startingRating = profile.rating - deltas.reduce((sum, delta) => sum + delta, 0);
  const matchPoints = personalMatches.reduce<{ id: string; rating: number; playedAt: string; delta: number }[]>(
    (timeline, match, index) => [
      ...timeline,
      {
        id: match.id,
        rating: (timeline[timeline.length - 1]?.rating ?? startingRating) + deltas[index],
        playedAt: match.played_at,
        delta: deltas[index],
      },
    ],
    [],
  );
  const points = [
    { id: "start", rating: startingRating, playedAt: personalMatches[0]?.played_at ?? null, delta: 0 },
    ...matchPoints,
  ];

  if (!personalMatches.length) {
    return (
      <article className="elo-panel elo-panel-empty">
        <div className="elo-panel-head"><div><p className="eyebrow dark">ANDAMENTO ELO</p><h2>Il grafico parte dalla prima sfida.</h2></div></div>
        <p>Registra una partita per iniziare a seguire l&apos;andamento del punteggio.</p>
      </article>
    );
  }

  const width = 760;
  const height = 270;
  const padding = { top: 28, right: 24, bottom: 42, left: 54 };
  const ratings = points.map((point) => point.rating);
  const rawMin = Math.min(...ratings);
  const rawMax = Math.max(...ratings);
  const spread = Math.max(30, rawMax - rawMin);
  const minRating = Math.floor((rawMin - spread * 0.16) / 10) * 10;
  const maxRating = Math.ceil((rawMax + spread * 0.16) / 10) * 10;
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const xAt = (index: number) => padding.left + (index / Math.max(1, points.length - 1)) * plotWidth;
  const yAt = (rating: number) => padding.top + ((maxRating - rating) / Math.max(1, maxRating - minRating)) * plotHeight;
  const coordinates = points.map((point, index) => ({ ...point, x: xAt(index), y: yAt(point.rating) }));
  const line = coordinates.map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`).join(" ");
  const area = `${line} L ${coordinates[coordinates.length - 1].x} ${height - padding.bottom} L ${coordinates[0].x} ${height - padding.bottom} Z`;
  const gridValues = Array.from({ length: 4 }, (_, index) =>
    Math.round(maxRating - (index / 3) * (maxRating - minRating)),
  );
  const firstDate = personalMatches[0].played_at;
  const middleDate = personalMatches[Math.floor((personalMatches.length - 1) / 2)].played_at;
  const lastDate = personalMatches[personalMatches.length - 1].played_at;
  const dateLabels = [firstDate, middleDate, lastDate];
  const formatDate = (date: string) => new Intl.DateTimeFormat("it-IT", { month: "short", year: "2-digit" }).format(new Date(date));
  const overallDelta = profile.rating - startingRating;

  return (
    <article className="elo-panel">
      <div className="elo-panel-head">
        <div><p className="eyebrow dark">ANDAMENTO ELO</p><h2>{isSelf ? "La mia corsa" : `La corsa di ${profile.display_name}`}</h2></div>
        <div className="elo-current"><b>{profile.rating}</b><small>PT ATTUALI</small><span className={overallDelta >= 0 ? "positive" : "negative"}>{overallDelta >= 0 ? "+" : ""}{overallDelta} dal debutto</span></div>
      </div>
      <figure className="elo-chart">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Grafico Elo di ${profile.display_name} su ${personalMatches.length} partite`}>
          <defs>
            <linearGradient id={`elo-fill-${profile.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--blue)" stopOpacity="0.32" />
              <stop offset="100%" stopColor="var(--blue)" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {gridValues.map((value) => {
            const y = yAt(value);
            return <g key={value}><line className="elo-grid-line" x1={padding.left} x2={width - padding.right} y1={y} y2={y} /><text className="elo-axis-label" x={padding.left - 10} y={y + 4} textAnchor="end">{value}</text></g>;
          })}
          <path d={area} fill={`url(#elo-fill-${profile.id})`} />
          <path className="elo-line" d={line} />
          {coordinates.slice(1).map((point) => (
            <circle className="elo-point" key={point.id} cx={point.x} cy={point.y} r="5">
              <title>{`${new Intl.DateTimeFormat("it-IT").format(new Date(point.playedAt!))}: ${point.rating} punti (${point.delta >= 0 ? "+" : ""}${point.delta})`}</title>
            </circle>
          ))}
          {dateLabels.map((date, index) => (
            <text className="elo-date-label" key={`${date}-${index}`} x={padding.left + (index / 2) * plotWidth} y={height - 10} textAnchor={index === 0 ? "start" : index === 2 ? "end" : "middle"}>{formatDate(date)}</text>
          ))}
        </svg>
        <figcaption>Ogni punto rappresenta il punteggio dopo una partita. Toccalo per vedere data e variazione Elo.</figcaption>
      </figure>
    </article>
  );
}

// Riassunto leggibile del risultato: è ciò che finisce nello storico, così
// una riga vecchia resta comprensibile anche se poi cambiano nomi e squadre.
function matchSummary(profiles: Profile[], playerIds: string[], sets: PadelSet[]) {
  const name = (id: string) => profiles.find((profile) => profile.id === id)?.display_name ?? "?";
  const team1 = playerIds.slice(0, 2).map(name).join(" · ");
  const team2 = playerIds.slice(2, 4).map(name).join(" · ");
  const score = sets.map((set) => `${set.team1_games}-${set.team2_games}`).join(" ");
  return `${team1} vs ${team2} · ${score}`;
}

function NewMatchModal({
  profiles,
  match,
  onClose,
  onSaved,
}: {
  profiles: Profile[];
  match?: PadelMatch | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = Boolean(match);
  const initialPlayers = match
    ? [
        ...match.players.filter((player) => player.team === 1).map((player) => player.profile_id),
        ...match.players.filter((player) => player.team === 2).map((player) => player.profile_id),
      ]
    : profiles.slice(0, 4).map((profile) => profile.id);
  const initialScores = match
    ? [0, 1, 2].map((index) => {
        const set = [...match.sets].sort((a, b) => a.set_number - b.set_number)[index];
        return set ? [String(set.team1_games), String(set.team2_games)] : ["", ""];
      })
    : [["6", "4"], ["6", "3"], ["", ""]];

  const [players, setPlayers] = useState(initialPlayers);
  const [scores, setScores] = useState(initialScores);
  const [playedAt, setPlayedAt] = useState(
    match ? new Date(match.played_at).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
  );
  const [notes, setNotes] = useState(match?.notes ?? "");
  const [videoUrl, setVideoUrl] = useState(match?.video_url ?? "");
  const [court, setCourt] = useState(match?.court ?? "");
  const [comment, setComment] = useState("");
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

  function updateScore(setIndex: number, teamIndex: number, value: string) {
    setScores((current) =>
      current.map((set, index) =>
        index === setIndex ? set.map((score, team) => (team === teamIndex ? value : score)) : set,
      ),
    );
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (players.length !== 4 || new Set(players).size !== 4 || players.some((id) => !id)) {
      setError("Scegli quattro giocatori diversi.");
      return;
    }

    const sets: PadelSet[] = scores
      .filter(([a, b]) => a !== "" && b !== "")
      .map(([a, b], index) => ({ set_number: index + 1, team1_games: Number(a), team2_games: Number(b) }));
    const wins1 = sets.filter((set) => set.team1_games > set.team2_games).length;
    const wins2 = sets.filter((set) => set.team2_games > set.team1_games).length;
    if (sets.length < 2 || Math.max(wins1, wins2) < 2 || wins1 === wins2) {
      setError("Inserisci almeno due set e indica una squadra vincitrice.");
      return;
    }

    const cleanVideo = videoUrl.trim();
    if (cleanVideo && !youtubeId(cleanVideo)) {
      setError("Il link del video deve essere un indirizzo YouTube valido.");
      return;
    }

    setBusy(true);
    if (supabase) {
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
        const { error: deleteError } = await supabase.rpc("delete_match", { p_match_id: match.id });
        if (deleteError) {
          setError(deleteError.message);
          setBusy(false);
          return;
        }
      }
      const { data: newId, error: rpcError } = await supabase.rpc("record_match", {
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
          comment: comment.trim() || null,
          summary: matchSummary(profiles, players, sets),
        });
      }
    }
    onSaved();
    setBusy(false);
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="match-title">
        <div className="modal-head">
          <div>
            <p className="eyebrow dark">{editing ? "MODIFICA RISULTATO" : "NUOVO RISULTATO"}</p>
            <h2 id="match-title">{editing ? "Modifica la partita" : "Registra una partita"}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Chiudi">×</button>
        </div>
        <form onSubmit={save}>
          <label>
            Data della partita
            <input type="date" value={playedAt} onChange={(e) => setPlayedAt(e.target.value)} required />
          </label>
          <div className="teams-form">
            {[1, 2].map((team) => (
              <fieldset key={team}>
                <legend>Squadra {team}</legend>
                {[0, 1].map((position) => {
                  const index = (team - 1) * 2 + position;
                  return (
                    <select key={index} value={players[index] ?? ""} onChange={(e) => updatePlayer(index, e.target.value)} aria-label={`Giocatore ${position + 1} squadra ${team}`}>
                      <option value="">Scegli giocatore</option>
                      {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.display_name}</option>)}
                    </select>
                  );
                })}
              </fieldset>
            ))}
          </div>
          <div className="sets-form">
            <span>SET</span><span>SQUADRA 1</span><span>SQUADRA 2</span>
            {scores.map((score, index) => (
              <div className="set-row" key={index}>
                <b>{index + 1}</b>
                <input type="number" min="0" max="20" value={score[0]} onChange={(e) => updateScore(index, 0, e.target.value)} aria-label={`Punti squadra 1 set ${index + 1}`} />
                <span>—</span>
                <input type="number" min="0" max="20" value={score[1]} onChange={(e) => updateScore(index, 1, e.target.value)} aria-label={`Punti squadra 2 set ${index + 1}`} />
              </div>
            ))}
          </div>
          <label>
            Campo <span className="optional-label">facoltativo</span>
            <input
              value={court}
              onChange={(e) => setCourt(e.target.value)}
              placeholder="Es. Padel Club Verona · Campo 3"
              maxLength={60}
            />
          </label>
          <label>
            Video YouTube <span className="optional-label">facoltativo</span>
            <input
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="https://youtu.be/..."
              inputMode="url"
            />
          </label>
          <label>
            Nota facoltativa
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Es. Rimonta incredibile al terzo set" />
          </label>
          {editing ? (
            <label>
              Motivo della correzione <span className="optional-label">facoltativo</span>
              <input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Es. Il terzo set era 7-5, non 6-5"
                maxLength={140}
              />
            </label>
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
            <button type="button" className="button button-ghost" onClick={onClose}>Annulla</button>
            <button className="button button-primary" disabled={busy}>{busy ? "Salvataggio…" : "Salva risultato"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function PlayCreateModal({
  profileId,
  matches,
  onClose,
  onSaved,
}: {
  profileId: string;
  matches: PadelMatch[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  // Le partite già registrate con un video sono la scorciatoia più comoda:
  // il link ce l'hai già, resta solo da dire il minuto.
  const withVideo = matches.filter((match) => youtubeId(match.video_url));
  const [matchId, setMatchId] = useState(withVideo[0]?.id ?? "");
  const [videoUrl, setVideoUrl] = useState(withVideo[0]?.video_url ?? "");
  const [start, setStart] = useState("");
  const [duration, setDuration] = useState("8");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function pickMatch(id: string) {
    setMatchId(id);
    const chosen = withVideo.find((match) => match.id === id);
    if (chosen?.video_url) setVideoUrl(chosen.video_url);
  }

  const startSeconds = parseClock(start);
  const previewId = youtubeId(videoUrl);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!previewId) {
      setError("Serve un indirizzo YouTube valido.");
      return;
    }
    if (startSeconds === null) {
      setError("Indica il minuto di partenza come mm:ss, per esempio 3:12.");
      return;
    }
    if (!supabase) return;

    setBusy(true);
    const { error: insertError } = await supabase.from("player_plays").insert({
      profile_id: profileId,
      match_id: matchId || null,
      title: title.trim() || null,
      video_url: videoUrl.trim(),
      start_seconds: startSeconds,
      duration_seconds: Number(duration),
      created_by: profileId,
    });
    if (insertError) {
      setError(insertError.message);
      setBusy(false);
      return;
    }
    await onSaved();
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="play-create-title">
        <div className="modal-head">
          <div>
            <p className="eyebrow dark">NUOVO SPEZZONE</p>
            <h2 id="play-create-title">Segna una play</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Chiudi">×</button>
        </div>
        <form onSubmit={submit}>
          {withVideo.length ? (
            <label>
              Partita <span className="optional-label">facoltativa</span>
              <select value={matchId} onChange={(event) => pickMatch(event.target.value)}>
                <option value="">Video sciolto, non legato a una partita</option>
                {withVideo.map((match) => (
                  <option key={match.id} value={match.id}>
                    {new Intl.DateTimeFormat("it-IT", { dateStyle: "medium" }).format(new Date(match.played_at))}
                    {" · "}
                    {match.players.map((player) => player.profile.display_name).join(", ")}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label>
            Video YouTube
            <input
              value={videoUrl}
              onChange={(event) => setVideoUrl(event.target.value)}
              placeholder="https://youtu.be/..."
              inputMode="url"
              required
            />
          </label>
          <div className="play-time-row">
            <label>
              Minuto di partenza
              <input
                value={start}
                onChange={(event) => setStart(event.target.value)}
                placeholder="3:12"
                inputMode="numeric"
                required
              />
            </label>
            <label>
              Durata
              <select value={duration} onChange={(event) => setDuration(event.target.value)}>
                <option value="5">5 secondi</option>
                <option value="8">8 secondi</option>
                <option value="10">10 secondi</option>
                <option value="15">15 secondi</option>
              </select>
            </label>
          </div>
          <p className="field-hint">
            Il minuto è quello che leggi sul player di YouTube. Scrivilo come mm:ss.
          </p>
          <label>
            Titolo <span className="optional-label">facoltativo</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Es. Smash da fondo campo"
              maxLength={80}
            />
          </label>

          {previewId && startSeconds !== null ? (
            <div className="play-preview">
              <div className="video-frame">
                <iframe
                  src={`https://www.youtube.com/embed/${previewId}?start=${startSeconds}&end=${startSeconds + Number(duration)}`}
                  title="Anteprima dello spezzone"
                  allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
              <small>Anteprima da {formatClock(startSeconds)} a {formatClock(startSeconds + Number(duration))}</small>
            </div>
          ) : null}

          {error ? <p className="form-message error">{error}</p> : null}
          <div className="modal-actions">
            <button type="button" className="button button-ghost" onClick={onClose}>Annulla</button>
            <button className="button button-primary" disabled={busy}>{busy ? "Salvataggio…" : "Salva la play"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function PizzaSessionCreateModal({
  profiles,
  viewerId,
  onClose,
  onSaved,
}: {
  profiles: Profile[];
  viewerId: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [place, setPlace] = useState("");
  const [participantIds, setParticipantIds] = useState<string[]>([viewerId]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function toggleParticipant(profileId: string) {
    if (profileId === viewerId) return;
    setParticipantIds((current) => (
      current.includes(profileId)
        ? current.filter((id) => id !== profileId)
        : [...current, profileId]
    ));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !name.trim() || !participantIds.length) return;
    setBusy(true);
    setError("");
    const { error: rpcError } = await supabase.rpc("open_pizza_session", {
      p_name: name.trim(),
      p_place: place.trim() || null,
      p_participant_ids: participantIds,
    });
    if (rpcError) {
      setError(rpcError.message);
      setBusy(false);
      return;
    }
    await onSaved();
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal pizza-vote-modal" role="dialog" aria-modal="true" aria-labelledby="pizza-create-title">
        <div className="modal-head">
          <div>
            <p className="eyebrow dark">NUOVA VOTAZIONE</p>
            <h2 id="pizza-create-title">Pizzeria e partecipanti</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Chiudi">×</button>
        </div>
        <form onSubmit={submit}>
          <label>Nome pizzeria<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Es. La Nuova Pala" maxLength={80} required /></label>
          <label>Località <span className="optional-label">facoltativa</span><input value={place} onChange={(event) => setPlace(event.target.value)} placeholder="Es. Sanremo" maxLength={80} /></label>
          <fieldset className="pizza-participant-picker">
            <legend>Partecipanti alla votazione</legend>
            <div>
              {profiles.map((profile) => {
                const selected = participantIds.includes(profile.id);
                return (
                  <label className={selected ? "is-selected" : ""} key={profile.id}>
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={profile.id === viewerId}
                      onChange={() => toggleParticipant(profile.id)}
                    />
                    <Avatar profile={profile} size="sm" />
                    <span>{profile.display_name}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          <p className="field-hint pizza-participant-note">
            La votazione si chiude automaticamente quando tutti i partecipanti hanno votato.
          </p>
          {error ? <p className="form-message error">{error}</p> : null}
          <div className="modal-actions">
            <button type="button" className="button button-ghost" onClick={onClose}>Annulla</button>
            <button className="button button-primary" disabled={busy}>{busy ? "Apertura…" : "Apri votazione"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

// Cursore da 1 a 10 con il peso del campo scritto accanto: si vede subito
// quanto quella voce sposta il totale.
function PizzaScoreField({
  label,
  weight,
  min = 1,
  max = 10,
  value,
  onChange,
}: {
  label: string;
  weight: number;
  min?: number;
  max?: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="pizza-score-field">
      <div className="pizza-score-head">
        <b>{label}</b>
        <span>fino a {weight} punti</span>
      </div>
      <div className="pizza-score-input">
        <input
          type="range"
          min={min}
          max={max}
          step="1"
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          aria-label={label}
        />
        <em>{value}</em>
      </div>
    </div>
  );
}

function PizzaVoteModal({
  restaurant,
  session: voteSession,
  votes,
  voters,
  viewerId,
  onClose,
  onSaved,
}: {
  restaurant: PizzaRestaurantRecord;
  session: PizzaSession;
  votes: PizzaSessionVote[];
  voters: Profile[];
  viewerId: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const previous = votes.find((vote) => vote.voter_id === viewerId);
  const [scores, setScores] = useState({
    location: previous?.location ?? 6,
    pizza: previous?.pizza ?? 6,
    dessert: previous?.dessert ?? 6,
    price: previous?.price ?? 6,
    bonus_fabio: previous?.bonus_fabio ?? 0,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const open = sessionIsOpen(voteSession);
  const hasVoted = Boolean(previous);
  const participant = voteSession.participants.some((item) => item.voter_id === viewerId);
  const viewerIsFabio = voters.find((profile) => profile.id === viewerId)?.display_name.toLowerCase() === "fabio";
  const completedVotes = voteSession.participants.filter((item) => item.voted_at).length;
  const missingVotes = voteSession.participants.length - completedVotes;
  const canSeeResult = !open;

  const average = votes.length
    ? {
        location: votes.reduce((sum, vote) => sum + vote.location, 0) / votes.length,
        pizza: votes.reduce((sum, vote) => sum + vote.pizza, 0) / votes.length,
        dessert: votes.reduce((sum, vote) => sum + vote.dessert, 0) / votes.length,
        price: votes.reduce((sum, vote) => sum + vote.price, 0) / votes.length,
      }
    : null;

  function updateScore(key: keyof typeof scores, value: number) {
    setScores((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError("");
    const { error: saveError } = await supabase.rpc("save_pizza_session_vote", {
      p_session_id: voteSession.id,
      p_location: scores.location,
      p_pizza: scores.pizza,
      p_dessert: scores.dessert,
      p_price: scores.price,
      p_bonus_fabio: viewerIsFabio ? scores.bonus_fabio : 0,
    });
    if (saveError) {
      setError(saveError.message);
      setBusy(false);
      return;
    }
    await onSaved();
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal pizza-vote-modal" role="dialog" aria-modal="true" aria-labelledby="pizza-vote-title">
        <div className="modal-head">
          <div>
            <p className="eyebrow dark">{open ? "VOTAZIONE APERTA" : "VOTAZIONE CHIUSA"}</p>
            <h2 id="pizza-vote-title">{restaurant.name}</h2>
            <p className="modal-subtitle">
              {new Intl.DateTimeFormat("it-IT", { dateStyle: "long" }).format(new Date(voteSession.opened_at))}
              {open ? ` · ${completedVotes}/${voteSession.participants.length} voti ricevuti` : " · risultato definitivo"}
            </p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Chiudi">×</button>
        </div>

        {open && participant ? (
          <form onSubmit={submit}>
            <div className="pizza-score-fields">
              <PizzaScoreField label="Location" weight={PIZZA_WEIGHTS.location} value={scores.location} onChange={(value) => updateScore("location", value)} />
              <PizzaScoreField label="Pizza" weight={PIZZA_WEIGHTS.pizza} value={scores.pizza} onChange={(value) => updateScore("pizza", value)} />
              <PizzaScoreField label="Dolce" weight={PIZZA_WEIGHTS.dessert} value={scores.dessert} onChange={(value) => updateScore("dessert", value)} />
              <PizzaScoreField label="Prezzo" weight={PIZZA_WEIGHTS.price} value={scores.price} onChange={(value) => updateScore("price", value)} />
              {viewerIsFabio ? (
                <PizzaScoreField label="Bonus Fabio" weight={7} min={0} max={7} value={scores.bonus_fabio} onChange={(value) => updateScore("bonus_fabio", value)} />
              ) : null}
            </div>
            <p className="pizza-vote-hint">
              I tuoi voti ordinari valgono {roundPizzaScore(pizzaScore(scores))} su 93
              {viewerIsFabio ? `, più ${scores.bonus_fabio} punti Fabio.` : "."}
            </p>
            {error ? <p className="form-message error">{error}</p> : null}
            <div className="modal-actions">
              <button type="button" className="button button-ghost" onClick={onClose}>Chiudi</button>
              <button className="button button-primary" disabled={busy}>
                {busy ? "Salvataggio…" : hasVoted ? "Aggiorna il voto" : "Vota"}
              </button>
            </div>
          </form>
        ) : open ? (
          <p className="demo-profile-note">Non sei tra i partecipanti di questa votazione.</p>
        ) : null}

        {canSeeResult && average ? (
          <div className="pizza-live">
            <div className="pizza-live-head">
              <div>
                <p className="eyebrow dark">RISULTATO DEFINITIVO</p>
                <b>{finalPizzaScore(votes, voteSession, voters)}<small>/100</small></b>
              </div>
              <span>{votes.length} {votes.length === 1 ? "voto" : "voti"}</span>
            </div>
            <div className="pizza-live-rows">
              {([
                ["Location", average.location],
                ["Pizza", average.pizza],
                ["Dolce", average.dessert],
                ["Prezzo", average.price],
              ] as [string, number][]).map(([label, value]) => (
                <div className="pizza-live-row" key={label}>
                  <span>{label}</span>
                  <i><b style={{ width: `${value * 10}%` }} /></i>
                  <em>{value.toFixed(1)}</em>
                </div>
              ))}
            </div>
            <div className="pizza-live-voters">
              {voteSession.participants.map(({ voter_id }) => {
                const profile = voters.find((item) => item.id === voter_id);
                return profile ? <Avatar key={voter_id} profile={profile} size="sm" /> : null;
              })}
            </div>
          </div>
        ) : (
          <p className="demo-profile-note">
            Risultato nascosto: mancano {missingVotes} {missingVotes === 1 ? "voto" : "voti"} su {voteSession.participants.length}.
          </p>
        )}
      </section>
    </div>
  );
}

function PadelSectionNav({
  active,
  onSelect,
}: {
  active: "matches" | "ranking";
  onSelect: (view: "matches" | "ranking") => void;
}) {
  return (
    <div className="padel-section-nav">
      <div><p className="eyebrow dark">PADEL</p><h2>Partite e classifiche</h2></div>
      <div className="ranking-switch" role="group" aria-label="Sezione Padel">
        <button className={active === "matches" ? "active" : ""} onClick={() => onSelect("matches")}>Partite</button>
        <button className={active === "ranking" ? "active" : ""} onClick={() => onSelect("ranking")}>Ranking</button>
      </div>
    </div>
  );
}

function AppShell({ session }: { session: Session | null }) {
  // Il Court è la home: si entra direttamente lì.
  const [view, setView] = useState<View>("padel");
  const [padelView, setPadelView] = useState<PadelView>("overview");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [matches, setMatches] = useState<PadelMatch[]>([]);
  const [pizzaRestaurants, setPizzaRestaurants] = useState<PizzaRestaurantRecord[]>([]);
  const [showMatch, setShowMatch] = useState(false);
  const [pizzaSchemaReady, setPizzaSchemaReady] = useState(true);
  const [pizzaSessions, setPizzaSessions] = useState<PizzaSession[]>([]);
  const [pizzaSessionVotes, setPizzaSessionVotes] = useState<PizzaSessionVote[]>([]);
  const [pizzaSessionsReady, setPizzaSessionsReady] = useState(true);
  const [votingSession, setVotingSession] = useState<PizzaSession | null>(null);
  const [showSessionPicker, setShowSessionPicker] = useState(false);
  // Partite e classifica si aprono e si richiudono dentro la home. Il limite
  // è sul numero di righe, così il tasto compare solo quando c'è davvero
  // qualcosa di nascosto.
  const [allMatches, setAllMatches] = useState(false);
  const [allRanking, setAllRanking] = useState(false);
  // Quattro righe di classifica: è anche il taglio che il CSS applica su
  // mobile, e tenerli uguali evita che il tasto prometta righe già visibili.
  const HOME_ROWS = 4;
  const HOME_MATCHES = 2;
  const [editingMatch, setEditingMatch] = useState<PadelMatch | null>(null);
  const [showProfileEdit, setShowProfileEdit] = useState(false);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const avatarFileRef = useRef<HTMLInputElement>(null);
  const [rankingMode, setRankingMode] = useState<"single" | "team">("single");
  const [pizzaRankingMode, setPizzaRankingMode] = useState<PizzaRankingMode>("contemporary");
  const [playingVideo, setPlayingVideo] = useState<string | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [notice, setNotice] = useState("");
  const [profileName, setProfileName] = useState("");
  const [handedness, setHandedness] = useState("");
  const [courtSide, setCourtSide] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarUrlInitial, setAvatarUrlInitial] = useState("");
  const [teamRecords, setTeamRecords] = useState<PadelTeamRecord[]>([]);
  const [teamSchemaReady, setTeamSchemaReady] = useState(true);
  const [plays, setPlays] = useState<PlayerPlay[]>([]);
  const [playsSchemaReady, setPlaysSchemaReady] = useState(true);
  const [showPlayCreate, setShowPlayCreate] = useState(false);
  const [playingClip, setPlayingClip] = useState<PlayerPlay | null>(null);
  const [seasonRows, setSeasonRows] = useState<SeasonStanding[]>([]);
  const [season, setSeason] = useState(new Date().getFullYear());

  const loadData = useCallback(async () => {
    const client = supabase;
    if (!client) return;
    // Sigilla le stagioni concluse non ancora archiviate. La funzione è
    // idempotente: se non c'è nulla da fare esce subito.
    const thisYear = new Date().getFullYear();
    for (let year = thisYear - 1; year >= thisYear - 5; year -= 1) {
      await client.rpc("archive_padel_season", { p_season: year });
    }

    const [
      profilesResult,
      matchesResult,
      pizzaResult,
      teamsResult,
      seasonsResult,
      playsResult,
      pizzaSessionsResult,
      pizzaSessionVotesResult,
      courtsResult,
    ] = await Promise.all([
      client.from("profiles").select("*").order("rating", { ascending: false }),
      client
        .from("matches")
        .select("id, played_at, created_at, created_by, winner_team, notes, video_url, rating_delta, sets:match_sets(set_number, team1_games, team2_games), players:match_players(profile_id, team, rating_delta, profile:profiles(*))")
        .order("played_at", { ascending: false })
        .order("created_at", { ascending: false }),
      client
        .from("pizza_restaurants")
        .select("id, name, place, created_by, created_at, votes:pizza_votes(restaurant_id, voter_id, location, pizza, dessert, price, bonus_fabio)")
        .order("created_at", { ascending: false }),
      client.from("padel_teams").select("id, player_a, player_b, name, image_path"),
      client
        .from("padel_season_standings")
        .select("season, profile_id, position, rating, matches_played, wins, losses, current_streak")
        .order("season", { ascending: false })
        .order("position", { ascending: true }),
      client
        .from("player_plays")
        .select("id, profile_id, match_id, title, video_url, start_seconds, duration_seconds, created_by, created_at")
        .order("created_at", { ascending: false }),
      client
        .from("pizza_sessions")
        .select("id, restaurant_id, opened_by, opened_at, completed_at, participants:pizza_session_participants(voter_id, voted_at)")
        .order("opened_at", { ascending: false }),
      // La RLS nasconde i voti altrui finché tutti i partecipanti non hanno votato.
      client
        .from("pizza_session_votes")
        .select("session_id, voter_id, location, pizza, dessert, price, bonus_fabio"),
      // Il campo da gioco sta in una query a parte: se la migrazione non e
      // stata eseguita questa fallisce da sola, senza portarsi dietro il
      // caricamento delle partite.
      client.from("matches").select("id, court"),
    ]);

    if (profilesResult.error || matchesResult.error) {
      setNotice(profilesResult.error?.message ?? matchesResult.error?.message ?? "Non è stato possibile caricare i dati.");
    } else {
      const withAvatars = (profilesResult.data ?? []).map((profile) => ({
        ...profile,
        // avatar_path ospita due cose: il percorso nello storage oppure, se
        // comincia con http, un indirizzo esterno già pronto (utile per le GIF).
        avatar_url: profile.avatar_path
          ? /^https?:\/\//i.test(profile.avatar_path)
            ? profile.avatar_path
            : client.storage.from("avatars").getPublicUrl(profile.avatar_path).data.publicUrl
          : null,
      })) as Profile[];
      const profileMap = new Map(withAvatars.map((profile) => [profile.id, profile]));
      // Vuota finche la migrazione del campo da gioco non e stata eseguita.
      const courtMap = new Map(
        courtsResult.error
          ? []
          : ((courtsResult.data ?? []) as { id: string; court: string | null }[]).map((row) => [row.id, row.court]),
      );
      const normalized = (matchesResult.data ?? []).map((match) => ({
        ...match,
        court: courtMap.get(match.id) ?? null,
        players: (match.players ?? []).map((player) => ({
          ...player,
          profile: profileMap.get(player.profile_id) ?? player.profile,
        })),
      })) as unknown as PadelMatch[];
      setProfiles(withAvatars);
      setMatches(normalized);
      setPizzaSchemaReady(!pizzaResult.error);
      if (!pizzaResult.error) setPizzaRestaurants((pizzaResult.data ?? []) as PizzaRestaurantRecord[]);
      // Finché la migrazione delle sessioni non è stata eseguita queste query
      // query falliscono da sole, senza portarsi dietro il resto.
      setPizzaSessionsReady(!pizzaSessionsResult.error);
      if (!pizzaSessionsResult.error) setPizzaSessions((pizzaSessionsResult.data ?? []) as PizzaSession[]);
      if (!pizzaSessionVotesResult.error) {
        setPizzaSessionVotes((pizzaSessionVotesResult.data ?? []) as PizzaSessionVote[]);
      }
      // Se la migrazione delle squadre non è ancora stata eseguita la query
      // fallisce: il resto dell'app deve continuare a funzionare.
      if (!seasonsResult.error) setSeasonRows((seasonsResult.data ?? []) as SeasonStanding[]);
      setPlaysSchemaReady(!playsResult.error);
      if (!playsResult.error) setPlays((playsResult.data ?? []) as PlayerPlay[]);
      setTeamSchemaReady(!teamsResult.error);
      if (!teamsResult.error) {
        setTeamRecords(
          ((teamsResult.data ?? []) as PadelTeamRecord[]).map((record) => ({
            ...record,
            image_url: record.image_path
              ? client.storage.from("avatars").getPublicUrl(record.image_path).data.publicUrl
              : null,
          })),
        );
      }
      const own = withAvatars.find((profile) => profile.id === session?.user.id);
      setProfileName(own?.display_name ?? "");
      setHandedness(own?.handedness ?? "");
      setCourtSide(own?.court_side ?? "");
      const ownExternal = /^https?:\/\//i.test(own?.avatar_path ?? "") ? own?.avatar_path ?? "" : "";
      setAvatarUrl(ownExternal);
      setAvatarUrlInitial(ownExternal);
    }
    setLoading(false);
  }, [session?.user.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadData(), 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const sorted = useMemo(() => sortPadelProfiles(profiles), [profiles]);
  const rankedProfiles = useMemo(() => sorted.filter((profile) => profile.matches_played > 0), [sorted]);
  const currentYear = new Date().getFullYear();
  const archivedSeasons = useMemo(
    () => [...new Set(seasonRows.map((row) => row.season))].sort((a, b) => b - a),
    [seasonRows],
  );
  // Stagione corrente: dati vivi. Stagione passata: la fotografia archiviata,
  // riagganciata ai profili solo per nome e foto.
  const seasonProfiles = useMemo(() => {
    if (season === currentYear) return profiles;
    const byId = new Map(profiles.map((profile) => [profile.id, profile]));
    return seasonRows
      .filter((row) => row.season === season)
      .map((row) => {
        const base = byId.get(row.profile_id);
        if (!base) return null;
        return {
          ...base,
          rating: row.rating,
          matches_played: row.matches_played,
          wins: row.wins,
          losses: row.losses,
          current_streak: row.current_streak,
        };
      })
      .filter(Boolean) as Profile[];
  }, [season, currentYear, seasonRows, profiles]);

  const teams = useMemo(
    () => buildPadelTeams(matches, profiles, teamRecords),
    [matches, profiles, teamRecords],
  );
  const rankingRows = rankingMode === "single" ? seasonProfiles.length : teams.length;
  const playerTeams = useMemo(
    () => teams.filter((team) => team.players.some((profile) => profile.id === selectedPlayerId)),
    [teams, selectedPlayerId],
  );
  const contemporaryPizzaEntries = useMemo(
    () => buildContemporaryPizzaRanking(pizzaRestaurants, pizzaSessions, pizzaSessionVotes, profiles),
    [pizzaRestaurants, pizzaSessions, pizzaSessionVotes, profiles],
  );
  const classicPizzaEntries = useMemo(
    () => buildClassicPizzaRanking(pizzaRestaurants, pizzaSessions, pizzaSessionVotes, profiles),
    [pizzaRestaurants, pizzaSessions, pizzaSessionVotes, profiles],
  );
  const pizzaEntries = pizzaRankingMode === "classic" ? classicPizzaEntries : contemporaryPizzaEntries;
  const currentUser = profiles.find((profile) => profile.id === session?.user.id);
  // Votazioni ancora aperte: alimentano sia la card in cima alla pagina pizza
  // sia il pallino sull'icona della barra.
  const openPizzaSessions = pizzaSessions.filter(sessionIsOpen);
  const pendingPizzaVotes = openPizzaSessions.filter(
    (openSession) => openSession.participants.some((participant) => participant.voter_id === session?.user.id)
      && !pizzaSessionVotes.some(
      (vote) => vote.session_id === openSession.id && vote.voter_id === session?.user.id,
    ),
  );
  const currentRank = currentUser?.matches_played ? rankOf(sorted, currentUser.id) : 0;
  const selectedPlayer = profiles.find((profile) => profile.id === selectedPlayerId) ?? null;
  const isOwnCard = view === "padel" && padelView === "player" && selectedPlayerId === session?.user.id;
  const selectedPlayerRank = selectedPlayer?.matches_played ? rankOf(sorted, selectedPlayer.id) : 0;
  const selectedPlayerMatches = selectedPlayer
    ? matches.filter((match) => match.players.some((player) => player.profile_id === selectedPlayer.id))
    : [];
  const selectedPlayerPlays = selectedPlayer
    ? plays.filter((play) => play.profile_id === selectedPlayer.id)
    : [];
  // Tutta la bacheca confronta il giocatore con la cronologia del gruppo.
  const selectedPlayerBadges = useMemo(() => {
    if (!selectedPlayer) return [];
    return playerBadges(selectedPlayer, profiles, matches);
  }, [selectedPlayer, profiles, matches]);
  const earnedPlayerBadges = selectedPlayerBadges.filter((badge) => badge.unlocked);
  // Con i parimerito il giocatore da raggiungere è il primo con punteggio più
  // alto, non semplicemente quello nella riga precedente.
  const nextRankedPlayer = currentUser
    ? [...sorted].reverse().find((profile) => profile.rating > currentUser.rating) ?? null
    : null;
  const pointsToNext = nextRankedPlayer && currentUser
    ? Math.max(0, nextRankedPlayer.rating - currentUser.rating)
    : 0;
  // Ultimo posto e vantaggio risicato guardano solo chi ha gia giocato:
  // rankedProfiles (piu sopra) contiene gia i soli profili in classifica.
  const isLastRanked = Boolean(
    currentUser && rankedProfiles.length > 1 && rankedProfiles[rankedProfiles.length - 1]?.id === currentUser.id,
  );
  const chaserPlayer = currentUser
    ? rankedProfiles.find((profile) => profile.rating < currentUser.rating) ?? null
    : null;
  const leadOverChaser = chaserPlayer && currentUser ? currentUser.rating - chaserPlayer.rating : 0;
  const hasNarrowLead = leadOverChaser >= 1 && leadOverChaser <= 5;
  // Il numero casuale si estrae una volta sola all'apertura della schermata
  // (initializer pigro di useState), cosi la frase non cambia a ogni render
  // mentre si naviga tra le sezioni. AppShell esiste solo dopo il login,
  // quindi l'HTML statico non contiene nessuna frase da reidratare.
  const [greetingSeed] = useState(() => Math.random());
  // Saluto e frase si pescano indipendentemente: con un solo numero casuale
  // le due scelte sarebbero rimaste sempre appaiate.
  const [saluteSeed] = useState(() => Math.random());

  // Profilo e scheda giocatore sono la stessa pagina: la propria è solo la
  // scheda di sé stessi, con in più i campi modificabili. Memoizzata perche
  // finisce fra le voci della barra mobile, che altrimenti verrebbero
  // ricostruite a ogni render.
  const openOwnCard = useCallback(() => {
    if (!currentUser) return;
    setSelectedPlayerId(currentUser.id);
    setPadelView("player");
    setView("padel");
  }, [currentUser]);

  // --- Barra di navigazione mobile -----------------------------------------
  // La pastiglia viene spostata scrivendo direttamente sullo stile: passando
  // da uno stato React ogni movimento del dito farebbe ridisegnare tutta la
  // schermata, e il trascinamento risulterebbe a scatti.
  const navRef = useRef<HTMLElement | null>(null);
  const navPillRef = useRef<HTMLSpanElement | null>(null);
  const navButtonsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const navDragging = useRef(false);
  const navPointerStart = useRef<number | null>(null);

  // Il Padel è la home: partite e classifica si aprono lì dentro, quindi non
  // serve più una voce separata.
  const navItems = useMemo(() => ([
    { key: "padel", glyph: "racket", label: "Padel", active: view === "padel" && padelView !== "player", select: () => { setView("padel"); setPadelView("overview"); } },
    { key: "pizza", glyph: "pizza", label: "Pizza", active: view === "pizza", select: () => setView("pizza") },
    { key: "profile", glyph: "", label: "Profilo", active: isOwnCard, select: openOwnCard },
  ]), [view, padelView, isOwnCard, openOwnCard]);

  const navActiveIndex = navItems.findIndex((item) => item.active);

  // Toccare la voce su cui si e gia riporta in cima, come nelle app di
  // sistema. Lo scorrimento e morbido perche html ha scroll-behavior.
  const selectNavItem = useCallback((index: number) => {
    const item = navItems[index];
    if (!item) return;
    if (item.active) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    item.select();
  }, [navItems]);

  // Porta la pastiglia sopra una voce. Con animate = false ci arriva secca,
  // e quello che serve al primo disegno e mentre si trascina.
  // Dove si trova adesso la pastiglia: serve come punto di partenza
  // dell'animazione, perche il valore letto dallo stile e gia quello finale.
  const navPillLeft = useRef(0);

  const placePill = useCallback((index: number, animate: boolean) => {
    const nav = navRef.current;
    const pill = navPillRef.current;
    if (!nav || !pill) return;
    const button = navButtonsRef.current[index];
    if (!button) {
      pill.style.opacity = "0";
      return;
    }
    const navBox = nav.getBoundingClientRect();
    const buttonBox = button.getBoundingClientRect();
    const from = navPillLeft.current;
    const to = buttonBox.left - navBox.left;
    const wasHidden = pill.style.opacity !== "1";

    // La posizione finale viene scritta subito: l'animazione qui sotto la
    // sovrascrive solo mentre e in corso, cosi alla fine non c'e nessuno
    // scatto di assestamento.
    pill.style.transition = "none";
    pill.style.opacity = "1";
    pill.style.width = `${buttonBox.width}px`;
    pill.style.transform = `translateX(${to}px)`;
    navPillLeft.current = to;

    const distance = Math.abs(to - from);
    const reduceMotion = typeof window !== "undefined"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!animate || wasHidden || distance < 1 || reduceMotion || !pill.animate) return;

    // Piu e lungo il salto, piu la pastiglia si allunga nel senso della
    // corsa e si schiaccia in altezza: e la deformazione che da l'idea
    // della goccia che si sposta invece del rettangolo che trasla.
    const steps = distance / Math.max(buttonBox.width, 1);
    const stretch = 1 + Math.min(0.3, steps * 0.13);
    const squash = 1 - Math.min(0.14, steps * 0.06);

    pill.animate(
      [
        { transform: `translateX(${from}px) scale(1, 1)` },
        { transform: `translateX(${(from + to) / 2}px) scale(${stretch}, ${squash})`, offset: 0.45 },
        { transform: `translateX(${to}px) scale(1, 1)` },
      ],
      {
        duration: 340 + Math.min(140, steps * 45),
        easing: "cubic-bezier(0.32, 0.9, 0.28, 1)",
      },
    );
  }, []);

  // Segue il dito, restando dentro i due estremi della barra.
  const movePillTo = useCallback((clientX: number) => {
    const nav = navRef.current;
    const pill = navPillRef.current;
    const first = navButtonsRef.current[0];
    const last = navButtonsRef.current[navButtonsRef.current.length - 1];
    if (!nav || !pill || !first || !last) return;
    const navBox = nav.getBoundingClientRect();
    const firstBox = first.getBoundingClientRect();
    const lastBox = last.getBoundingClientRect();
    const left = clientX - navBox.left - firstBox.width / 2;
    pill.style.transition = "none";
    pill.style.opacity = "1";
    pill.style.width = `${firstBox.width}px`;
    const clamped = Math.min(
      lastBox.left - navBox.left,
      Math.max(firstBox.left - navBox.left, left),
    );
    pill.style.transform = `translateX(${clamped}px)`;
    navPillLeft.current = clamped;
  }, []);

  const nearestNavIndex = useCallback((clientX: number) => {
    let best = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    navButtonsRef.current.forEach((button, index) => {
      if (!button) return;
      const box = button.getBoundingClientRect();
      const distance = Math.abs(clientX - (box.left + box.width / 2));
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    });
    return best;
  }, []);

  // Riallinea la pastiglia quando cambia la voce attiva o le misure della
  // barra: qui si tocca solo lo stile, nessuno stato da aggiornare.
  // currentUser e loading sono fra le dipendenze di proposito: la barra
  // viene creata solo quando il profilo e pronto, e senza di loro questo
  // effetto non ripartirebbe al suo arrivo, lasciando la pastiglia
  // invisibile fino al primo cambio di sezione.
  useEffect(() => {
    placePill(navActiveIndex, true);
    const realign = () => placePill(navActiveIndex, false);
    window.addEventListener("resize", realign);
    window.addEventListener("orientationchange", realign);
    return () => {
      window.removeEventListener("resize", realign);
      window.removeEventListener("orientationchange", realign);
    };
  }, [navActiveIndex, placePill, currentUser, loading]);
  const heroGreeting = useMemo(() => {
    const pool = heroGreetingPool(currentRank, isLastRanked, hasNarrowLead);
    const salutes = heroSalutePool(currentRank, isLastRanked);
    const salute = salutes[Math.floor(saluteSeed * salutes.length)] ?? salutes[0];
    return {
      lead: salute.replace("{nome}", currentUser?.display_name ?? ""),
      rest: pool[Math.floor(greetingSeed * pool.length)] ?? pool[0] ?? "",
    };
  }, [currentRank, isLastRanked, hasNarrowLead, currentUser?.display_name, greetingSeed, saluteSeed]);
  const winRate = currentUser?.matches_played
    ? Math.round((currentUser.wins / currentUser.matches_played) * 100)
    : 0;
  const missingDatabaseSchema =
    notice.includes("public.profiles") ||
    notice.includes("schema cache");

  if (!currentUser) {
    return (
      <div className="app-shell">
        <header className="topbar"><Brand /></header>
        <main className="content">
          {loading ? (
            <LoadingScreen />
          ) : (
            <div className="empty-state">
              <p className="eyebrow dark">
                {missingDatabaseSchema ? "DATABASE DA CONFIGURARE" : "PROFILO DA COMPLETARE"}
              </p>
              <h1>{missingDatabaseSchema ? "Completa Supabase." : "Profilo non disponibile."}</h1>
              <p>
                {missingDatabaseSchema
                  ? "Esegui lo script schema.sql nel SQL Editor di Supabase, poi ricarica questa pagina."
                  : notice || "Il tuo profilo non è ancora presente nel database Supabase."}
              </p>
              <button className="button button-dark" onClick={() => void supabase?.auth.signOut()}>Esci</button>
            </div>
          )}
        </main>
      </div>
    );
  }

  async function handleSaved() {
    const wasEditing = Boolean(editingMatch);
    setShowMatch(false);
    setEditingMatch(null);
    await loadData();
    setNotice(
      wasEditing
        ? "Correzione salvata. Classifica e statistiche sono state ricalcolate."
        : "Partita salvata. La classifica è stata aggiornata.",
    );
  }

  async function uploadAvatar(file: File | undefined) {
    if (!file || !supabase || !session) return;
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const path = `${session.user.id}/avatar-${Date.now()}.${extension}`;
    setNotice("Caricamento della foto…");
    const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (uploadError) {
      setNotice(uploadError.message);
      return;
    }
    const { error: updateError } = await supabase.from("profiles").update({ avatar_path: path }).eq("id", session.user.id);
    setNotice(updateError ? updateError.message : "Foto profilo aggiornata.");
    if (!updateError) await loadData();
  }

  async function updateProfile(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !session || !profileName.trim()) return;

    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: profileName.trim(),
        handedness: handedness || null,
        court_side: courtSide || null,
      })
      .eq("id", session.user.id);
    setNotice(error ? error.message : "Profilo aggiornato.");
    if (!error) await loadData();
  }

  // La foto da indirizzo web finisce nella stessa colonna del percorso nello
  // storage: chi legge distingue i due casi dal prefisso http (vedi loadData).
  async function saveAvatarUrl() {
    if (!supabase || !session) return;
    const clean = avatarUrl.trim();
    if (clean && !/^https:\/\//i.test(clean)) {
      setNotice("L'indirizzo dell'immagine deve iniziare con https://");
      return;
    }
    const { error } = await supabase
      .from("profiles")
      .update({ avatar_path: clean || null })
      .eq("id", session.user.id);
    setNotice(error ? error.message : clean ? "Foto profilo aggiornata." : "Foto profilo rimossa.");
    if (!error) {
      setShowAvatarPicker(false);
      await loadData();
    }
  }

  // Toccare una riga apre l'ultima votazione associata alla pizzeria.
  function showPizzaSession(restaurantId: string) {
    const found = pizzaSessions
      .filter((item) => item.restaurant_id === restaurantId)
      .sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime())[0];
    if (found) {
      setVotingSession(found);
      return;
    }
    setNotice("Nessuna votazione registrata per questa pizzeria.");
  }

  async function removePlay(play: PlayerPlay) {
    if (!supabase) return;
    const { error } = await supabase.from("player_plays").delete().eq("id", play.id);
    setNotice(error ? error.message : "Play rimossa.");
    if (!error) await loadData();
  }

  async function saveTeam(team: PadelTeam, name: string, file?: File) {
    if (!supabase || !session) return;
    const [player_a, player_b] = team.id.split("|");
    let image_path: string | undefined;

    if (file) {
      const extension = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      // Le regole dello storage impongono la cartella dell'utente: usiamo
      // quella di chi carica, il file resta pubblico in lettura.
      const path = `${session.user.id}/team-${Date.now()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true });
      if (uploadError) {
        setNotice(uploadError.message);
        return;
      }
      image_path = path;
    }

    const { error } = await supabase.from("padel_teams").upsert(
      {
        player_a,
        player_b,
        name: name.trim() || null,
        ...(image_path ? { image_path } : {}),
      },
      { onConflict: "player_a,player_b" },
    );

    setNotice(error ? error.message : "Squadra aggiornata.");
    if (!error) await loadData();
  }

  function openPlayer(profile: Profile) {
    setSelectedPlayerId(profile.id);
    setPadelView("player");
  }

  // Il Court fa da home.
  function goHome() {
    setView("padel");
    setPadelView("overview");
  }



  return (
    <div className="app-shell">
      <header className="topbar">
        <nav className="desktop-nav" aria-label="Navigazione principale">
          <button
            className={view === "padel" && padelView !== "player" ? "active" : ""}
            onClick={goHome}
          >
            Padel
          </button>
          <button
            className={view === "pizza" ? "active" : ""}
            onClick={() => setView("pizza")}
          >
            Pizza
          </button>
        </nav>
        <button
          className={`profile-chip ${isOwnCard ? "active" : ""}`}
          onClick={openOwnCard}
        >
          <span><b>{currentUser.display_name}</b><small>Padel {currentRank ? `#${currentRank}` : "N/C"}</small></span>
          <Avatar profile={currentUser} size="sm" />
        </button>
      </header>

      {notice ? <button className="notice" onClick={() => setNotice("")}>{notice}<span>×</span></button> : null}

      <main className="content">
        {loading ? (
          <LoadingScreen />
        ) : null}

        {!loading && view === "padel" && padelView === "overview" ? (
          <>
            <section className="dashboard-grid">
              <div className="dashboard-main">
                <article
                  className="hero-stat hero-stat-link"
                  onClick={openOwnCard}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openOwnCard();
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label="Apri la tua scheda"
                >
                  <BlockMark size="lg" />
                  <div className="hero-stat-copy">
                    {/* In alto il saluto, pescato a parte dalla frase. */}
                    <h1 className="hero-greeting">{heroGreeting.lead}</h1>
                    <p className="eyebrow">LA TUA POSIZIONE</p>
                    {/* Numero e avatar sulla stessa riga: cosi restano
                        incolonnati fra loro invece che ognuno per conto suo. */}
                    <div className="hero-position-row">
                      <div className="position">{currentRank ? <><span>#</span>{currentRank}</> : "N/C"}</div>
                      <div className="hero-player">
                        <Avatar profile={currentUser} size="xl" rank={currentRank || undefined} />
                      </div>
                    </div>
                    <p>
                      {currentRank === 0
                        ? "Gioca la prima partita per entrare nella classifica."
                        : currentRank === 1
                          ? "Sei in testa alla classifica."
                          : <>Sei a <b>{pointsToNext} punti</b> dal prossimo posto.</>}
                    </p>
                    <div className="progress-track"><span style={{ width: `${currentRank ? Math.min(92, 48 + winRate / 2) : 0}%` }} /></div>
                    <small>{heroGreeting.rest}</small>
                  </div>
                  <div className="hero-kpis">
                    <span><b>{currentRank ? currentUser.rating : "N/C"}</b><small>ELO PT</small></span>
                    <span><b>{winRate}%</b><small>WIN RATE</small></span>
                    <span><b>{currentUser.current_streak > 0 ? currentUser.current_streak : 0}</b><small>WIN STREAK</small></span>
                  </div>
                </article>

                <div className="section-head">
                  <div className="section-head-label"><p className="eyebrow dark">ULTIMI INCONTRI</p><h2>La storia recente</h2></div>
                  <div className="court-actions">
                    <button className="button button-primary cta-new-match" onClick={() => setShowMatch(true)}>+ New Match</button>
                    {matches.length > HOME_MATCHES ? (
                      <button
                        className="button button-card cta-see-all-top"
                        onClick={() => setAllMatches((open) => !open)}
                      >
                        {allMatches ? "Vedi meno" : `Vedi tutto (${matches.length})`}
                      </button>
                    ) : null}
                  </div>
                </div>
                {matches.length ? (
                  // Su mobile le partite e il tasto stanno in un unico
                  // riquadro, come la classifica: vedi .match-panel.
                  <div className="match-panel">
                    {/* Titolo interno al riquadro, come "Classifica Elo".
                        Su desktop resta nascosto: li il titolo di sezione
                        c'e gia sopra, fuori dal riquadro. */}
                    <div className="match-panel-head"><h2>Ultime partite</h2></div>
                    <div className="match-list">
                      {(allMatches ? matches : matches.slice(0, HOME_MATCHES)).map((match) => (
                        <MatchCard
                          key={match.id}
                          match={match}
                          onEdit={(selected) => setEditingMatch(selected)}
                          onPlayVideo={(id) => setPlayingVideo(id)}
                          viewerId={session?.user.id}
                        />
                      ))}
                    </div>
                    {matches.length > HOME_MATCHES ? (
                      <button
                        className="button button-ghost button-full cta-see-all-bottom"
                        onClick={() => setAllMatches((open) => !open)}
                      >
                        {allMatches ? "Vedi meno" : `Vedi tutte (${matches.length})`}
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <div className="compact-empty"><span>00</span><p>Nessuna partita registrata. La prima scriverà la storia.</p></div>
                )}
              </div>

              <aside className={`dashboard-side ${allRanking ? "is-open" : ""}`}>
                <div className="side-head">
                  <div><h2>Classifica Elo</h2></div>
                  {/* Due icone al posto di due parole: una racchetta per il
                      singolo, due per le coppie. */}
                  <div className="mode-switch" role="group" aria-label="Tipo di classifica">
                    <button
                      className={rankingMode === "single" ? "active" : ""}
                      onClick={() => setRankingMode("single")}
                      aria-label="Classifica singolo"
                      title="Singolo"
                    >
                      <NavGlyph name="racket" />
                    </button>
                    <button
                      className={rankingMode === "team" ? "active" : ""}
                      onClick={() => setRankingMode("team")}
                      aria-label="Classifica squadre"
                      title="Squadra"
                    >
                      <NavGlyph name="rackets" />
                    </button>
                  </div>
                </div>
                {rankingMode === "single" ? (
                  <RankingList
                    profiles={seasonProfiles}
                    onSelect={openPlayer}
                    limit={allRanking ? undefined : HOME_ROWS}
                  />
                ) : teams.length ? (
                  <TeamRankingList teams={teams} limit={allRanking ? undefined : HOME_ROWS} />
                ) : (
                  <p className="demo-profile-note">
                    Le coppie si formano dalle partite: registra un doppio e compariranno qui.
                  </p>
                )}
                {rankingRows > HOME_ROWS ? (
                  <button
                    className="button button-ghost button-full"
                    onClick={() => setAllRanking((open) => !open)}
                  >
                    {allRanking ? "Vedi meno" : `Vedi tutti (${rankingRows})`}
                  </button>
                ) : null}
              </aside>
            </section>
          </>
        ) : null}

        {!loading && view === "padel" && padelView === "ranking" ? (
          <section className="page-section ranking-page">
            <PadelSectionNav active="ranking" onSelect={setPadelView} />
            <article className="section-hero">
              <BlockMark size="lg" />
              <div className="section-hero-head">
                <div>
                  <p className="eyebrow">THEBOYZ PADEL</p>
                  <h1>Il ranking del gruppo</h1>
                  <p>Il ranking si aggiorna automaticamente dopo ogni risultato.</p>
                  {/* La stagione si sceglie qui, non piu in home. */}
                  <SeasonPicker
                    value={season}
                    options={[currentYear, ...archivedSeasons.filter((year) => year !== currentYear)]}
                    onChange={setSeason}
                  />
                </div>
                <div className="mode-switch" role="group" aria-label="Tipo di ranking">
                  <button
                    className={rankingMode === "single" ? "active" : ""}
                    onClick={() => setRankingMode("single")}
                    aria-label="Classifica singolo"
                    title="Singolo"
                  >
                    <NavGlyph name="racket" />
                  </button>
                  <button
                    className={rankingMode === "team" ? "active" : ""}
                    onClick={() => setRankingMode("team")}
                    aria-label="Classifica squadre"
                    title="Squadra"
                  >
                    <NavGlyph name="rackets" />
                  </button>
                </div>
              </div>
            </article>
            {rankingMode === "single" ? (
              <RankingList profiles={seasonProfiles} onSelect={openPlayer} />
            ) : teams.length ? (
              <TeamRankingList teams={teams} />
            ) : (
              <div className="empty-board">
                <span>00</span>
                <h2>Nessuna squadra in classifica</h2>
                <p>Le coppie si formano da sole: registra un match e compariranno qui.</p>
              </div>
            )}
          </section>
        ) : null}

        {!loading && view === "padel" && padelView === "player" && selectedPlayer ? (
          <section className="page-section player-detail-page">
            <article className="player-detail-hero">
              <BlockMark />
              <div className="player-detail-identity">
                <div className="profile-photo">
                  <Avatar profile={selectedPlayer} size="xl" rank={selectedPlayerRank || undefined} />
                  {isOwnCard && supabase ? (
                    <button className="photo-button" type="button" onClick={() => setShowAvatarPicker(true)}>
                      Cambia foto
                    </button>
                  ) : null}
                </div>
                <div>
                  <p className="eyebrow eyebrow-with-action">
                    {isOwnCard ? "IL TUO PROFILO" : "SCHEDA GIOCATORE"}
                    {isOwnCard ? (
                      <button
                        className="player-edit-button"
                        type="button"
                        onClick={() => setShowProfileEdit(true)}
                        title="Modifica i dati del profilo"
                      >
                        <span aria-hidden="true">✎</span> Modifica
                      </button>
                    ) : null}
                  </p>
                  <h1>{selectedPlayer.display_name}</h1>
                  <div className="player-traits">
                    {padelTraits(selectedPlayer) ? <span>{padelTraits(selectedPlayer)}</span> : null}
                    <span>{selectedPlayer.matches_played ? `#${selectedPlayerRank} in classifica` : "Non classificato"}</span>
                    {selectedPlayer.matches_played ? <span>Serie {selectedPlayer.current_streak > 0 ? `+${selectedPlayer.current_streak}` : selectedPlayer.current_streak}</span> : null}
                    <span>In campo dal {new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric" }).format(new Date(selectedPlayer.created_at ?? "2026-01-01"))}</span>
                  </div>
                </div>
              </div>
              <div className="player-rating-card">
                <span>ELO ATTUALE</span>
                <b>{selectedPlayer.matches_played ? selectedPlayer.rating : "N/C"}</b>
                <small>{selectedPlayer.matches_played ? `${selectedPlayer.rating - 1000 >= 0 ? "+" : ""}${selectedPlayer.rating - 1000} dalla quota iniziale` : "In attesa del debutto"}</small>
              </div>
            </article>

            <div className="player-kpis">
              <article><b>{selectedPlayer.matches_played}</b><small>Partite</small></article>
              <article><b>{selectedPlayer.wins}</b><small>Vittorie</small></article>
              <article><b>{selectedPlayer.losses}</b><small>Sconfitte</small></article>
              <article><b>{selectedPlayer.matches_played ? Math.round((selectedPlayer.wins / selectedPlayer.matches_played) * 100) : 0}%</b><small>Win rate</small></article>
            </div>

            <section className="player-trophies">
              <div className="player-history-head">
                <div><p className="eyebrow dark">BACHECA</p></div>
              </div>

              <div className="bacheca-group-head">
                <div><span>01</span><div><h3>Emblemi</h3></div></div>
              </div>
              {earnedPlayerBadges.length ? <BadgeList badges={earnedPlayerBadges} /> : (
                <div className="player-trophies-empty"><p>Nessun emblema ancora conquistato.</p></div>
              )}

              <FieldRegister profile={selectedPlayer} profiles={profiles} matches={matches} />

              <div className="bacheca-group-head">
                <div><span>02</span><div><p className="eyebrow dark">TORNEI</p><h3>Sala trofei</h3></div></div>
                <small>Prossimamente</small>
              </div>
              <div className="trophy-room-empty">
                <div aria-hidden="true"><BadgeGlyphIcon name="trophy" /></div>
                <span><b>La prima coppa aspetta il suo torneo.</b><small>I trofei compariranno qui, separati dai record statistici.</small></span>
              </div>
            </section>

            <EloChart profile={selectedPlayer} matches={matches} isSelf={isOwnCard} />

            <div className="player-teams">
              <div className="player-history-head">
                <div><p className="eyebrow dark">DOPPI</p><h2>{isOwnCard ? "Le mie squadre" : `Le squadre di ${selectedPlayer.display_name}`}</h2></div>
                <span>{playerTeams.length} {playerTeams.length === 1 ? "squadra" : "squadre"}</span>
              </div>
              {!teamSchemaReady && isOwnCard ? (
                <p className="demo-profile-note">
                  Per dare nome e foto alle squadre esegui la migrazione
                  <code>migration-squadre.sql</code> in Supabase.
                </p>
              ) : playerTeams.length ? (
                <div className="player-teams-list">
                  {playerTeams.map((team) => (
                    isOwnCard && teamSchemaReady ? (
                      <TeamEditor
                        key={team.id}
                        team={team}
                        disabled={!supabase}
                        onSave={(selected, name, file) => saveTeam(selected, name, file)}
                      />
                    ) : (
                      <div key={team.id} className="player-team-row">
                        <TeamAvatars team={team} />
                        <b>{teamLabel(team)}</b>
                        <span>{team.rating} pt · {team.wins}/{team.matches_played} vinte</span>
                      </div>
                    )
                  ))}
                </div>
              ) : (
                <p className="demo-profile-note">
                  Le squadre nascono dalle partite: gioca un doppio e comparirà qui.
                </p>
              )}
            </div>

            <div className="player-history-head">
              <div><p className="eyebrow dark">STORICO PERSONALE</p><h2>{isOwnCard ? "Le mie partite" : `Le partite di ${selectedPlayer.display_name}`}</h2></div>
              <span>{selectedPlayerMatches.length} {selectedPlayerMatches.length === 1 ? "risultato" : "risultati"}</span>
            </div>
            {selectedPlayerMatches.length ? (
              <div className="match-list match-list-full player-match-list">
                {selectedPlayerMatches.map((match) => (
                  <MatchCard
                    key={match.id}
                    match={match}
                    onEdit={(selected) => setEditingMatch(selected)}
                    onPlayVideo={(id) => setPlayingVideo(id)}
                    viewerId={session?.user.id}
                  />
                ))}
              </div>
            ) : (
              <div className="empty-board"><span>00</span><h2>Nessuna partita giocata</h2><p>La scheda si completerà dopo il primo risultato.</p></div>
            )}

            <section className="player-plays">
              <div className="player-history-head">
                <div><p className="eyebrow dark">SPEZZONI</p><h2>{isOwnCard ? "Le mie plays" : `Le plays di ${selectedPlayer.display_name}`}</h2></div>
                {isOwnCard && playsSchemaReady ? (
                  <button className="button button-primary" onClick={() => setShowPlayCreate(true)}>＋ Play</button>
                ) : (
                  <span>{selectedPlayerPlays.length} clip</span>
                )}
              </div>
              {!playsSchemaReady ? (
                <p className="demo-profile-note">
                  Per salvare gli spezzoni esegui la migrazione
                  <code>migration-plays.sql</code> in Supabase.
                </p>
              ) : selectedPlayerPlays.length ? (
                <div className="plays-grid">
                  {selectedPlayerPlays.map((play) => {
                    const clipId = youtubeId(play.video_url);
                    return (
                      <article className="play-card" key={play.id}>
                        <button
                          className="play-card-preview"
                          type="button"
                          onClick={() => setPlayingClip(play)}
                          aria-label={`Guarda ${play.title ?? "la play"}`}
                        >
                          {clipId ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={`https://img.youtube.com/vi/${clipId}/mqdefault.jpg`} alt="" />
                          ) : null}
                          <b aria-hidden="true">▶</b>
                          <em>{play.duration_seconds}s</em>
                        </button>
                        <div className="play-card-body">
                          <b>{play.title ?? "Senza titolo"}</b>
                          <span>dal minuto {formatClock(play.start_seconds)}</span>
                        </div>
                        {isOwnCard ? (
                          <button
                            className="play-card-remove"
                            type="button"
                            onClick={() => void removePlay(play)}
                            aria-label="Elimina la play"
                            title="Elimina la play"
                          >
                            ×
                          </button>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p className="demo-profile-note">
                  {isOwnCard
                    ? "Nessuno spezzone salvato: usa ＋ Play per segnare il minuto di un colpo riuscito."
                    : "Nessuno spezzone salvato."}
                </p>
              )}
            </section>
          </section>
        ) : null}

        {!loading && view === "padel" && padelView === "matches" ? (
          <section className="page-section">
            <PadelSectionNav active="matches" onSelect={setPadelView} />
            <article className="section-hero">
              <BlockMark size="lg" />
              <div className="section-hero-head">
                <div><p className="eyebrow">ARCHIVIO THEBOYZ PADEL</p><h1>Tutte le partite</h1><p>{matches.length} risultati registrati dal gruppo.</p></div>
                <button className="button button-primary cta-new-match" onClick={() => setShowMatch(true)}>+ New Match</button>
              </div>
            </article>
            {matches.length ? (
              <div className="match-list match-list-full">
                {matches.map((match) => (
                  <MatchCard
                    key={match.id}
                    match={match}
                    onEdit={(selected) => setEditingMatch(selected)}
                    onPlayVideo={(id) => setPlayingVideo(id)}
                    viewerId={session?.user.id}
                  />
                ))}
              </div>
            ) : (
              <div className="empty-board"><span>00</span><h2>Ancora nessuna partita</h2><p>Registra il primo risultato per iniziare lo storico.</p></div>
            )}
          </section>
        ) : null}

        {!loading && view === "pizza" ? (
          <><section className="pizza-page">
            <BlockMark size="lg" />
            <div className="pizza-hero">
              <div>
                <p className="eyebrow">CLASSIFICA UFFICIALMENTE NON UFFICIALE</p>
                <h1>Pizzeria<br /><span>Ranking.</span></h1>
                <p>Le pizzerie dei TheBoyz. Chi apre indica i partecipanti e la votazione si chiude quando hanno votato tutti.</p>
              </div>
              <div className="pizza-hero-actions">
                <div className="pizza-stamp">
                  <span>01</span>
                  <b>{(pizzaEntries.find((entry) => !entry.pending)?.name ?? "—").toUpperCase()}</b>
                  <strong>{pizzaEntries.find((entry) => !entry.pending)?.total ?? 0} / 100</strong>
                  <small>CAMPIONE IN CARICA</small>
                </div>
                <div className="pizza-hero-buttons">
                  <button className="button button-primary" onClick={() => {
                    if (!pizzaSchemaReady || !pizzaSessionsReady) {
                      setNotice("Per votare esegui la migrazione migration-pizza-sessioni.sql in Supabase.");
                      return;
                    }
                    setShowSessionPicker(true);
                  }}>
                    ＋ Apri votazione
                  </button>
                </div>
              </div>
            </div>

            {/* Votazioni in corso: restano in cima finché tutti hanno votato. */}
            {openPizzaSessions.length ? (
              <div className="pizza-open-sessions">
                {openPizzaSessions.map((openSession) => {
                  const restaurant = pizzaRestaurants.find((item) => item.id === openSession.restaurant_id);
                  if (!restaurant) return null;
                  const voted = pizzaSessionVotes.some(
                    (vote) => vote.session_id === openSession.id && vote.voter_id === session?.user.id,
                  );
                  const isParticipant = openSession.participants.some(
                    (participant) => participant.voter_id === session?.user.id,
                  );
                  const completed = openSession.participants.filter((participant) => participant.voted_at).length;
                  return (
                    <button
                      className={`pizza-session-card ${voted || !isParticipant ? "is-voted" : ""}`}
                      key={openSession.id}
                      type="button"
                      onClick={() => setVotingSession(openSession)}
                    >
                      <span className="pizza-session-state">{isParticipant ? (voted ? "HAI VOTATO" : "DA VOTARE") : "IN CORSO"}</span>
                      <b>{restaurant.name}</b>
                      <span className="pizza-session-date">
                        {new Intl.DateTimeFormat("it-IT", { dateStyle: "long" }).format(new Date(openSession.opened_at))}
                      </span>
                      <span className="pizza-session-progress">{completed}/{openSession.participants.length} VOTI</span>
                    </button>
                  );
                })}
              </div>
            ) : null}

            <div className="pizza-ranking-toolbar">
              <div>
                <p className="eyebrow">CLASSIFICA</p>
                <h2>{pizzaRankingMode === "classic" ? "Il trio originale" : "Tutto il tavolo"}</h2>
              </div>
              <div className="ranking-switch pizza-ranking-switch" role="group" aria-label="Classifica pizzerie">
                <button
                  className={pizzaRankingMode === "contemporary" ? "active" : ""}
                  onClick={() => setPizzaRankingMode("contemporary")}
                >
                  Contemporanea
                </button>
                <button
                  className={pizzaRankingMode === "classic" ? "active" : ""}
                  onClick={() => setPizzaRankingMode("classic")}
                >
                  Nostalgica
                </button>
              </div>
            </div>

            <div aria-label={`Podio pizzerie · classifica ${pizzaRankingMode === "classic" ? "nostalgica" : "contemporanea"}`}>
              <Podium
                steps={pizzaEntries
                  .filter((restaurant) => !restaurant.pending)
                  .slice(0, 3)
                  .map((restaurant, index) => ({
                    rank: index + 1,
                    entries: [{
                      key: restaurant.id ?? restaurant.name,
                      avatar: (
                        <span className="podium-emblem">
                          {index === 0 ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src="https://cdn-icons-gif.flaticon.com/19016/19016244.gif" alt="" />
                          ) : (
                            <em>{restaurant.total}</em>
                          )}
                        </span>
                      ),
                      name: restaurant.name,
                      detail: `${restaurant.total}/100${restaurant.place ? ` · ${restaurant.place}` : ""}`,
                    }],
                  }))}
              />
            </div>

            <section className="pizza-method">
              <div className="pizza-method-copy">
                <p className="eyebrow dark">COME FUNZIONA</p>
                <h2>Ogni punto conta.</h2>
                <p>I voti ordinari valgono 93 punti. Con Fabio si aggiungono i suoi 7 punti; senza Fabio i 93 vengono riportati a 100.</p>
              </div>
              <div className="pizza-criteria">
                {pizzaCriteria.map((criterion) => (
                  <div className={`pizza-criterion criterion-${criterion.tone}`} key={criterion.label}>
                    <span>{criterion.label}</span>
                    <b>{criterion.max}</b>
                    <small>{criterion.source}</small>
                  </div>
                ))}
              </div>
            </section>

            <div className="pizza-board">
              <div className="pizza-board-head">
                <span>#</span>
                <span>PIZZERIA</span>
                <span>LOCATION</span>
                <span>PIZZA</span>
                <span>DOLCE</span>
                <span>PREZZO</span>
                <span>TOTALE</span>
              </div>
              <div className="pizza-ranking-list">
                {pizzaEntries.map((restaurant, index) => {
                  const complete = !restaurant.pending;
                  const rowClass = `pizza-ranking-row ${index < 3 && complete ? "pizza-ranking-top" : ""} ${restaurant.isNew ? "pizza-ranking-interactive" : ""} ${restaurant.pending ? "pizza-ranking-pending" : ""}`;
                  const rowContent = (<>
                    <span className="pizza-position">{index + 1}</span>
                    <div className="pizza-name-cell">
                      <b>{restaurant.name}</b>
                      <small>{restaurant.isNew ? `${restaurant.place ?? "NUOVA SCHEDA"} · ${restaurant.votesCount ?? 0} ${restaurant.votesCount === 1 ? "VOTO" : "VOTI"}` : restaurant.address ? <a className="pizza-address-link" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(restaurant.address)}`} target="_blank" rel="noopener noreferrer">{restaurant.address}</a> : (restaurant.place ?? "THEBOYZ TESTED")}</small>
                      <span className="pizza-score-track" aria-hidden="true">
                        <i style={{ width: `${complete ? restaurant.total : 0}%` }} />
                      </span>
                    </div>
                    <span className="pizza-category-score"><b>{complete ? restaurant.location.toFixed(1) : "—"}</b><small>/10</small></span>
                    <span className="pizza-category-score"><b>{complete ? restaurant.pizza.toFixed(1) : "—"}</b><small>/10</small></span>
                    <span className="pizza-category-score"><b>{complete ? restaurant.dessert.toFixed(1) : "—"}</b><small>/10</small></span>
                    <span className="pizza-category-score"><b>{complete ? restaurant.price.toFixed(1) : "—"}</b><small>/10</small></span>
                    <span className="pizza-total-score"><b>{complete ? restaurant.total : "N/C"}</b><small>{complete ? "/100" : ""}</small></span>
                  </>);
                  return restaurant.isNew && restaurant.id ? (
                    <button
                      type="button"
                      className={rowClass}
                      key={`${restaurant.name}-${index}`}
                      onClick={() => showPizzaSession(restaurant.id!)}
                      aria-label={`Vedi la votazione di ${restaurant.name}`}
                    >
                      {rowContent}
                    </button>
                  ) : <article className={rowClass} key={`${restaurant.name}-${index}`}>{rowContent}</article>;
                })}
              </div>
            </div>
            <p className="pizza-source-note">
              {pizzaRankingMode === "classic"
                ? "Classifica calcolata soltanto con i voti di Samu, Dani e Fabio nelle sessioni in cui erano presenti tutti e tre."
                : "Classifica calcolata con tutti i partecipanti presenti alla votazione."}
              {" "}Il punteggio finale viene arrotondato all&apos;intero più vicino: da 0,5 si arrotonda per eccesso.
            </p>
          </section></>
        ) : null}

      </main>

      <nav
        className="mobile-nav"
        aria-label="Navigazione mobile"
        ref={navRef}
        onPointerDown={(event) => {
          navPointerStart.current = event.clientX;
          navDragging.current = false;
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (navPointerStart.current === null) return;
          // Finche il dito non si muove davvero la pastiglia resta dov'e:
          // se la portassimo subito sotto al tocco, un tocco secco su una
          // voce lontana le lascerebbe da percorrere solo pochi pixel e
          // lo scorrimento non si vedrebbe.
          if (!navDragging.current && Math.abs(event.clientX - navPointerStart.current) < 8) return;
          navDragging.current = true;
          movePillTo(event.clientX);
        }}
        onPointerUp={(event) => {
          if (navPointerStart.current === null) return;
          const index = nearestNavIndex(navDragging.current ? event.clientX : navPointerStart.current);
          navPointerStart.current = null;
          navDragging.current = false;
          placePill(index, true);
          selectNavItem(index);
        }}
        onPointerCancel={() => {
          navPointerStart.current = null;
          navDragging.current = false;
          placePill(navActiveIndex, true);
        }}
      >
        {/* Pastiglia unica che scivola: prima ogni voce aveva la sua e il
            passaggio era una dissolvenza, non uno spostamento. */}
        <span className="mobile-nav-pill" ref={navPillRef} aria-hidden="true" />
        {navItems.map((item, index) => (
          <button
            key={item.key}
            ref={(element) => { navButtonsRef.current[index] = element; }}
            className={item.active ? "active" : ""}
            onClick={() => selectNavItem(index)}
          >
            <span className="mobile-nav-icon">
              {item.key === "profile"
                ? <Avatar profile={currentUser} size="sm" />
                : <NavGlyph name={item.glyph as GlyphName} />}
              {/* Pallino sulle votazioni pizza ancora da fare. */}
              {item.key === "pizza" && pendingPizzaVotes.length ? (
                <b className="nav-dot" aria-label={`${pendingPizzaVotes.length} votazioni da fare`}>
                  {pendingPizzaVotes.length}
                </b>
              ) : null}
            </span>
            <span className="mobile-nav-label">{item.label}</span>
          </button>
        ))}
      </nav>

      {showMatch || editingMatch ? (
        <NewMatchModal
          profiles={profiles}
          match={editingMatch}
          onClose={() => { setShowMatch(false); setEditingMatch(null); }}
          onSaved={() => void handleSaved()}
        />
      ) : null}
      {showAvatarPicker ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setShowAvatarPicker(false)}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="avatar-picker-title">
            <div className="modal-head">
              <div>
                <p className="eyebrow dark">FOTO PROFILO</p>
                <h2 id="avatar-picker-title">Cambia la tua foto</h2>
              </div>
              <button className="icon-button" onClick={() => setShowAvatarPicker(false)} aria-label="Chiudi">×</button>
            </div>

            <form
              className="avatar-picker"
              onSubmit={(event) => { event.preventDefault(); void saveAvatarUrl(); }}
            >
              <div className="avatar-picker-preview">
                <Avatar profile={currentUser} size="lg" />
              </div>

              {/* Il selettore file resta nascosto: dentro un form una <label>
                  eredita gli stili dei campi e il tasto si sformerebbe. */}
              <input
                className="avatar-picker-file"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                ref={avatarFileRef}
                onChange={(e) => { void uploadAvatar(e.target.files?.[0]); setShowAvatarPicker(false); }}
              />
              <button
                type="button"
                className="button button-dark avatar-picker-upload"
                onClick={() => avatarFileRef.current?.click()}
              >
                Carica dal dispositivo
              </button>

              <p className="avatar-picker-divider"><span>oppure</span></p>

              <label>
                Indirizzo di un&apos;immagine sul web <span className="optional-label">anche GIF animate</span>
                <input
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  placeholder="https://…/animazione.gif"
                  inputMode="url"
                />
              </label>
              <p className="field-hint">
                Deve essere il collegamento diretto all&apos;immagine, quello che finisce in .gif, .png o .jpg —
                non la pagina che la contiene. Su Giphy o Tenor si ottiene con &quot;copia indirizzo immagine&quot;.
              </p>

              <div className="modal-actions">
                {avatarUrlInitial ? (
                  <button
                    type="button"
                    className="signout-button"
                    onClick={() => { setAvatarUrl(""); void saveAvatarUrl(); }}
                  >
                    Togli l&apos;immagine dal web
                  </button>
                ) : null}
                <button type="button" className="button button-ghost" onClick={() => setShowAvatarPicker(false)}>Annulla</button>
                <button className="button button-primary">Usa questo indirizzo</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
      {showProfileEdit ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setShowProfileEdit(false)}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="profile-edit-title">
            <div className="modal-head">
              <div>
                <p className="eyebrow dark">IL TUO PROFILO</p>
                <h2 id="profile-edit-title">Dati del profilo</h2>
              </div>
              <button className="icon-button" onClick={() => setShowProfileEdit(false)} aria-label="Chiudi">×</button>
            </div>
            <form onSubmit={(event) => { void updateProfile(event); setShowProfileEdit(false); }}>
              <label>Nome in classifica<input value={profileName || currentUser.display_name} onChange={(e) => setProfileName(e.target.value)} disabled={!supabase} /></label>
              <label>
                Mano della racchetta
                <select value={handedness} onChange={(e) => setHandedness(e.target.value)} disabled={!supabase}>
                  <option value="">Non indicata</option>
                  <option value="destro">Destro</option>
                  <option value="mancino">Mancino</option>
                </select>
              </label>
              <label>
                Lato del campo
                <select value={courtSide} onChange={(e) => setCourtSide(e.target.value)} disabled={!supabase}>
                  <option value="">Non indicato</option>
                  <option value="destra">Destra</option>
                  <option value="sinistra">Sinistra</option>
                </select>
              </label>
              <label>Email<input value={session?.user.email ?? ""} disabled /></label>
              {supabase ? null : <p className="demo-profile-note">Il profilo diventa modificabile dopo il collegamento a Supabase.</p>}
              <div className="modal-actions">
                {supabase ? (
                  <button type="button" className="signout-button" onClick={() => void supabase?.auth.signOut()}>Esci dal club</button>
                ) : null}
                <button type="button" className="button button-ghost" onClick={() => setShowProfileEdit(false)}>Annulla</button>
                <button className="button button-primary" disabled={!supabase}>Salva modifiche</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
      {playingVideo ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setPlayingVideo(null)}>
          <section className="modal video-modal" role="dialog" aria-modal="true" aria-label="Video della partita">
            <div className="modal-head">
              <div><p className="eyebrow dark">VIDEO PARTITA</p></div>
              <button className="icon-button" onClick={() => setPlayingVideo(null)} aria-label="Chiudi">×</button>
            </div>
            <div className="video-frame">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${playingVideo}?autoplay=1`}
                title="Video della partita"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </section>
        </div>
      ) : null}
      {playingClip ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setPlayingClip(null)}>
          <section className="modal video-modal" role="dialog" aria-modal="true" aria-label="Spezzone">
            <div className="modal-head">
              <div>
                <p className="eyebrow dark">PLAY</p>
                <h2>{playingClip.title ?? "Spezzone"}</h2>
              </div>
              <button className="icon-button" onClick={() => setPlayingClip(null)} aria-label="Chiudi">×</button>
            </div>
            <div className="video-frame">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${youtubeId(playingClip.video_url)}?start=${playingClip.start_seconds}&end=${playingClip.start_seconds + playingClip.duration_seconds}&autoplay=1`}
                title="Spezzone"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
            <p className="field-hint">
              Da {formatClock(playingClip.start_seconds)} a {formatClock(playingClip.start_seconds + playingClip.duration_seconds)}
            </p>
          </section>
        </div>
      ) : null}
      {showPlayCreate && currentUser ? (
        <PlayCreateModal
          profileId={currentUser.id}
          matches={selectedPlayerMatches}
          onClose={() => setShowPlayCreate(false)}
          onSaved={async () => {
            setShowPlayCreate(false);
            await loadData();
            setNotice("Play salvata.");
          }}
        />
      ) : null}
      {showSessionPicker && session ? (
        <PizzaSessionCreateModal
          profiles={profiles}
          viewerId={session.user.id}
          onClose={() => setShowSessionPicker(false)}
          onSaved={async () => {
            setShowSessionPicker(false);
            await loadData();
            setNotice("Votazione aperta. Si chiuderà quando tutti i partecipanti avranno votato.");
          }}
        />
      ) : null}
      {votingSession && session ? (() => {
        const restaurant = pizzaRestaurants.find((item) => item.id === votingSession.restaurant_id);
        if (!restaurant) return null;
        return (
          <PizzaVoteModal
            restaurant={restaurant}
            session={votingSession}
            votes={pizzaSessionVotes.filter((vote) => vote.session_id === votingSession.id)}
            voters={profiles}
            viewerId={session.user.id}
            onClose={() => setVotingSession(null)}
            onSaved={async () => {
              setVotingSession(null);
              await loadData();
              setNotice("Voto salvato. La votazione si chiuderà quando avranno votato tutti.");
            }}
          />
        );
      })() : null}
    </div>
  );
}

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(Boolean(supabase));

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecking(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setChecking(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (checking) {
    return <LoadingScreen />;
  }
  if (!hasSupabaseConfig) {
    return <SetupScreen />;
  }
  if (!session) {
    return <LoginScreen />;
  }
  return <AppShell session={session} />;
}
