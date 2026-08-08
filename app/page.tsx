"use client";

import Image from "next/image";
import { FormEvent, ReactNode, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  hasSupabaseConfig,
  type MatchEvent,
  type PadelMatch,
  type PadelSet,
  type PlayerPlay,
  type Profile,
  type Tournament,
  type TournamentTeam,
  supabase,
} from "@/lib/supabase";

type View = "padel" | "pizza";
type PadelView = "overview" | "ranking" | "matches" | "tournaments" | "player";
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
const pizzaMedalTones = ["gold", "silver", "bronze"] as const;

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

// I campi dove giochiamo, in provincia di Imperia. Scritti "CLUB - PAESE"
// perche il nome finisce dentro alla card della partita, dove lo spazio e
// quello che e. L'ordine e quello di quanto ci andiamo, non alfabetico.
//
// A San Bartolomeo al Mare non risulta nessun campo da padel: se ne apre uno,
// va aggiunto qui. La casella resta comunque libera, quindi un posto fuori
// elenco si puo sempre scrivere a mano.
const PADEL_COURTS = [
  "DON QUIQUE - IMPERIA",
  "QUPOLA - PONTEDASSIO",
  "ONEGLIA PADEL - CASTELVECCHIO",
  "CORCUERA - IMPERIA",
  "RIVIERA PADEL - SAN LORENZO",
  "DIANO PADEL - DIANO MARINA",
];

// Un set finito ha un vincitore: sei giochi con due di scarto, oppure il 7-6
// del tie-break. Tutto il resto — 2-1, 4-4, 5-3 — e un set lasciato a meta
// perche il campo e scaduto. Serve a distinguere il terzo set interrotto,
// che non assegna un set vinto ma i cui giochi contano lo stesso.
function setIsComplete(team1Games: number, team2Games: number) {
  const high = Math.max(team1Games, team2Games);
  const low = Math.min(team1Games, team2Games);
  return (high >= 6 && high - low >= 2) || (high === 7 && low === 6);
}

// In lettura ci si fida solo del flag salvato: le partite registrate prima
// della migrazione hanno tutti i set completi per costruzione, e ricalcolare
// la regola su quei dati vecchi rischierebbe di riscrivere risultati chiusi.
function setIsIncomplete(set: PadelSet) {
  return set.incomplete === true;
}

function matchIsDraw(match: PadelMatch) {
  return match.winner_team === 0;
}

// Il pareggio vale mezza vittoria: contarlo come sconfitta punirebbe chi non
// ha perso, tenerlo fuori dal totale premierebbe chi non ha vinto.
//
// Prende tre numeri e non il profilo intero di proposito: passare l'oggetto
// fa credere al compilatore di React che la funzione possa modificarlo, e i
// memo che lo usano smettono di essere ottimizzati.
function padelWinRate(wins: number, draws: number, matchesPlayed: number) {
  if (!matchesPlayed) return 0;
  return Math.round(((wins + draws * 0.5) / matchesPlayed) * 100);
}

// I set che assegnano un punto: quello interrotto non conta, ne per chi lo
// stava conducendo ne per l'altro.
function decidedSets(sets: PadelSet[]) {
  return sets.filter((set) => !setIsIncomplete(set));
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
  draws: number;
  current_streak: number;
  name?: string | null;
  imageUrl?: string | null;
  // Una coppia entra in classifica solo quando uno dei due le ha dato un
  // nome dal proprio profilo, in "le mie squadre". Finche resta senza nome
  // esiste comunque — le partite le ha giocate — ma vive solo nella scheda
  // dei due giocatori, dove la si puo battezzare.
  isRanked: boolean;
};

// Le coppie da mettere in classifica: quelle battezzate. Le altre restano
// nella scheda del giocatore, che e il posto da cui si danno i nomi.
function rankedPadelTeams(teams: PadelTeam[]) {
  return teams.filter((team) => team.isRanked);
}

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
      // Il pareggio non e una sconfitta e non spezza la serie: la mette in
      // pausa, come per i singoli giocatori.
      const drawn = matchIsDraw(match);
      const won = !drawn && match.winner_team === side;
      const team = teams.get(key);

      if (team) {
        team.matches_played += 1;
        team.wins += won ? 1 : 0;
        team.losses += drawn || won ? 0 : 1;
        team.draws += drawn ? 1 : 0;
        team.current_streak = drawn
          ? team.current_streak
          : won
            ? Math.max(1, team.current_streak + 1)
            : Math.min(-1, team.current_streak - 1);
      } else {
        const players = ids.map((id) => byId.get(id)).filter(Boolean) as Profile[];
        const record = meta.get(key);
        teams.set(key, {
          id: key,
          players,
          // Segnaposto: la media si calcola dopo il giro sulle partite, cosi
          // non dipende da quando la coppia e stata incontrata la prima volta.
          rating: 0,
          matches_played: 1,
          wins: won ? 1 : 0,
          losses: drawn || won ? 0 : 1,
          draws: drawn ? 1 : 0,
          current_streak: drawn ? 0 : won ? 1 : -1,
          name: record?.name ?? null,
          imageUrl: record?.image_url ?? null,
          isRanked: Boolean(record?.name?.trim()),
        });
      }
    });
  });

  // La forza di una coppia e sempre la media dei punteggi dei due componenti
  // nel momento in cui la si guarda: la calcoliamo qui, sui profili appena
  // ricevuti, e non dentro il giro sulle partite. Cosi la classifica squadre
  // segue l'Elo dei singoli invece di restare ferma alla prima partita.
  return [...teams.values()]
    .filter((team) => team.players.length === 2)
    .map((team) => ({
      ...team,
      rating: Math.round(
        team.players.reduce((sum, profile) => sum + profile.rating, 0) / team.players.length,
      ),
    }))
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

type GlyphName = "home" | "ranking" | "racket" | "rackets" | "person" | "people" | "pizza";

// La racchetta singola, riusata anche per la coppia.
const RACKET_HEAD = "M9.6 16.2C7 15 5.3 12.4 5.3 9.4 5.3 5.7 8.3 2.7 12 2.7s6.7 3 6.7 6.7c0 3-1.7 5.6-4.3 6.8Z";
const RACKET_GRIP = "M10.4 16.2v3.1a1.6 1.6 0 0 0 3.2 0v-3.1";

// Busto: testa e spalle chiuse in basso, non un arco aperto.
const PERSON_HEAD = "M12 3.6a3.9 3.9 0 1 1 0 7.8 3.9 3.9 0 0 1 0-7.8Z";
const PERSON_BODY = "M4.9 20.4c0-3.7 3.2-6.5 7.1-6.5s7.1 2.8 7.1 6.5Z";

// Glifi in stile SF Symbols: tratto uniforme, estremi arrotondati, nessun
// riempimento. Ereditano currentColor, così seguono lo stato della barra.
function NavGlyph({ name }: { name: GlyphName }) {
  // La maschera del doppio ha bisogno di un identificatore unico: la stessa
  // icona compare in più punti della pagina.
  const maskId = useId();
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
          <path d={RACKET_HEAD} />
          {/* Manico aperto in alto: il tratto orizzontale sarebbe doppiato
              sul bordo inferiore del piatto. */}
          <path d={RACKET_GRIP} />
          <g fill="currentColor" stroke="none">
            <circle cx="12" cy="7.4" r="0.95" />
            <circle cx="9.3" cy="10.3" r="0.95" />
            <circle cx="14.7" cy="10.3" r="0.95" />
            <circle cx="12" cy="12.8" r="0.95" />
          </g>
        </>
      ) : null}
      {/* La coppia: due racchette identiche a quella singola, una davanti e
          una dietro. Quella davanti ritaglia l'altra invece di sovrapporsi e
          basta, così i tratti non si incrociano mai e in trasparenza non si
          formano zone più scure. */}
      {name === "rackets" ? (
        <>
          <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
            <rect x="0" y="0" width="24" height="24" fill="white" />
            {/* Il nero toglie. È la sagoma della racchetta davanti, piena e
                ripassata con un tratto largo: il pieno la rende opaca, il
                tratto lascia il filo di stacco lungo tutto il perimetro. */}
            <g
              transform="translate(4.9 4.1) scale(0.74)"
              fill="black"
              stroke="black"
              strokeWidth="3.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d={RACKET_HEAD} />
              <path d={RACKET_GRIP} />
            </g>
          </mask>
          {/* Dietro: nessun foro, è solo una sagoma di riferimento. */}
          <g mask={`url(#${maskId})`} transform="translate(1.3 1.7) scale(0.74)">
            <path d={RACKET_HEAD} />
            <path d={RACKET_GRIP} />
          </g>
          {/* Davanti: completa di fori, come la racchetta singola. */}
          <g transform="translate(4.9 4.1) scale(0.74)">
            <path d={RACKET_HEAD} />
            <path d={RACKET_GRIP} />
            <g fill="currentColor" stroke="none">
              <circle cx="12" cy="7.4" r="0.95" />
              <circle cx="9.3" cy="10.3" r="0.95" />
              <circle cx="14.7" cy="10.3" r="0.95" />
              <circle cx="12" cy="12.8" r="0.95" />
            </g>
          </g>
        </>
      ) : null}
      {/* Un busto: il singolo. */}
      {name === "person" ? (
        <>
          <path d={PERSON_HEAD} />
          <path d={PERSON_BODY} />
        </>
      ) : null}
      {/* Due busti affiancati: la coppia. Niente sovrapposizioni e niente
          maschere — a questa dimensione un busto che ne taglia un altro
          diventa illeggibile, e la maschera storpiava la forma chiusa. */}
      {name === "people" ? (
        <>
          <circle cx="6.8" cy="8.8" r="2.9" />
          <path d="M2.2 20.4c0-2.5 2.1-4.6 4.6-4.6s4.6 2.1 4.6 4.6Z" />
          <circle cx="17.2" cy="8.8" r="2.9" />
          <path d="M12.6 20.4c0-2.5 2.1-4.6 4.6-4.6s4.6 2.1 4.6 4.6Z" />
        </>
      ) : null}
    </svg>
  );
}

// Schermata di attesa: fondo blu sfumato e logo al centro. La usano sia
// l'avvio dell'app sia il caricamento dei dati, cosi il passaggio da una
// all'altra non si vede.
function LoadingScreen() {
  // Il velo di attesa e fissato al viewport, ma sotto resta la pagina: su
  // mobile il body tiene 88px di spazio per la barra inferiore e html e
  // chiaro, quindi in fondo si vedeva una striscia bianca finche i dati non
  // arrivavano. Mentre la schermata e a video vestiamo di scuro anche la
  // pagina, riusando l'interruttore che la home usa gia.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("theme-dark");
    return () => root.classList.remove("theme-dark");
  }, []);

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
    const drawn = matchIsDraw(match);
    const losingGoat = !drawn && match.players.some(
      (player) => goatsBefore.has(player.profile_id) && player.team !== match.winner_team,
    );

    match.players.forEach((player) => {
      const item = metrics.get(player.profile_id);
      if (!item) return;
      const won = !drawn && player.team === match.winner_team;
      // Le serie di vittorie e di sconfitte restano com'erano: un pareggio
      // non le allunga e non le azzera, esattamente come nel database.
      const winRun = drawn
        ? currentWinRuns.get(player.profile_id) ?? 0
        : won ? (currentWinRuns.get(player.profile_id) ?? 0) + 1 : 0;
      const loseRun = drawn
        ? currentLoseRuns.get(player.profile_id) ?? 0
        : won ? 0 : (currentLoseRuns.get(player.profile_id) ?? 0) + 1;
      currentWinRuns.set(player.profile_id, winRun);
      currentLoseRuns.set(player.profile_id, loseRun);
      item.bestWinStreak = Math.max(item.bestWinStreak, winRun);
      item.bestLoseStreak = Math.max(item.bestLoseStreak, loseRun);
      item.matchesPlayed += 1;
      if (won && losingGoat) item.winsAgainstGoat += 1;

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
    // Mezzo punto per il pareggio: e il modo piu onesto di tenerlo dentro a
    // una percentuale di vittorie senza farlo pesare come una sconfitta.
    pair.wins += matchIsDraw(match) ? 0.5 : match.winner_team === side ? 1 : 0;
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

// Gli emblemi rifatti sono disegnati qui e non caricati da public/SVG come
// immagini. Dentro a un <img> un SVG e un documento chiuso in se stesso: non
// vede i caratteri della pagina — il "#1" ricadeva su un font di sistema — e
// le sue animazioni su iOS non partono. Inlineato, il colore lo scrive il
// CSS di globals.css come per ogni altra cosa, il filo di luce si muove
// davvero, e il numero resta testo, quindi si cambia senza ridisegnare
// niente. Quelli non ancora rifatti continuano a pescare il webp.
type EmblemName = "goat" | "kraken" | "trophy";

const EMBLEM_COMPONENT: Partial<Record<BadgeGlyph, EmblemName>> = {
  goat: "goat",
  "goat-slayer": "kraken",
  trophy: "trophy",
};

// Il contorno esterno e quello interno sono gli stessi per tutti: cambia
// solo il disegno in mezzo.
const EMBLEM_HEX_INNER = "64 12.64 114.59 35.56 100 96.24 64 115.02 28 96.24 13.41 35.56";
const EMBLEM_HEX_OUTER = "64 0 0 29 18.03 104.03 64 128 109.97 104.03 128 29";
const EMBLEM_FRAME =
  "M64,12.64l50.59,22.92-14.58,60.68-36,18.78-36-18.78-14.58-60.68L64,12.64h0ZM64,0L0,29l18.03,75.03,45.97,23.97,45.97-23.97,18.03-75.03L64,0h0Z";

function Emblem({ name, rank = "#1", className }: { name: EmblemName; rank?: string; className?: string }) {
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
        {name === "goat" ? (
          <>
            <polygon points="27.52 66.61 22.31 66.61 27.52 71.82 27.52 66.61" />
            <polygon points="100.48 71.82 105.69 66.61 100.48 66.61 100.48 71.82" />
            <polygon points="84.85 35.33 74.42 35.33 64 45.76 53.58 35.33 43.15 35.33 22.31 56.18 22.31 66.61 43.15 45.76 48.36 45.76 53.58 50.97 48.36 56.18 48.36 50.97 43.15 56.18 48.36 61.39 53.58 61.39 58.79 66.61 58.79 71.82 53.58 66.61 53.58 77.03 58.79 82.24 58.79 87.45 64 92.67 69.21 87.45 69.21 82.24 74.42 77.03 74.42 66.61 69.21 71.82 69.21 66.61 74.42 61.39 79.64 61.39 84.85 56.18 79.64 50.97 79.64 56.18 74.42 50.97 79.64 45.76 84.85 45.76 105.69 66.61 105.69 56.18 84.85 35.33" />
          </>
        ) : null}
        {name === "kraken" ? (
          <polygon points="97.43 50.63 84.06 50.63 77.37 50.63 70.69 57.32 77.37 57.32 90.74 64 97.43 70.69 97.43 84.06 90.74 90.75 84.06 90.75 77.37 84.06 77.37 77.38 84.06 77.38 77.37 84.06 90.74 84.06 90.74 77.37 84.06 70.69 70.69 70.69 57.31 84.06 57.31 90.75 64 97.43 70.69 90.75 70.69 84.06 64 90.75 64 84.06 70.69 84.06 77.37 90.75 70.69 97.43 64 104.12 57.31 97.43 50.63 90.75 50.63 77.38 57.31 64 43.94 70.69 37.26 77.37 37.26 90.75 43.94 84.06 43.94 90.75 37.26 90.75 30.57 84.06 30.57 70.69 37.26 64 50.63 57.32 57.31 57.32 50.63 50.63 30.57 50.64 37.26 57.32 37.26 57.32 30.57 57.32 30.57 50.64 37.26 43.95 43.94 43.95 50.63 50.63 43.94 30.57 64 23.88 84.06 30.57 77.37 50.63 84.06 43.95 90.74 43.95 97.43 50.63 97.43 57.32 90.74 57.32 90.74 57.32 97.43 50.63" />
        ) : null}
        {name === "trophy" ? (
          <path d="M86.25,45.87l.82-19.24-23.08,11.55-23.08-11.56.82,19.26h-20.19l4,23.08,30.74,15.39-15.36,5.7,1,7.38,22.08,11,22.07-11,1-7.38-15.36-5.7,30.76-15.39,4-23.08h-20.21ZM30.05,66.27l-2-16.18h13.86l.96,22.6-12.82-6.42ZM85.11,72.69l.96-22.6h13.86l-2,16.18-12.82,6.42Z" />
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
      {badges.map((badge) => {
        const emblem = EMBLEM_COMPONENT[badge.glyph];
        return (
        <article
          className={`badge badge-${badge.tone} ${badge.unlocked ? "is-unlocked" : "is-locked"}`}
          key={badge.id}
          tabIndex={0}
          aria-label={`${badge.label}. ${badge.meaning} ${badge.progressLabel}`}
        >
          <div className="badge-emblem" aria-hidden="true">
            {emblem ? (
              <Emblem name={emblem} className="badge-art" />
            ) : (
              <Image className="badge-art" src={`${basePath}/emblems/${badge.glyph}.webp`} alt="" width={128} height={168} />
            )}
          </div>
          <aside className="badge-tooltip" role="tooltip">
            <strong>{badge.label}</strong>
            <p>{badge.meaning}</p>
            <span>{badge.criterion}</span>
            <small>{badge.value} · {badge.progressLabel}</small>
          </aside>
        </article>
        );
      })}
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

// Secondi → mm:ss, per mostrare il tempo di uno spezzone. Il verso opposto
// non serve piu: il minuto si scrive in due caselle separate, quindi non c'e
// piu niente da interpretare.
function formatClock(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// Un raccoglitore che si apre e si chiude. L'altezza si anima a mano perché
// da "0" a "auto" il browser non sa interpolare: si misura il contenuto, si
// va da una misura all'altra, e appena arrivati si torna ad "auto" — se
// restasse un numero fisso, un elenco che cambia resterebbe tagliato.
function MonthGroup({
  label,
  count,
  open,
  onToggle,
  children,
}: {
  label: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const mounted = useRef(false);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    // Al primo disegno nessuna animazione: il foglio si apre già con tutti i
    // raccoglitori chiusi, e vederli richiudersi sarebbe un movimento di
    // troppo.
    if (!mounted.current) {
      mounted.current = true;
      body.style.height = open ? "auto" : "0px";
      return;
    }
    const from = body.getBoundingClientRect().height;
    const to = open ? body.scrollHeight : 0;
    body.style.height = `${to}px`;
    if (!body.animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      if (open) body.style.height = "auto";
      return;
    }
    const animation = body.animate(
      [
        { height: `${from}px`, opacity: open ? 0.4 : 1 },
        { height: `${to}px`, opacity: open ? 1 : 0.4 },
      ],
      {
        // Aperture più lente delle chiusure: entrando c'è qualcosa da
        // guardare arrivare, uscendo si toglie di mezzo e basta. È il passo
        // dei pannelli di sistema.
        duration: open ? 420 : 280,
        easing: open ? "cubic-bezier(0.32, 0.9, 0.28, 1)" : "cubic-bezier(0.4, 0, 0.9, 0.35)",
      },
    );
    animation.finished.then(
      () => { if (open) body.style.height = "auto"; },
      () => {},
    );
  }, [open]);

  return (
    <div className={`month-group${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="month-head"
        onClick={onToggle}
        aria-expanded={open}
      >
        <b>{label}</b>
        <span className="month-count">{count}</span>
        <i className="month-chevron" aria-hidden="true" />
      </button>
      <div className="month-body" ref={bodyRef}>
        <div className="month-body-inner">{children}</div>
      </div>
    </div>
  );
}

// Vero sotto i 780px, cioè dove vale l'impaginazione mobile. Serve nei punti
// in cui telefono e computer non si distinguono solo per stile ma per
// comportamento, e il CSS da solo non basta: in home la card delle partite è
// un bersaglio unico che apre il foglio sul telefono, mentre su computer ogni
// partita continua ad aprirsi in modifica.
// Parte da false e si corregge al primo effetto: durante la generazione
// statica non esiste una finestra da misurare, e la home vera compare
// comunque solo dopo che i dati sono arrivati, quindi nessuno vede lo scarto.
function useIsPhone() {
  const [isPhone, setIsPhone] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 780px)");
    const sync = () => setIsPhone(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  return isPhone;
}

// La pastiglia della barra viene spostata scrivendo `transform` direttamente
// sullo stile, quindi la traslazione non deve essere animata dal CSS: se lo
// fosse, ogni riposizionamento verrebbe animato due volte. Resta accesa solo
// su `scale`, che e la proprieta con cui il CSS la schiaccia mentre il dito
// preme: le due cose si sommano invece di sostituirsi, e cosi la pressione si
// vede senza che il gesto perda il controllo della posizione.
const NAV_PILL_TRANSITION = "scale 140ms cubic-bezier(0.34, 1.56, 0.64, 1)";

// Su mobile la pagina non scorre da sola: scorre il contenuto, dentro a un
// contenitore alto quanto lo schermo. Serve perche il rimbalzo elastico
// avvenga li dentro invece che su tutta la pagina — quando rimbalza la
// pagina, iOS trascina anche gli elementi fissi, e la barra in basso si
// staccava dal fondo a ogni estremo.
// Chi deve leggere o spostare lo scorrimento deve percio chiedere a lui e non
// alla finestra. Su desktop il contenitore non scorre e si torna alla
// finestra: lo si riconosce dall'overflow calcolato, non da un breakpoint
// ripetuto anche qui.
function pageScroller(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const content = document.querySelector<HTMLElement>("main.content");
  if (!content) return null;
  const overflow = getComputedStyle(content).overflowY;
  return overflow === "auto" || overflow === "scroll" ? content : null;
}

function scrollPageTo(top: number, behavior: ScrollBehavior) {
  (pageScroller() ?? window).scrollTo({ top, behavior });
}

function scrollPageBy(top: number) {
  (pageScroller() ?? window).scrollBy({ top, behavior: "instant" as ScrollBehavior });
}

// Le facce dei due caroselli della home, nell'ordine in cui si incontrano
// scorrendo verso sinistra — lo stesso ordine dei pallini sotto la card.
// Stanno fuori dal componente perche sono liste fisse: dentro verrebbero
// ricostruite a ogni render e farebbero ripartire gli effetti del carosello.
const RANKING_FACES = ["single", "team"] as const;
const MATCHES_FACES = ["mine", "all"] as const;
// Il tasto in cima alla home e anche lui un carosello: a sinistra la partita,
// a destra il torneo.
const CTA_FACES = ["match", "tournament"] as const;

// Una card che ha piu facce e le mostra a turno: si cambia con lo swipe o da
// sola ogni cinque secondi, e la faccia che esce da un lato lascia entrare
// dall'altro quella nuova. La usano la classifica (singolo, squadra) e le
// partite (le proprie, tutte): erano lo stesso meccanismo scritto due
// volte, e la seconda volta sarebbe stata una copia da tenere allineata a
// mano.
//
// Perche i gestori del tocco stanno su listener nativi e non sugli attributi
// onTouch di React: React registra touchmove come passivo, e li dentro
// preventDefault non ha alcun effetto. Senza preventDefault non c'e modo di
// impedire alla pagina di scorrere su e giu mentre si scorre di lato.
function useCardCarousel<T extends string>({
  faces,
  face,
  onChange,
  enabled,
  enteringClass,
}: {
  faces: readonly T[];
  face: T;
  onChange: (next: T) => void;
  // Il cambio automatico gira solo dove ha senso guardarlo: in home, senza
  // fogli aperti. Fuori di li il timer non parte nemmeno.
  enabled: boolean;
  // Classe appesa al nastro finche la faccia nuova sta entrando, per le
  // animazioni che devono aspettare che sia arrivata.
  enteringClass?: string;
}) {
  // Il nodo della card sta in uno stato e non in un ref, perche serve a
  // riagganciare i listener. Cambiando sezione dalla barra la card viene
  // smontata, e al ritorno e un elemento nuovo: con un ref i listener
  // sarebbero rimasti appesi a quello vecchio e la card tornava muta — non
  // rispondeva piu nemmeno allo swipe fatto a mano.
  const [card, setCard] = useState<HTMLElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  // Quando la card e stata toccata l'ultima volta. Il cambio automatico non si
  // spegne per sempre: si fa da parte mentre il dito e li e riprende cinque
  // secondi dopo l'ultimo tocco, come se il conto ripartisse da capo.
  const [touchedAt, setTouchedAt] = useState(0);
  const swipe = useRef<{
    x: number;
    y: number;
    lastX: number;
    lastAt: number;
    velocityX: number;
    axis: "pending" | "horizontal" | "vertical";
  } | null>(null);
  // Vive dal touchend al click che il browser manda comunque in coda a uno
  // swipe: serve solo a non aprire il foglio quando il gesto era un cambio.
  const swipeHandled = useRef(false);
  // Da quale lato deve entrare la faccia nuova quando il cambio e andato a
  // buon fine. Null quando non c'e nessun cambio in corso.
  const enterFrom = useRef<number | null>(null);
  // Il cambio automatico fa avanti e indietro invece di ricominciare da capo:
  // arrivato all'ultima faccia torna verso la prima. Con due facce e
  // l'alternanza di sempre; con tre evita il salto dalla terza alla prima,
  // che sarebbe l'unico movimento a non corrispondere a nessuno swipe.
  const autoDirection = useRef<"left" | "right">("left");
  // Il gestore di turno letto da dentro gli effetti senza doverli riagganciare
  // a ogni render: e una funzione scritta inline nel JSX, quindi cambia
  // identita tutte le volte.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const index = faces.indexOf(face);

  // Cambiare faccia o aprire il foglio fa cambiare l'altezza della pagina, e
  // il browser rimette lo scorrimento dove puo: se eri in fondo, risali. Qui
  // teniamo fermo il bordo alto della card, spostando lo scorrimento della
  // stessa quantita di cui si e mosso lui.
  const keepScroll = useCallback((change: () => void) => {
    const before = card?.getBoundingClientRect().top ?? null;
    change();
    if (before === null) return;
    requestAnimationFrame(() => {
      const after = card?.getBoundingClientRect().top;
      if (after === undefined) return;
      scrollPageBy(after - before);
    });
  }, [card]);

  // Il cambio vero e proprio: la faccia vecchia esce da un lato e quella nuova
  // entra dall'altro. Lo chiamano sia il dito sia il timer, cosi il cambio a
  // mano e quello automatico sono esattamente lo stesso movimento.
  const slide = useCallback((next: T, direction: "left" | "right") => {
    const track = trackRef.current;
    const width = Math.max(card?.getBoundingClientRect().width ?? 1, 1);
    const exit = direction === "left" ? -width : width;
    const finish = () => keepScroll(() => onChangeRef.current(next));
    if (!track || !track.animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      enterFrom.current = null;
      finish();
      return;
    }
    // La faccia nuova entrera dal lato opposto: il gesto portato a termine.
    enterFrom.current = -exit;
    track
      .animate(
        [
          { transform: track.style.transform || "translate3d(0, 0, 0)", opacity: track.style.opacity || "1" },
          { transform: `translate3d(${exit}px, 0, 0)`, opacity: 0 },
        ],
        { duration: 170, easing: "cubic-bezier(0.4, 0, 0.9, 0.35)", fill: "forwards" },
      )
      .finished.then(finish, finish);
  }, [card, keepScroll]);

  // Il cambio automatico: le facce si alternano da sole ogni cinque secondi,
  // cosi la home le mostra tutte senza che nessuno la tocchi. Si ferma dove
  // non avrebbe senso girare a vuoto: fuori dalla home, con un foglio aperto,
  // a scheda nascosta, o quando il telefono chiede meno animazioni. Toccando
  // la card si fa da parte e riprende cinque secondi dopo l'ultimo tocco:
  // touchedAt cambia, l'effetto riparte e il conto ricomincia da zero.
  useEffect(() => {
    if (!enabled || faces.length < 2) return;
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let timer = 0;
    function schedule() {
      timer = window.setTimeout(() => {
        // Dito ancora appoggiato sulla card: si rimanda invece di strappargli
        // la faccia di mano a meta gesto.
        if (swipe.current) {
          schedule();
          return;
        }
        // Arrivati a un estremo si torna indietro: la direzione cambia una
        // volta sola, e da li in poi si scorre nell'altro verso.
        if (autoDirection.current === "left" && index >= faces.length - 1) autoDirection.current = "right";
        if (autoDirection.current === "right" && index <= 0) autoDirection.current = "left";
        const step = autoDirection.current === "left" ? 1 : -1;
        const next = faces[index + step];
        if (next !== undefined) slide(next, autoDirection.current);
      }, 5000);
    }

    // A scheda nascosta il timer non parte nemmeno: un'animazione che gira
    // dietro le quinte consuma batteria e non la guarda nessuno. Quando la
    // pagina torna in vista il conto ricomincia da capo.
    function sync() {
      window.clearTimeout(timer);
      if (document.visibilityState === "visible") schedule();
    }

    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [touchedAt, index, faces, enabled, slide]);

  // Il gesto orizzontale sulla card. Fa tre cose: decide una volta sola su che
  // asse sta andando il dito, blocca lo scorrimento verticale appena ha deciso
  // che e orizzontale, e tiene la faccia attaccata al dito finche non la si
  // lascia.
  useEffect(() => {
    if (!card) return;
    const node = card;

    const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Dove si va scorrendo in quella direzione. Le facce sono in fila, nello
    // stesso ordine dei pallini: oltre i due estremi non c'e niente, e li il
    // dito incontra la resistenza elastica invece di trascinare via la card.
    function destination(direction: "left" | "right"): T | null {
      const next = faces[direction === "left" ? index + 1 : index - 1];
      return next ?? null;
    }

    // La stessa resistenza dei fogli che si trascinano: all'inizio segue quasi
    // il dito, poi si arrende sempre di piu e si ferma.
    function rubber(distance: number, limit = 220) {
      return (1 - 1 / (distance / limit + 1)) * limit;
    }

    function cardWidth() {
      return Math.max(node.getBoundingClientRect().width, 1);
    }

    function paint(offset: number) {
      const track = trackRef.current;
      if (!track) return;
      const progress = Math.min(1, Math.abs(offset) / cardWidth());
      track.style.transition = "none";
      track.style.transform = `translate3d(${offset}px, 0, 0)`;
      // Sbiadisce mentre esce: senza, la faccia vecchia resta squillante fino
      // al bordo e il cambio sembra uno scatto invece di una dissolvenza.
      track.style.opacity = String(1 - progress * 0.45);
    }

    function restore() {
      const track = trackRef.current;
      if (!track || !track.style.transform) return;
      const fromTransform = track.style.transform;
      const fromOpacity = track.style.opacity || "1";
      track.style.transform = "";
      track.style.opacity = "";
      if (!track.animate || reduceMotion()) return;
      track.animate(
        [
          { transform: fromTransform, opacity: fromOpacity },
          { transform: "translate3d(0, 0, 0)", opacity: 1 },
        ],
        { duration: 420, easing: "cubic-bezier(0.34, 1.32, 0.64, 1)" },
      );
    }

    function onStart(event: TouchEvent) {
      swipeHandled.current = false;
      // Il cambio automatico si fa da parte e riparte cinque secondi dopo che
      // il dito se n'e andato: mentre la card e sotto le dita comanda lei.
      setTouchedAt(Date.now());
      if (event.touches.length !== 1 || !window.matchMedia("(max-width: 780px)").matches) {
        swipe.current = null;
        return;
      }
      trackRef.current?.getAnimations().forEach((animation) => animation.cancel());
      const touch = event.touches[0];
      swipe.current = {
        x: touch.clientX,
        y: touch.clientY,
        lastX: touch.clientX,
        lastAt: performance.now(),
        velocityX: 0,
        axis: "pending",
      };
    }

    function onMove(event: TouchEvent) {
      const gesture = swipe.current;
      const touch = event.touches[0];
      if (!gesture || !touch) return;
      const distanceX = touch.clientX - gesture.x;
      const distanceY = touch.clientY - gesture.y;
      // L'asse si decide una volta sola, agli otto pixel: prima di allora il
      // gesto e ancora di tutti e due, dopo non cambia piu idea a meta strada.
      if (gesture.axis === "pending") {
        if (Math.max(Math.abs(distanceX), Math.abs(distanceY)) < 8) return;
        gesture.axis = Math.abs(distanceX) > Math.abs(distanceY) * 1.15 ? "horizontal" : "vertical";
      }
      if (gesture.axis !== "horizontal") return;
      // E per questa riga che i listener sono nativi e non passivi: da qui in
      // poi la pagina non scorre piu su e giu finche il dito non si stacca.
      if (event.cancelable) event.preventDefault();

      const now = performance.now();
      const elapsed = Math.max(1, now - gesture.lastAt);
      gesture.velocityX = (touch.clientX - gesture.lastX) / elapsed;
      gesture.lastX = touch.clientX;
      gesture.lastAt = now;

      const direction = distanceX < 0 ? "left" : "right";
      const free = Boolean(destination(direction));
      paint(free ? distanceX : Math.sign(distanceX) * rubber(Math.abs(distanceX)));
    }

    function onEnd(event: TouchEvent) {
      const gesture = swipe.current;
      swipe.current = null;
      // I cinque secondi si contano dall'ultimo tocco, che e questo.
      setTouchedAt(Date.now());
      const track = trackRef.current;
      if (!gesture || !track || gesture.axis !== "horizontal") return;
      const touch = event.changedTouches[0];
      const distanceX = touch ? touch.clientX - gesture.x : 0;
      const direction = distanceX < 0 ? "left" : "right";
      const next = destination(direction);
      const width = cardWidth();
      // Due modi di convincerlo: portarlo oltre un terzo della card, oppure un
      // colpo secco. Il secondo e per i pollici veloci, che non arrivano mai
      // lontano ma sono decisi.
      const enoughDistance = Math.abs(distanceX) >= Math.max(56, width * 0.3);
      const enoughMomentum = Math.abs(distanceX) >= 28 && Math.abs(gesture.velocityX) >= 0.4;
      if (!next || !(enoughDistance || enoughMomentum)) {
        restore();
        return;
      }
      // Il click che il browser manda dopo il gesto non deve aprire il foglio.
      swipeHandled.current = true;
      slide(next, direction);
    }

    function onCancel() {
      swipe.current = null;
      setTouchedAt(Date.now());
      restore();
    }

    node.addEventListener("touchstart", onStart, { passive: true });
    node.addEventListener("touchmove", onMove, { passive: false });
    node.addEventListener("touchend", onEnd);
    node.addEventListener("touchcancel", onCancel);
    return () => {
      node.removeEventListener("touchstart", onStart);
      node.removeEventListener("touchmove", onMove);
      node.removeEventListener("touchend", onEnd);
      node.removeEventListener("touchcancel", onCancel);
    };
  }, [card, faces, index, slide]);

  // Cambiata la faccia, quella nuova entra dal lato opposto a quello da cui e
  // uscita la vecchia: il gesto continua invece di ricominciare.
  useEffect(() => {
    const track = trackRef.current;
    const from = enterFrom.current;
    enterFrom.current = null;
    if (!track || from === null) return;
    track.getAnimations().forEach((animation) => animation.cancel());
    track.style.transform = "";
    track.style.opacity = "";
    if (!track.animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      if (enteringClass) track.classList.remove(enteringClass);
      return;
    }
    if (enteringClass) track.classList.add(enteringClass);
    const entrance = track.animate(
      [
        { transform: `translate3d(${from}px, 0, 0)`, opacity: 0 },
        { transform: "translate3d(0, 0, 0)", opacity: 1 },
      ],
      { duration: 340, easing: "cubic-bezier(0.32, 0.9, 0.28, 1)" },
    );
    // Arrivata: le animazioni che aspettavano possono ripartire da capo, in
    // tempo con la faccia nuova.
    const done = () => { if (enteringClass) track.classList.remove(enteringClass); };
    entrance.finished.then(done, done);
  }, [face, enteringClass]);

  return {
    setCard,
    trackRef,
    swipeHandled,
    // Da chiamare al click sulla card: rimanda il cambio automatico di altri
    // cinque secondi, come fa il tocco.
    touch: () => setTouchedAt(Date.now()),
  };
}

function MatchCard({
  match,
  onEdit,
  onPlayVideo,
  viewerId,
  actionLabel,
  compact = false,
}: {
  match: PadelMatch;
  onEdit?: (match: PadelMatch) => void;
  onPlayVideo?: (videoId: string) => void;
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
  const formatTeam = (players: typeof team1) => (
    <span className="match-team-players">
      {players.map((player) => {
        const delta = player.rating_delta ?? 0;
        return (
          <span key={player.profile_id} className="match-team-player">
            {player.profile.display_name}
            {compact ? null : (
              <>
                {" "}
                <b className={`elo-delta ${delta >= 0 ? "up" : "down"}`}>
                  {delta > 0 ? "+" : ""}{delta}
                </b>
              </>
            )}
          </span>
        );
      })}
    </span>
  );

  return (
    <article
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
          <div className="mini-avatars">{team1.map((player) => <Avatar key={player.profile_id} profile={player.profile} size="sm" />)}</div>
          {formatTeam(team1)}
          {draw ? <em>PAREGGIO</em> : match.winner_team === leftSide ? <em>VITTORIA</em> : null}
        </div>
        <div className="match-score">
          {match.sets
            .sort((a, b) => a.set_number - b.set_number)
            .map((set) => (
              // Il set interrotto si scrive fra parentesi: dice a colpo
              // d'occhio che quei giochi non hanno assegnato il set.
              <span key={set.set_number} className={setIsIncomplete(set) ? "match-score-unfinished" : undefined}>
                <b>{flipped ? set.team2_games : set.team1_games}</b>
                <i>—</i>
                <b>{flipped ? set.team1_games : set.team2_games}</b>
              </span>
            ))}
        </div>
        <div className={`match-team team-right ${draw ? "drawn" : match.winner_team === rightSide ? "winner" : ""}`}>
          <div className="mini-avatars">{team2.map((player) => <Avatar key={player.profile_id} profile={player.profile} size="sm" />)}</div>
          {formatTeam(team2)}
          {draw ? <em>PAREGGIO</em> : match.winner_team === rightSide ? <em>VITTORIA</em> : null}
        </div>
      </div>
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

function TeamRankingList({
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
        const winRate = team.matches_played ? Math.round((team.wins / team.matches_played) * 100) : 0;
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
              <b>{team.rating}</b>
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

// Foglio che sale dal basso, come i pannelli di sistema di iOS. Si chiude
// trascinandolo verso il basso, toccando fuori o con Esc. Il trascinamento
// parte solo quando l'elenco dentro è già in cima: altrimenti scorrere il
// contenuto chiuderebbe il pannello.
function BottomSheet({
  title,
  eyebrow,
  action,
  onClose,
  children,
}: {
  title: string;
  // Riga sopra al titolo: di solito un'etichetta, ma può essere un comando.
  // Facoltativa: il foglio della classifica non ne ha più bisogno.
  eyebrow?: ReactNode;
  // Comando nell'angolo dell'intestazione, al posto della crocetta.
  action?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ y: number; lastY: number; lastAt: number; speed: number } | null>(null);
  const closing = useRef(false);

  // Molla: arriva svelta e supera di poco il punto d'arrivo prima di
  // assestarsi. Una curva di Bézier invece di linear(), che su Safari meno
  // recenti non esiste e farebbe saltare del tutto l'animazione.
  const SPRING = "cubic-bezier(0.34, 1.32, 0.64, 1)";

  // Elastico: il foglio non segue il dito uno a uno, oppone una resistenza
  // che cresce. All'inizio si muove quasi quanto il dito, poi rallenta e si
  // ferma. È la stessa sensazione degli elenchi di iOS quando finiscono.
  function rubber(distance: number, limit = 460) {
    return (1 - 1 / (distance / limit + 1)) * limit;
  }

  // La deformazione: mentre scende si schiaccia in altezza e stringe appena,
  // come i pannelli di sistema. transform-origin sta in basso, quindi la
  // compressione avviene verso il bordo dello schermo.
  function shape(offset: number) {
    const pulled = rubber(Math.max(0, offset));
    const squash = Math.min(pulled, 420) / 420;
    return `translate3d(0, ${pulled}px, 0) scaleX(${1 - squash * 0.04}) scaleY(${1 - squash * 0.02})`;
  }

  // La fascia in cima allo schermo, quella dietro la Dynamic Island, non è
  // figlia del velo e quindi non può leggerne il valore. La stessa manopola
  // vive perciò anche sulla radice del documento, e da qui la teniamo
  // allineata al velo passo per passo: si ritirano e rientrano insieme,
  // invece di lasciare una tacca scura in cima quando il foglio se n'è andato.
  const islandAnimation = useRef<Animation | null>(null);

  const setIsland = useCallback((value: number) => {
    islandAnimation.current?.cancel();
    islandAnimation.current = null;
    document.documentElement.style.setProperty("--island", String(Math.max(0, Math.min(1, value))));
  }, []);

  const animateIsland = useCallback((to: number, duration: number, easing: string) => {
    const root = document.documentElement;
    const from = root.style.getPropertyValue("--island") || String(1 - to);
    islandAnimation.current?.cancel();
    islandAnimation.current = null;
    if (!root.animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      root.style.setProperty("--island", String(to));
      return;
    }
    const animation = root.animate(
      [{ "--island": from } as Keyframe, { "--island": String(to) } as Keyframe],
      { duration, easing, fill: "forwards" },
    );
    islandAnimation.current = animation;
    // Arrivata in fondo, il valore si fissa sullo stile e l'animazione si
    // scioglie: lasciarla appesa con fill forwards congelerebbe la proprietà
    // e il foglio dopo non riuscirebbe più a muoverla.
    animation.finished.then(
      () => {
        root.style.setProperty("--island", String(to));
        animation.cancel();
        if (islandAnimation.current === animation) islandAnimation.current = null;
      },
      () => {},
    );
  }, []);

  // La fascia si ritira mentre il foglio sale e rientra quando se ne va.
  useEffect(() => {
    animateIsland(1, 340, "ease-out");
    return () => {
      islandAnimation.current?.cancel();
      islandAnimation.current = null;
      document.documentElement.style.removeProperty("--island");
    };
  }, [animateIsland]);

  // Sfocatura e scurimento sono comandati da un solo numero, così scendono
  // insieme al foglio mentre lo trascini.
  function setVeil(value: number) {
    const clamped = Math.max(0, Math.min(1, value));
    backdropRef.current?.style.setProperty("--veil", String(clamped));
    setIsland(clamped);
  }

  const dismiss = useCallback(() => {
    const panel = panelRef.current;
    const backdrop = backdropRef.current;
    if (closing.current) return;
    closing.current = true;
    if (!panel || !panel.animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onClose();
      return;
    }
    const from = panel.style.transform || "translate3d(0, 0, 0)";
    // Esce scivolando in basso e basta. Nessuna opacità in movimento: il
    // pannello che sfumava lasciava intravedere la pagina attraverso di sé.
    panel.animate(
      [{ transform: from }, { transform: "translate3d(0, 102%, 0)" }],
      { duration: 300, easing: "cubic-bezier(0.4, 0, 0.9, 0.35)", fill: "forwards" },
    );
    // La sfocatura si spegne insieme, non di colpo alla scomparsa.
    const veilNow = backdrop?.style.getPropertyValue("--veil") || "1";
    backdrop?.animate(
      [{ "--veil": veilNow } as Keyframe, { "--veil": "0" } as Keyframe],
      { duration: 300, easing: "ease-in", fill: "forwards" },
    );
    // Stesso tempo e stessa curva per la fascia in cima: torna del colore
    // della pagina mentre la sfocatura svanisce, non un istante dopo.
    animateIsland(0, 300, "ease-in");
    window.setTimeout(onClose, 290);
  }, [onClose, animateIsland]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") dismiss();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dismiss]);

  // La pagina sotto non deve scorrere mentre il foglio è aperto. In più il
  // touchmove che non nasce dentro l'elenco va fermato a mano, altrimenti
  // Safari lo passa comunque alla pagina.
  useEffect(() => {
    function block(event: TouchEvent) {
      const list = bodyRef.current;
      const target = event.target instanceof Node ? event.target : null;
      const inside = Boolean(list && target && list.contains(target));
      const scrollable = Boolean(list && list.scrollHeight > list.clientHeight);
      // Dentro l'elenco lo scorrimento serve: si blocca solo il resto.
      if (inside && scrollable) {
        // Ma solo finché c'è elenco sopra da recuperare. Arrivati in cima e
        // col dito che scende comanda il foglio, e lo scorrimento nativo va
        // zittito: altrimenti il rimbalzo elastico di iOS si somma al
        // trascinamento e il pannello si muove a strappi invece di scendere.
        // È la differenza che si vedeva fra la classifica squadre — corta,
        // quindi mai scorrevole, e infatti già a posto — e quella singolo.
        if ((list?.scrollTop ?? 0) > 0) return;
        const touch = event.touches[0];
        const state = drag.current;
        if (!state || !touch || touch.clientY <= state.y) return;
      }
      if (event.cancelable) event.preventDefault();
    }

    // Dove scorre il contenuto in un contenitore suo — cioe su mobile —
    // fermarlo e una riga sola: gli si toglie l'overflow e resta dov'era, la
    // posizione non la perde.
    const scroller = pageScroller();
    if (scroller) {
      const previousOverflow = scroller.style.overflowY;
      scroller.style.overflowY = "hidden";
      document.addEventListener("touchmove", block, { passive: false });
      return () => {
        document.removeEventListener("touchmove", block);
        scroller.style.overflowY = previousOverflow;
      };
    }

    // Dove invece scorre la pagina intera serve la ginnastica di sempre: su
    // iOS overflow: hidden non basta, il corpo va bloccato alla posizione
    // corrente e rimesso dov'era alla chiusura.
    const top = window.scrollY;
    const { body, documentElement } = document;
    const previous = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      overflow: body.style.overflow,
      htmlOverflow: documentElement.style.overflow,
    };
    body.style.position = "fixed";
    body.style.top = `-${top}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.overflow = "hidden";
    documentElement.style.overflow = "hidden";
    document.addEventListener("touchmove", block, { passive: false });

    return () => {
      document.removeEventListener("touchmove", block);
      body.style.position = previous.position;
      body.style.top = previous.top;
      body.style.left = previous.left;
      body.style.right = previous.right;
      body.style.overflow = previous.overflow;
      documentElement.style.overflow = previous.htmlOverflow;
      window.scrollTo({ top, behavior: "instant" as ScrollBehavior });
    };
  }, []);

  function settle() {
    const panel = panelRef.current;
    const backdrop = backdropRef.current;
    if (!panel) return;
    const from = panel.style.transform || "translate3d(0, 0, 0)";
    const veilNow = backdrop?.style.getPropertyValue("--veil") || "1";
    panel.style.transform = "";
    backdrop?.style.removeProperty("--veil");
    if (!panel.animate) return;
    panel.animate(
      [{ transform: from }, { transform: "translate3d(0, 0, 0)" }],
      { duration: 520, easing: SPRING },
    );
    // Tornando su, la sfocatura si riforma con la stessa molla.
    backdrop?.animate(
      [{ "--veil": veilNow } as Keyframe, { "--veil": "1" } as Keyframe],
      { duration: 420, easing: "ease-out" },
    );
    // E con lei la fascia in cima si rifa da parte.
    animateIsland(1, 420, "ease-out");
  }

  return (
    <div
      className="sheet-backdrop"
      ref={backdropRef}
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && dismiss()}
    >
      <section
        className="sheet"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onTouchStart={(event) => {
          if ((bodyRef.current?.scrollTop ?? 0) > 0 || event.touches.length !== 1) {
            drag.current = null;
            return;
          }
          const touch = event.touches[0];
          panelRef.current?.getAnimations().forEach((animation) => animation.cancel());
          drag.current = { y: touch.clientY, lastY: touch.clientY, lastAt: performance.now(), speed: 0 };
        }}
        onTouchMove={(event) => {
          const state = drag.current;
          const touch = event.touches[0];
          const panel = panelRef.current;
          if (!state || !touch || !panel) return;
          const now = performance.now();
          state.speed = (touch.clientY - state.lastY) / Math.max(1, now - state.lastAt);
          state.lastY = touch.clientY;
          state.lastAt = now;
          const distance = touch.clientY - state.y;
          // Verso l'alto il foglio non sale: oppone resistenza crescente e si
          // allunga appena, come un elastico.
          if (distance < 0) {
            const stretch = Math.min(-distance, 160) / 160;
            panel.style.transform = `translate3d(0, ${-rubber(-distance, 90)}px, 0) scaleY(${1 + stretch * 0.012})`;
            return;
          }
          panel.style.transform = shape(distance);
          // La sfocatura cala man mano che il foglio scende: a metà corsa
          // la pagina sotto ricomincia a leggersi.
          setVeil(1 - Math.min(distance / 420, 1) * 0.85);
        }}
        onTouchEnd={(event) => {
          const state = drag.current;
          drag.current = null;
          const touch = event.changedTouches[0];
          if (!state || !touch) return;
          const distance = touch.clientY - state.y;
          if (distance > 110 || state.speed > 0.6) {
            dismiss();
            return;
          }
          settle();
        }}
        onTouchCancel={() => { drag.current = null; settle(); }}
      >
        {/* La maniglia non c'è più. Diceva "questo pannello si trascina", ma
            lo dicono già la forma e il fatto che si muova appena lo tocchi:
            era un'istruzione per una cosa che nessuno sbaglia. */}
        <div className="sheet-head">
          <div>
            {eyebrow ? (typeof eyebrow === "string" ? <p className="eyebrow dark">{eyebrow}</p> : eyebrow) : null}
            <h2>{title}</h2>
          </div>
          {action}
        </div>
        <div className="sheet-body" ref={bodyRef}>{children}</div>
      </section>
    </div>
  );
}

// Il podio si legge dall'anello attorno alla foto: oro, argento, bronzo.
// Prima era il fondo della riga a cambiare colore, ma con le righe adiacenti
// tre fondi diversi spezzavano l'elenco invece di ordinarlo.
function medalClass(rank: number) {
  if (rank === 1) return "medal-gold";
  if (rank === 2) return "medal-silver";
  if (rank === 3) return "medal-bronze";
  return "";
}

// Da quale riga far partire la finestra quando l'elenco è più lungo dello
// spazio. Centrata su chi guarda invece che sempre in cima: il primo vede
// comunque 1-2-3 perché sopra di lui non c'è niente, il quinto vede 4-5-6,
// l'ultimo vede gli ultimi tre. Senza qualcuno su cui centrarsi si resta in
// testa, che è il comportamento di prima.
function rankingWindowStart(total: number, size: number, focusIndex: number) {
  if (focusIndex < 0 || total <= size) return 0;
  const start = focusIndex - Math.floor((size - 1) / 2);
  return Math.max(0, Math.min(start, total - size));
}

function RankingList({
  profiles,
  expanded = false,
  onSelect,
  limit,
  focusId,
  showTrend = true,
  bare = false,
}: {
  profiles: Profile[];
  expanded?: boolean;
  onSelect?: (profile: Profile) => void;
  // Le frecce dicono come sta andando adesso: in una stagione archiviata non
  // significano niente, perché quella classifica è ferma.
  showTrend?: boolean;
  // Numero massimo di righe da mostrare. Si conta per righe e non per
  // posizione: con dei parimerito una soglia sulla posizione mostrerebbe un
  // numero di persone diverso da quello promesso.
  limit?: number;
  // Su chi centrare la finestra quando c'è un limite. In home è chi guarda:
  // le tre righe che contano sono la sua e quelle che ha davanti e dietro,
  // non le prime tre di una classifica in cui magari non compare.
  focusId?: string | null;
  bare?: boolean;
}) {
  const sorted = sortPadelProfiles(profiles);
  const ranks = padelRanks(sorted);
  const start = limit === undefined
    ? 0
    : rankingWindowStart(sorted.length, limit, sorted.findIndex((profile) => profile.id === focusId));
  const visible = limit === undefined ? sorted : sorted.slice(start, start + limit);
  return (
    <div className={`${expanded ? "ranking-table" : "ranking-list"}${bare ? " ranking-table-bare" : ""}`}>
      {visible.map((profile, index) => {
        const isRanked = profile.matches_played > 0;
        // La posizione va letta sull'elenco intero, non sulla finestra:
        // altrimenti la prima riga visibile direbbe sempre "1".
        const rank = ranks[start + index];
        const winRate = padelWinRate(profile.wins, profile.draws ?? 0, profile.matches_played);
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
              <span className={`trend ${showTrend && isRanked ? (profile.current_streak >= 0 ? "up" : "down") : ""}`}>
                {showTrend ? (isRanked ? (profile.current_streak >= 0 ? "↑" : "↓") : "—") : ""}
              </span>
            )}
            <span className="ranking-points">
              <b>{isRanked ? profile.rating : "N/C"}</b>
              <small>{isRanked ? "PT" : "0 PARTITE"}</small>
            </span>
          </>
        );
        const tone = isRanked ? medalClass(rank) : "";
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
  const score = sets
    .map((set) => `${set.team1_games}-${set.team2_games}${setIsIncomplete(set) ? " (interrotto)" : ""}`)
    .join(" ");
  return `${team1} vs ${team2} · ${score}`;
}

// Legge il tabellone scritto nel modulo. Il terzo set vale come set vinto
// solo se e finito: se il campo e scaduto sul 2-1 quel set non lo ha vinto
// nessuno, e con un set a testa la partita e un pareggio.
function readMatchScore(scores: string[][]) {
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
  const valid = sets.length >= 2
    && sets.every((set) => Number.isInteger(set.team1_games) && Number.isInteger(set.team2_games)
      && set.team1_games >= 0 && set.team2_games >= 0
      && set.team1_games <= 20 && set.team2_games <= 20)
    && (Math.max(team1Sets, team2Sets) === 2 || (team1Sets === 1 && team2Sets === 1));
  return {
    sets,
    team1Sets,
    team2Sets,
    valid,
    draw: valid && team1Sets === 1 && team2Sets === 1,
    unfinishedSet: sets.find(setIsIncomplete) ?? null,
  };
}

function NewMatchModal({
  profiles,
  match,
  tournamentContext,
  onClose,
  onSaved,
}: {
  profiles: Profile[];
  match?: PadelMatch | null;
  tournamentContext?: TournamentMatchContext | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = Boolean(match);
  const initialPlayers = match
    ? [
        ...match.players.filter((player) => player.team === 1).map((player) => player.profile_id),
        ...match.players.filter((player) => player.team === 2).map((player) => player.profile_id),
      ]
    : tournamentContext?.playerIds ?? profiles.slice(0, 4).map((profile) => profile.id);
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
  const courtListId = useId();

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

  // Lo stesso conteggio che poi finisce nel salvataggio: qui serve solo a
  // dire come sta finendo la partita mentre la si scrive.
  const preview = readMatchScore(scores);

  async function save(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (players.length !== 4 || new Set(players).size !== 4 || players.some((id) => !id)) {
      setError("Scegli quattro giocatori diversi.");
      return;
    }

    const { sets, valid, draw } = readMatchScore(scores);
    if (!valid) {
      setError("Inserisci almeno due set: due vinti da una squadra, oppure uno a testa se avete smesso a metà.");
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
          comment: comment.trim() || null,
          summary: matchSummary(profiles, players, sets),
        });
      }
    }
    onSaved();
    setBusy(false);
  }

  return (
    // Lo stesso foglio dal basso di partite e classifica, non piu un riquadro
    // al centro dello schermo: registrare un risultato e una delle cose che
    // si fanno da qui dentro, non un'altra schermata. Niente crocetta — si
    // chiude trascinando in giu o toccando fuori, come tutti gli altri
    // fogli — e niente occhiello sopra al titolo: il titolo dice gia tutto.
    <BottomSheet
      title={editing ? "Modifica la partita" : "Registra una partita"}
      onClose={onClose}
    >
      <form className="sheet-form" onSubmit={save}>
          {tournamentContext ? (
            <div className="tournament-match-banner">
              <TournamentTrophyBadge kind="cup" compact />
              <span><small>PARTITA DI TORNEO · ELO ×{tournamentContext.eloMultiplier}</small><b>{tournamentContext.tournamentName}</b></span>
            </div>
          ) : null}
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
                    <select key={index} value={players[index] ?? ""} onChange={(e) => updatePlayer(index, e.target.value)} aria-label={`Giocatore ${position + 1} squadra ${team}`} disabled={Boolean(tournamentContext)}>
                      <option value="">Scegli giocatore</option>
                      {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.display_name}</option>)}
                    </select>
                  );
                })}
              </fieldset>
            ))}
          </div>
          <div className="sets-form">
            {/* Le quattro colonne dell'intestazione sono le stesse delle
                righe, trattino compreso: con tre sole, le due etichette non
                stavano sopra ai campi che nominavano. */}
            <span>SET</span><span>SQUADRA 1</span><span aria-hidden="true" /><span>SQUADRA 2</span>
            {scores.map((score, index) => (
              <div className="set-row" key={index}>
                <b>{index + 1}</b>
                <input type="number" min="0" max="20" value={score[0]} onChange={(e) => updateScore(index, 0, e.target.value)} aria-label={`Punti squadra 1 set ${index + 1}`} />
                <span>—</span>
                <input type="number" min="0" max="20" value={score[1]} onChange={(e) => updateScore(index, 1, e.target.value)} aria-label={`Punti squadra 2 set ${index + 1}`} />
              </div>
            ))}
          </div>
          {/* L'esito si legge da solo dal tabellone, ma un pareggio nasce da
              un set lasciato a metà: scritto qui sopra al tasto, un 2-1
              battuto per sbaglio si vede prima di salvarlo e non dopo. */}
          {preview.draw ? (
            <p className="match-verdict">
              <b>Pareggio</b>
              {preview.unfinishedSet
                ? ` · un set a testa, il terzo si è fermato sul ${preview.unfinishedSet.team1_games}-${preview.unfinishedSet.team2_games}. I suoi giochi contano nell'Elo, ma non assegnano il set.`
                : " · un set a testa e partita finita lì."}
            </p>
          ) : null}
          <label>
            Campo <span className="optional-label">facoltativo</span>
            {/* Suggerimenti, non una gabbia: la casella resta libera, cosi
                una trasferta fuori provincia si scrive comunque. L'elenco
                serve a far uscire lo stesso nome tutte le volte, altrimenti
                le statistiche per campo non staranno mai in piedi. */}
            <input
              value={court}
              onChange={(e) => setCourt(e.target.value)}
              list={courtListId}
              placeholder="Es. DON QUIQUE - IMPERIA"
              maxLength={60}
            />
            <datalist id={courtListId}>
              {PADEL_COURTS.map((name) => <option key={name} value={name} />)}
            </datalist>
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
            {/* "facoltativo" si scrive sempre allo stesso modo, in tutti i
                campi che lo sono: era l'unico a dirlo dentro all'etichetta
                invece che nel segno accanto. */}
            Nota <span className="optional-label">facoltativo</span>
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
    </BottomSheet>
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
  // Minuti e secondi in due caselle invece che in una sola con i due punti:
  // il tastierino del telefono non ha il ":" e il minuto non si riusciva a
  // scrivere. Una casella vuota vale zero, cosi "0:45" e solo 45 nei secondi.
  const [startMinutes, setStartMinutes] = useState("");
  const [startSecs, setStartSecs] = useState("");
  const [duration, setDuration] = useState("20");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const startSecsRef = useRef<HTMLInputElement | null>(null);

  function pickMatch(id: string) {
    setMatchId(id);
    const chosen = withVideo.find((match) => match.id === id);
    if (chosen?.video_url) setVideoUrl(chosen.video_url);
  }

  // Solo cifre: su desktop la tastiera vera lascerebbe scrivere lettere e
  // segni, che poi diventerebbero NaN al salvataggio.
  function onlyDigits(value: string, max: number) {
    return value.replace(/\D/g, "").slice(0, max);
  }

  const startSeconds = startMinutes === "" && startSecs === ""
    ? null
    : Number(startMinutes || 0) * 60 + Number(startSecs || 0);
  const previewId = youtubeId(videoUrl);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!previewId) {
      setError("Serve un indirizzo YouTube valido.");
      return;
    }
    if (startSeconds === null) {
      setError("Indica il minuto di partenza: minuti e secondi, per esempio 3 e 12.");
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
            <div className="play-clock">
              <span className="play-clock-label">Minuto di partenza</span>
              <div className="play-clock-fields">
                {/* Due cifre e il fuoco salta ai secondi da solo: e il gesto
                    che si fa gia con i codici di verifica, e risparmia un
                    tocco proprio dove prima ci si bloccava. */}
                <input
                  value={startMinutes}
                  onChange={(event) => {
                    const clean = onlyDigits(event.target.value, 2);
                    setStartMinutes(clean);
                    if (clean.length === 2) startSecsRef.current?.focus();
                  }}
                  placeholder="00"
                  inputMode="numeric"
                  aria-label="Minuti"
                />
                <b aria-hidden="true">:</b>
                <input
                  ref={startSecsRef}
                  value={startSecs}
                  onChange={(event) => setStartSecs(onlyDigits(event.target.value, 2))}
                  placeholder="00"
                  inputMode="numeric"
                  aria-label="Secondi"
                />
              </div>
            </div>
            <label>
              Durata
              <select value={duration} onChange={(event) => setDuration(event.target.value)}>
                <option value="10">10 secondi</option>
                <option value="20">20 secondi</option>
                <option value="30">30 secondi</option>
              </select>
            </label>
          </div>
          <p className="field-hint">
            Il minuto è quello che leggi sul player di YouTube. Una casella lasciata vuota vale zero.
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

type TournamentTrophyKind = Tournament["trophy_badge"];

type TournamentMatchContext = {
  fixtureId: string;
  tournamentName: string;
  eloMultiplier: number;
  playerIds: [string, string, string, string];
};

type TournamentStanding = {
  team: TournamentTeam;
  played: number;
  wins: number;
  losses: number;
  gamesWon: number;
  gamesLost: number;
  directWins: number;
};

// Il simbolo del trofeo e ora l'emblema esagonale, lo stesso della bacheca:
// i quattro glifi a tratto — coppa, corona, scudo, stella — erano disegnati
// qui a mano e non c'entravano piu niente con il resto.
// La forma resta nel prop e nella colonna trophy_badge del database: cambia
// solo quello che si vede, cosi i tornei gia creati non perdono il loro
// valore e si puo tornare indietro senza migrazioni.
function TournamentTrophyBadge({ kind, compact = false }: { kind: TournamentTrophyKind; compact?: boolean }) {
  return (
    <div className={`tournament-trophy tournament-trophy-${kind}${compact ? " is-compact" : ""}`} aria-hidden="true">
      <Emblem name="trophy" className="tournament-trophy-art" />
    </div>
  );
}

// Riga di un torneo nel riquadro della home: stesso impianto della riga
// partita, con le sole informazioni che servono a colpo d'occhio.
function TournamentRow({
  tournament,
  matches,
  onOpen,
}: {
  tournament: Tournament;
  matches: PadelMatch[];
  onOpen: () => void;
}) {
  const played = tournament.fixtures.filter((fixture) => fixture.match_id).length;
  const total = tournament.fixtures.length;
  // Stessa definizione usata dalla pagina tornei, invece di ricalcolarla qui.
  const done = tournamentIsCompleted(tournament, matches);
  const standings = buildTournamentStandings(tournament, matches);
  // A torneo finito conta chi ha vinto; mentre e in corso, chi guida.
  const leader = standings[0]?.played ? standings[0].team.name : null;

  return (
    <article
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
          <TournamentTrophyBadge kind={tournament.trophy_badge} compact />
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
    </article>
  );
}

function buildTournamentStandings(tournament: Tournament, matches: PadelMatch[]) {
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
    const team1 = rows.get(fixture.team1_id);
    const team2 = rows.get(fixture.team2_id);
    if (!match || !team1 || !team2) return;
    team1.played += 1;
    team2.played += 1;
    team1.wins += match.winner_team === 1 ? 1 : 0;
    team1.losses += match.winner_team === 2 ? 1 : 0;
    team2.wins += match.winner_team === 2 ? 1 : 0;
    team2.losses += match.winner_team === 1 ? 1 : 0;
    match.sets.forEach((set) => {
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
      if (!tiedIds.has(fixture.team1_id) || !tiedIds.has(fixture.team2_id) || !fixture.match_id) return;
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
    || b.gamesWon - a.gamesWon
    || a.team.sort_order - b.team.sort_order,
  );
}

function TournamentCreateModal({
  profiles,
  onClose,
  onSaved,
}: {
  profiles: Profile[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const initialTeams = [0, 1, 2].map((teamIndex) => ({
    playerA: profiles[teamIndex * 2]?.id ?? "",
    playerB: profiles[teamIndex * 2 + 1]?.id ?? "",
    name: "",
  }));
  const [name, setName] = useState("Torneo TheBoyz");
  const [teams, setTeams] = useState(initialTeams);
  const [trophyName, setTrophyName] = useState("Coppa TheBoyz");
  const [trophyBadge, setTrophyBadge] = useState<TournamentTrophyKind>("cup");
  const [eloMultiplier, setEloMultiplier] = useState<1 | 2>(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function updateTeam(index: number, key: "playerA" | "playerB" | "name", value: string) {
    setTeams((current) => current.map((team, teamIndex) => teamIndex === index ? { ...team, [key]: value } : team));
  }

  async function createTournament(event: FormEvent) {
    event.preventDefault();
    setError("");
    const playerIds = teams.flatMap((team) => [team.playerA, team.playerB]);
    if (teams.length < 3 || teams.some((team) => !team.playerA || !team.playerB)) {
      setError("Servono almeno tre squadre complete.");
      return;
    }
    if (new Set(playerIds).size !== playerIds.length) {
      setError("Ogni partecipante può giocare in una sola squadra.");
      return;
    }
    if (!name.trim() || !trophyName.trim()) {
      setError("Inserisci il nome del torneo e del trofeo.");
      return;
    }
    if (!supabase) return;
    setBusy(true);
    const teamPayload = teams.map((team, index) => {
      const playerA = profiles.find((profile) => profile.id === team.playerA);
      const playerB = profiles.find((profile) => profile.id === team.playerB);
      return {
        player_a: team.playerA,
        player_b: team.playerB,
        name: team.name.trim() || `${playerA?.display_name ?? "?"} & ${playerB?.display_name ?? "?"}`,
        sort_order: index + 1,
      };
    });
    const { error: createError } = await supabase.rpc("create_round_robin_tournament", {
      p_name: name.trim(),
      p_trophy_name: trophyName.trim(),
      p_trophy_badge: trophyBadge,
      p_elo_multiplier: eloMultiplier,
      p_teams: teamPayload,
    });
    if (createError) {
      setError(createError.message);
      setBusy(false);
      return;
    }
    await onSaved();
  }

  return (
    // Stesso foglio della partita: si arriva qui dallo stesso tasto, scorrendo
    // di lato, e sarebbe strano trovare due pannelli diversi a un dito di
    // distanza.
    <BottomSheet title="Crea un torneo" onClose={onClose}>
      <form className="sheet-form tournament-create-form" onSubmit={createTournament}>
          <label>Nome del torneo<input value={name} onChange={(event) => setName(event.target.value)} maxLength={70} required /></label>

          <div className="tournament-form-head">
            <div><p className="eyebrow dark">PARTECIPANTI E SQUADRE</p><h3>{teams.length} coppie · {teams.length * (teams.length - 1) / 2} partite</h3></div>
            {teams.length < 4 && profiles.length >= (teams.length + 1) * 2 ? (
              <button className="button button-ghost" type="button" onClick={() => setTeams((current) => [...current, { playerA: "", playerB: "", name: "" }])}>+ Squadra</button>
            ) : null}
          </div>
          <div className="tournament-team-builder">
            {teams.map((team, index) => (
              <fieldset key={index}>
                <legend>Squadra {index + 1}</legend>
                <div className="tournament-team-selects">
                  <select value={team.playerA} onChange={(event) => updateTeam(index, "playerA", event.target.value)} aria-label={`Primo giocatore squadra ${index + 1}`}>
                    <option value="">Primo giocatore</option>
                    {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.display_name}</option>)}
                  </select>
                  <select value={team.playerB} onChange={(event) => updateTeam(index, "playerB", event.target.value)} aria-label={`Secondo giocatore squadra ${index + 1}`}>
                    <option value="">Secondo giocatore</option>
                    {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.display_name}</option>)}
                  </select>
                </div>
                <input value={team.name} onChange={(event) => updateTeam(index, "name", event.target.value)} placeholder="Nome squadra facoltativo" maxLength={50} aria-label={`Nome squadra ${index + 1}`} />
                {teams.length > 3 ? <button className="tournament-team-remove" type="button" onClick={() => setTeams((current) => current.filter((_, teamIndex) => teamIndex !== index))}>Rimuovi</button> : null}
              </fieldset>
            ))}
          </div>

          <div className="tournament-prize-form">
            <div className="tournament-prize-preview"><TournamentTrophyBadge kind={trophyBadge} /><span><b>{trophyName || "Trofeo"}</b><small>IN PALIO</small></span></div>
            <div>
              <label>Nome del trofeo<input value={trophyName} onChange={(event) => setTrophyName(event.target.value)} maxLength={60} required /></label>
              <span className="tournament-field-label">Simbolo del trofeo</span>
              <div className="tournament-trophy-picker" role="group" aria-label="Simbolo del trofeo">
                {(["cup", "crown", "shield", "star"] as TournamentTrophyKind[]).map((kind) => (
                  <button className={trophyBadge === kind ? "active" : ""} type="button" key={kind} onClick={() => setTrophyBadge(kind)} aria-label={kind} aria-pressed={trophyBadge === kind}>
                    <TournamentTrophyBadge kind={kind} compact />
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="tournament-elo-choice">
            <div><p className="eyebrow dark">ELO IN PALIO</p><h3>Quanto valgono le partite?</h3><small>Il moltiplicatore si applica sia ai punti guadagnati sia a quelli persi.</small></div>
            <div className="ranking-switch" role="group" aria-label="Moltiplicatore Elo">
              <button type="button" className={eloMultiplier === 1 ? "active" : ""} onClick={() => setEloMultiplier(1)}>Normale ×1</button>
              <button type="button" className={eloMultiplier === 2 ? "active" : ""} onClick={() => setEloMultiplier(2)}>Doppio ×2</button>
            </div>
          </div>
          {error ? <p className="form-message error">{error}</p> : null}
          <div className="modal-actions">
            <button className="button button-ghost" type="button" onClick={onClose}>Annulla</button>
            <button className="button button-lime" disabled={busy}>{busy ? "Creazione…" : "Crea torneo"}</button>
          </div>
        </form>
    </BottomSheet>
  );
}

function tournamentIsCompleted(tournament: Tournament, matches: PadelMatch[]) {
  const matchIds = new Set(matches.map((match) => match.id));
  return Boolean(
    tournament.fixtures.length
    && tournament.fixtures.every((fixture) => fixture.match_id && matchIds.has(fixture.match_id)),
  );
}

function TournamentStandingsContent({
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
  return (
    <>
      <div className="player-history-head">
        <div><p className="eyebrow dark">CLASSIFICA</p><h2>{title}</h2></div>
        {actionLabel ? <span className="tournament-open-label">{actionLabel} →</span> : null}
      </div>
      <div className="tournament-table">
        <div className="tournament-table-head"><span>#</span><span>Squadra</span><span>G</span><span>V</span><span>SD</span><span>Game</span></div>
        {standings.map((row, index) => (
          <div className={`tournament-table-row${index === 0 && row.played ? " is-leader" : ""}`} key={row.team.id}>
            <b>{index + 1}</b>
            <span className="tournament-team-cell"><strong>{row.team.name}</strong><small>{profileMap.get(row.team.player_a)?.display_name} · {profileMap.get(row.team.player_b)?.display_name}</small></span>
            <span>{row.played}</span><span>{row.wins}</span><span>{row.directWins}</span><span>{row.gamesWon}</span>
          </div>
        ))}
      </div>
      <p className="tournament-rule-note">Parità: scontri diretti, poi numero totale di game vinti.</p>
    </>
  );
}

function TournamentFixtures({
  tournament,
  matches,
  onRecord,
}: {
  tournament: Tournament;
  matches: PadelMatch[];
  onRecord?: (context: TournamentMatchContext) => void;
}) {
  const matchMap = new Map(matches.map((match) => [match.id, match]));
  const teamMap = new Map(tournament.teams.map((team) => [team.id, team]));
  const playedMatches = tournament.fixtures.filter((fixture) => fixture.match_id && matchMap.has(fixture.match_id)).length;
  return (
    <section className="tournament-fixtures">
      <div className="player-history-head"><div><p className="eyebrow dark">CALENDARIO</p><h2>Tutte contro tutte</h2></div><span>{playedMatches}/{tournament.fixtures.length}</span></div>
      <div className="tournament-fixture-list">
        {[...tournament.fixtures].sort((a, b) => a.match_number - b.match_number).map((fixture) => {
          const team1 = teamMap.get(fixture.team1_id);
          const team2 = teamMap.get(fixture.team2_id);
          const match = fixture.match_id ? matchMap.get(fixture.match_id) : null;
          if (!team1 || !team2) return null;
          const score = match ? [...match.sets].sort((a, b) => a.set_number - b.set_number).map((set) => `${set.team1_games}-${set.team2_games}`).join("  ") : null;
          return (
            <article className={`tournament-fixture${match ? " is-played" : ""}`} key={fixture.id}>
              <span className="tournament-match-number">{String(fixture.match_number).padStart(2, "0")}</span>
              <div><b className={match?.winner_team === 1 ? "winner" : ""}>{team1.name}</b><small>vs</small><b className={match?.winner_team === 2 ? "winner" : ""}>{team2.name}</b></div>
              {match ? <strong className="tournament-score">{score}</strong> : onRecord ? (
                <button className="button button-dark" onClick={() => onRecord({
                  fixtureId: fixture.id,
                  tournamentName: tournament.name,
                  eloMultiplier: tournament.elo_multiplier,
                  playerIds: [team1.player_a, team1.player_b, team2.player_a, team2.player_b],
                })}>Inserisci risultato</button>
              ) : <span className="tournament-awaiting">Da giocare</span>}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function TournamentsPage({
  tournaments,
  profiles,
  matches,
  schemaReady,
  onCreate,
  onRecord,
}: {
  tournaments: Tournament[];
  profiles: Profile[];
  matches: PadelMatch[];
  schemaReady: boolean;
  onCreate: () => void;
  onRecord: (context: TournamentMatchContext) => void;
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
            <div><p className="eyebrow">{completed ? "TORNEO COMPLETATO" : "TORNEO IN CORSO"}</p><h1>{detailTournament.name}</h1><p>{playedMatches}/{detailTournament.fixtures.length} partite · Elo ×{detailTournament.elo_multiplier}</p></div>
          </div>
        </article>
        <article className="tournament-board-head">
          <div className="tournament-prize-card"><TournamentTrophyBadge kind={detailTournament.trophy_badge} /><span><small>{completed ? "TROFEO ASSEGNATO" : "TROFEO IN PALIO"}</small><b>{detailTournament.trophy_name}</b></span></div>
          <div className="tournament-title-card"><p className="eyebrow dark">FORMULA</p><h2>Girone all’italiana</h2><span>Vittorie · scontri diretti · game vinti</span></div>
        </article>
        <div className="tournament-layout">
          <section className="tournament-standings">
            <TournamentStandingsContent tournament={detailTournament} profiles={profiles} matches={matches} title={completed ? "Classifica finale" : "Situazione attuale"} />
          </section>
          <TournamentFixtures tournament={detailTournament} matches={matches} onRecord={completed ? undefined : onRecord} />
        </div>
      </section>
    );
  }

  return (
    <section className="page-section tournament-page tournament-home-page">
      <article className="section-hero tournament-hero">
        <BlockMark size="lg" />
        <div className="section-hero-head">
          <div><p className="eyebrow">THEBOYZ CUP</p><h1>Tornei</h1><p>Girone all’italiana: vittorie, scontri diretti, game vinti.</p></div>
          <button className="button button-primary tournament-new-button" onClick={onCreate} disabled={!schemaReady}>+ Nuovo torneo</button>
        </div>
      </article>

      {!schemaReady ? (
        <p className="demo-profile-note">Per creare i tornei esegui <code>migration-tornei.sql</code> nel SQL Editor di Supabase.</p>
      ) : (
        <>
          {activeTournaments.length ? (
            <section className="tournament-live-section">
              <div className="section-head tournament-section-head"><div className="section-head-label"><p className="eyebrow dark">IN CORSO</p><h2>Situazione del torneo</h2></div></div>
              {activeTournaments.map((tournament) => {
                const playedMatches = tournament.fixtures.filter((fixture) => fixture.match_id && matches.some((match) => match.id === fixture.match_id)).length;
                const progress = tournament.fixtures.length ? Math.round((playedMatches / tournament.fixtures.length) * 100) : 0;
                return (
                  <article className="tournament-live-card" key={tournament.id}>
                    <div className="tournament-board-head">
                      <div className="tournament-prize-card"><TournamentTrophyBadge kind={tournament.trophy_badge} /><span><small>TROFEO IN PALIO</small><b>{tournament.trophy_name}</b></span></div>
                      <div className="tournament-title-card">
                        <p className="eyebrow dark">TORNEO IN CORSO</p><h2>{tournament.name}</h2><span>{playedMatches}/{tournament.fixtures.length} partite · Elo ×{tournament.elo_multiplier}</span>
                        <span className="tournament-progress" aria-label={`${progress}% completato`}><i style={{ width: `${progress}%` }} /></span>
                      </div>
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
                      <TournamentFixtures tournament={tournament} matches={matches} onRecord={onRecord} />
                    </div>
                  </article>
                );
              })}
            </section>
          ) : null}

          <section className="tournament-recent-section">
            <div className="section-head tournament-section-head"><div className="section-head-label"><p className="eyebrow dark">ARCHIVIO</p><h2>Ultimi tornei</h2></div></div>
            {completedTournaments.length ? (
              <div className="tournament-recent-list">
                {(showAllCompleted ? completedTournaments : completedTournaments.slice(0, 3)).map((tournament) => {
                  const standings = buildTournamentStandings(tournament, matches);
                  const winner = standings[0];
                  return (
                    <article className="tournament-recent-card" key={tournament.id}>
                      <div className="tournament-recent-head">
                        <TournamentTrophyBadge kind={tournament.trophy_badge} compact />
                        <div><p className="eyebrow dark">COMPLETATO</p><h3>{tournament.name}</h3><span>{tournament.fixtures.length} partite · Elo ×{tournament.elo_multiplier}</span></div>
                        <div className="tournament-winner"><small>VINCITORI</small><b>{winner?.team.name ?? "—"}</b></div>
                      </div>
                      <button className="tournament-recent-ranking" type="button" onClick={() => setDetailId(tournament.id)}>
                        <span>CLASSIFICA FINALE</span>
                        <div>
                          {standings.slice(0, 3).map((row, index) => <span key={row.team.id}><b>#{index + 1}</b>{row.team.name}<strong>{row.wins}V</strong></span>)}
                        </div>
                        <strong>Apri dettagli →</strong>
                      </button>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="compact-empty tournament-recent-empty"><span>00</span><p>{tournaments.length ? "Nessun torneo concluso." : "Nessun torneo creato."}</p></div>
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
  const [showPizzaInfo, setShowPizzaInfo] = useState(false);
  // La home mostra soltanto un'anteprima; i "Vedi tutto" aprono le pagine
  // complete, così la schermata principale non cambia altezza.
  const HOME_ROWS = 3;
  const HOME_MATCHES = 2;
  const HOME_TOURNAMENTS = 2;

  // Sta qui e non in mezzo agli altri stati perche il carosello qui sotto ha
  // bisogno di sapere quale delle due classifiche e in scena.
  const [rankingMode, setRankingMode] = useState<"single" | "team">("single");
  const isPhone = useIsPhone();
  // Quali partite mostrano la card e il foglio: le proprie o tutte, in
  // quest'ordine, che e quello dei pallini.
  const [matchesMode, setMatchesMode] = useState<"mine" | "all">("all");
  // Quale raccoglitore del mese è aperto, uno solo per volta. Tre stati e non
  // due: undefined vuol dire "nessuna scelta ancora", e allora vale il mese
  // più recente; null vuol dire chiuso perché è stato chiuso apposta. Senza
  // questa distinzione non si potrebbe distinguere "non ho ancora deciso" da
  // "li voglio tutti chiusi".
  const [chosenMonth, setChosenMonth] = useState<string | null | undefined>(undefined);
  // Partite e classifica complete si aprono in un foglio dal basso invece di
  // portare su un'altra schermata.
  const [sheet, setSheet] = useState<null | "matches" | "ranking">(null);

  // I due caroselli della home. Le facce sono in fila nell'ordine dei
  // pallini, e il cambio automatico va avanti e indietro lungo quella fila.
  // Girano solo in home e a fogli chiusi: dentro a un foglio si guarda una
  // cosa sola, e vedere la card cambiare dietro al velo sarebbe una
  // distrazione.
  const carouselEnabled = !sheet && view === "padel" && padelView === "overview";

  const {
    setCard: setRankingCard,
    trackRef: rankingTrackRef,
    swipeHandled: rankingSwipeHandled,
    touch: touchRanking,
  } = useCardCarousel({
    faces: RANKING_FACES,
    face: rankingMode,
    onChange: setRankingMode,
    enabled: carouselEnabled,
    // Il riflesso sugli anelli del podio deve accendersi quando la classifica
    // e arrivata, non mentre sta ancora scivolando dentro.
    enteringClass: "is-ranking-entering",
  });

  const {
    setCard: setMatchesCard,
    trackRef: matchesTrackRef,
    swipeHandled: matchesSwipeHandled,
    touch: touchMatches,
  } = useCardCarousel({
    faces: MATCHES_FACES,
    face: matchesMode,
    // Cambiando insieme cambiano i mesi del foglio, e va riaperto il piu
    // recente di quelli nuovi.
    onChange: (next) => { setMatchesMode(next); setChosenMonth(undefined); },
    // Solo su telefono: su desktop la card delle partite non ha i pallini,
    // e vederla cambiare da sola senza niente che dica perche sembrerebbe
    // un difetto. Li l'elenco resta quello che e.
    enabled: carouselEnabled && isPhone,
  });

  // Quale dei due tasti e in scena in cima alla home.
  const [ctaFace, setCtaFace] = useState<"match" | "tournament">("match");
  const {
    setCard: setCtaCard,
    trackRef: ctaTrackRef,
    swipeHandled: ctaSwipeHandled,
  } = useCardCarousel({
    faces: CTA_FACES,
    face: ctaFace,
    onChange: setCtaFace,
    // Mai da solo: un tasto che cambia mentre lo stai per premere fa aprire
    // la cosa sbagliata. Questo si muove solo col dito.
    enabled: false,
  });

  // Ogni cinque secondi il tasto si sporge di un dito verso il lato da cui
  // arriva l'altro, e torna. E il modo di dire "qui si scorre" senza
  // scriverlo: i pallini sotto al tasto lo dicevano meglio, ma erano una
  // riga in piu fra due card in una schermata che vive di passi uguali.
  // Non cambia faccia, la accenna soltanto: cambiarla resta cosa del dito.
  useEffect(() => {
    if (!carouselEnabled || !isPhone) return;
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let timer = 0;
    function schedule() {
      timer = window.setTimeout(() => {
        const track = ctaTrackRef.current;
        // Se il dito lo sta gia spostando il suggerimento e superfluo, e
        // arriverebbe come uno strattone in mano.
        if (track?.animate && !track.style.transform) {
          const nudge = ctaFace === "match" ? -16 : 16;
          track.animate(
            [
              { transform: "translate3d(0, 0, 0)" },
              { transform: `translate3d(${nudge}px, 0, 0)`, offset: 0.4 },
              { transform: "translate3d(0, 0, 0)" },
            ],
            { duration: 760, easing: "cubic-bezier(0.34, 1.32, 0.64, 1)" },
          );
        }
        schedule();
      }, 5000);
    }

    // A scheda nascosta non parte: un movimento che nessuno guarda e solo
    // batteria.
    function sync() {
      window.clearTimeout(timer);
      if (document.visibilityState === "visible") schedule();
    }

    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [carouselEnabled, isPhone, ctaFace, ctaTrackRef]);

  const [editingMatch, setEditingMatch] = useState<PadelMatch | null>(null);
  const [showProfileEdit, setShowProfileEdit] = useState(false);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const avatarFileRef = useRef<HTMLInputElement>(null);
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
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [tournamentSchemaReady, setTournamentSchemaReady] = useState(true);
  const [showTournamentCreate, setShowTournamentCreate] = useState(false);
  const [tournamentMatch, setTournamentMatch] = useState<TournamentMatchContext | null>(null);

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
      tournamentsResult,
      courtsResult,
      setFlagsResult,
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
      client
        .from("padel_tournaments")
        .select("id, name, status, trophy_name, trophy_badge, elo_multiplier, created_by, created_at, teams:tournament_teams(id, tournament_id, name, player_a, player_b, sort_order), fixtures:tournament_fixtures(id, tournament_id, match_number, team1_id, team2_id, match_id)")
        .order("created_at", { ascending: false }),
      // Il campo da gioco sta in una query a parte: se la migrazione non e
      // stata eseguita questa fallisce da sola, senza portarsi dietro il
      // caricamento delle partite.
      client.from("matches").select("id, court"),
      // Stesso motivo per il set interrotto: finche migration-pareggi.sql
      // non e stata eseguita la colonna non esiste e i set risultano tutti
      // completi, che e esattamente com'erano prima.
      client.from("match_sets").select("match_id, set_number, incomplete"),
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
      const loadedTournaments = tournamentsResult.error ? [] : (tournamentsResult.data ?? []) as unknown as Tournament[];
      const fixtureByMatch = new Map(
        loadedTournaments.flatMap((tournament) => tournament.fixtures)
          .filter((fixture) => fixture.match_id)
          .map((fixture) => [fixture.match_id as string, fixture.id]),
      );
      // Vuota finche la migrazione del campo da gioco non e stata eseguita.
      const courtMap = new Map(
        courtsResult.error
          ? []
          : ((courtsResult.data ?? []) as { id: string; court: string | null }[]).map((row) => [row.id, row.court]),
      );
      // Vuota finche la migrazione dei pareggi non e stata eseguita.
      const incompleteSets = new Set(
        setFlagsResult.error
          ? []
          : ((setFlagsResult.data ?? []) as { match_id: string; set_number: number; incomplete: boolean }[])
              .filter((row) => row.incomplete)
              .map((row) => `${row.match_id}|${row.set_number}`),
      );
      const normalized = (matchesResult.data ?? []).map((match) => ({
        ...match,
        court: courtMap.get(match.id) ?? null,
        tournament_fixture_id: fixtureByMatch.get(match.id) ?? null,
        sets: (match.sets ?? []).map((set) => ({
          ...set,
          incomplete: incompleteSets.has(`${match.id}|${set.set_number}`),
        })),
        players: (match.players ?? []).map((player) => ({
          ...player,
          profile: profileMap.get(player.profile_id) ?? player.profile,
        })),
      })) as unknown as PadelMatch[];
      setProfiles(withAvatars);
      setMatches(normalized);
      setTournamentSchemaReady(!tournamentsResult.error);
      if (!tournamentsResult.error) {
        setTournaments(loadedTournaments.map((tournament) => ({
          ...tournament,
          teams: [...(tournament.teams ?? [])].sort((a, b) => a.sort_order - b.sort_order),
          fixtures: [...(tournament.fixtures ?? [])].sort((a, b) => a.match_number - b.match_number),
        })));
      }
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
  const isCurrentSeason = season === currentYear;
  // Le coppie di una stagione passata si ricostruiscono dalle partite di
  // quell'anno: l'archivio conserva le posizioni dei singoli, non quelle
  // delle squadre.
  // Le coppie di una stagione chiusa vanno lette con i punteggi di quella
  // stagione, non con quelli di oggi: altrimenti la classifica del singolo
  // resta ferma nell'archivio mentre quella delle squadre continua a
  // muoversi. Chi non compare nell'archivio tiene il profilo vivo, cosi la
  // coppia non sparisce dall'elenco.
  const seasonTeams = useMemo(() => {
    if (isCurrentSeason) return teams;
    const own = matches.filter((match) => new Date(match.played_at).getFullYear() === season);
    const frozen = new Map(profiles.map((profile) => [profile.id, profile]));
    seasonProfiles.forEach((profile) => frozen.set(profile.id, profile));
    return buildPadelTeams(own, [...frozen.values()], teamRecords);
  }, [isCurrentSeason, teams, matches, profiles, seasonProfiles, teamRecords, season]);
  // Da qui in giu si parla di classifica, quindi solo coppie battezzate.
  // "teams" resta la lista completa: serve alla scheda del giocatore, dove
  // le squadre senza nome sono proprio quelle da sistemare.
  const rankedTeams = useMemo(() => rankedPadelTeams(teams), [teams]);
  const rankedSeasonTeams = useMemo(() => rankedPadelTeams(seasonTeams), [seasonTeams]);
  const rankingRows = rankingMode === "single" ? seasonProfiles.length : rankedSeasonTeams.length;
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
  const editingTournamentContext: TournamentMatchContext | null = (() => {
    const fixtureId = editingMatch?.tournament_fixture_id;
    if (!fixtureId) return null;
    for (const tournament of tournaments) {
      const fixture = tournament.fixtures.find((item) => item.id === fixtureId);
      if (!fixture) continue;
      const team1 = tournament.teams.find((team) => team.id === fixture.team1_id);
      const team2 = tournament.teams.find((team) => team.id === fixture.team2_id);
      if (!team1 || !team2) return null;
      return {
        fixtureId,
        tournamentName: tournament.name,
        eloMultiplier: tournament.elo_multiplier,
        playerIds: [team1.player_a, team1.player_b, team2.player_a, team2.player_b],
      };
    }
    return null;
  })();
  const selectedPlayerTrophies = selectedPlayer ? tournaments.filter((tournament) => {
    const completed = tournament.fixtures.length > 0 && tournament.fixtures.every(
      (fixture) => fixture.match_id && matches.some((match) => match.id === fixture.match_id),
    );
    if (!completed) return false;
    const standings = buildTournamentStandings(tournament, matches);
    const winner = standings[0];
    if (!winner) return false;
    const championTeams = standings.filter((row) =>
      row.wins === winner.wins
      && row.directWins === winner.directWins
      && row.gamesWon === winner.gamesWon,
    );
    return championTeams.some((row) => row.team.player_a === selectedPlayer.id || row.team.player_b === selectedPlayer.id);
  }) : [];
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
  const currentUserId = currentUser?.id ?? null;
  const currentUserName = currentUser?.display_name ?? "";

  // L'ultima coppia con cui si è scesi in campo. Di squadre se ne può avere
  // più d'una in corso contemporaneamente, e nessuna è "la propria" in senso
  // stretto: quella che vale come punto di riferimento è l'ultima giocata.
  // Le partite arrivano già dalla più recente, quindi la prima che ci
  // riguarda è anche l'ultima disputata.
  const lastTeamId = useMemo(() => {
    if (!currentUserId) return null;
    for (const match of matches) {
      const mine = match.players.find((player) => player.profile_id === currentUserId);
      if (!mine) continue;
      const mates = match.players
        .filter((player) => player.team === mine.team)
        .map((player) => player.profile_id);
      // Un singolo non forma una coppia: quella partita non dice niente sulle
      // squadre e si passa a quella prima.
      if (mates.length < 2) continue;
      const played = teams.find((team) => team.players.length === 2
        && team.players.every((profile) => mates.includes(profile.id)));
      if (played) return played.id;
    }
    return null;
  }, [matches, teams, currentUserId]);

  // Le partite scelte dai pallini. Il filtro sta qui e non dentro al foglio
  // perché lo stesso elenco serve in due posti: l'anteprima nella card e il
  // raccoglitore per mese. Una partita è "di torneo" se il calendario di un
  // torneo la rivendica, cioè se porta con sé il turno da cui è nata.
  const filteredMatches = useMemo(() => {
    if (matchesMode === "mine" && currentUserId) {
      return matches.filter((match) => match.players.some((player) => player.profile_id === currentUserId));
    }
    return matches;
  }, [matches, matchesMode, currentUserId]);

  // Nessuna partita, detto con le parole del filtro attivo: "non ce n'è" e
  // "non ne hai ancora giocate" sono due cose diverse.
  const emptyMatchesNote = matchesMode === "mine"
    ? "Non hai ancora giocato nessuna partita."
    : "Nessuna partita registrata.";

  // Le partite del foglio, divise per mese. Il filtro agisce prima del
  // raggruppamento, così i conteggi sui raccoglitori dicono quante partite ci
  // sono davvero dentro e non quante ce ne sarebbero in totale.
  const matchMonths = useMemo(() => {
    const groups = new Map<string, { key: string; label: string; matches: PadelMatch[] }>();
    filteredMatches.forEach((match) => {
      const date = new Date(match.played_at);
      // La chiave è ordinabile come testo, quindi il riordino qui sotto non
      // ha bisogno di ricostruire nessuna data.
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      let group = groups.get(key);
      if (!group) {
        const name = new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric" }).format(date);
        group = { key, label: name.charAt(0).toUpperCase() + name.slice(1), matches: [] };
        groups.set(key, group);
      }
      group.matches.push(match);
    });
    return [...groups.values()].sort((a, b) => (a.key < b.key ? 1 : -1));
  }, [filteredMatches]);

  // Il mese più recente è già aperto quando il foglio sale, e torna ad
  // aprirsi passando fra tutte le partite e le proprie: è quello che si va a
  // guardare quasi sempre, e farlo aprire a mano ogni volta era un tocco
  // chiesto per abitudine.
  // Il valore si ricava invece di essere scritto in uno stato: chi apre il
  // foglio o cambia insieme azzera la scelta, e da lì il mese giusto si
  // rilegge da solo. Tenerlo in uno stato da sincronizzare vorrebbe dire
  // riscriverlo a ogni ricarica dei dati, e il raccoglitore che stavi
  // leggendo si richiuderebbe mentre lo guardi.
  const latestMonthKey = matchMonths[0]?.key ?? null;
  const openMonth = chosenMonth === undefined ? latestMonthKey : chosenMonth;

  // Profilo e scheda giocatore sono la stessa pagina: la propria è solo la
  // scheda di sé stessi, con in più i campi modificabili. Memoizzata perche
  // finisce fra le voci della barra mobile, che altrimenti verrebbero
  // ricostruite a ogni render.
  const openOwnCard = useCallback(() => {
    if (!currentUserId) return;
    setSelectedPlayerId(currentUserId);
    setPadelView("player");
    setView("padel");
  }, [currentUserId]);

  // --- Barra di navigazione mobile -----------------------------------------
  // La pastiglia viene spostata scrivendo direttamente sullo stile: passando
  // da uno stato React ogni movimento del dito farebbe ridisegnare tutta la
  // schermata, e il trascinamento risulterebbe a scatti.
  const navRef = useRef<HTMLElement | null>(null);
  const navPillRef = useRef<HTMLSpanElement | null>(null);
  const navButtonsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const navDragging = useRef(false);
  const navPointerStart = useRef<number | null>(null);
  const contentRef = useRef<HTMLElement | null>(null);
  const pageTransitioning = useRef(false);
  const pageSwipeStart = useRef<{
    x: number;
    y: number;
    lastX: number;
    lastAt: number;
    velocityX: number;
    axis: "pending" | "horizontal" | "vertical";
  } | null>(null);

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
      scrollPageTo(0, "smooth");
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
    pill.style.transition = NAV_PILL_TRANSITION;
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
    pill.style.transition = NAV_PILL_TRANSITION;
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
      lead: salute.replace("{nome}", currentUserName),
      rest: pool[Math.floor(greetingSeed * pool.length)] ?? pool[0] ?? "",
    };
  }, [currentRank, isLastRanked, hasNarrowLead, currentUserName, greetingSeed, saluteSeed]);
  // Stessa formula di padelWinRate, scritta a mano solo qui: una chiamata a
  // funzione in questo punto del componente fa rinunciare il compilatore di
  // React a tutte le memoizzazioni manuali della pagina (lo dice `npm run
  // lint`). Se la formula cambia, cambiala in tutti e due i posti.
  const winRate = currentUser?.matches_played
    ? Math.round(((currentUser.wins + (currentUser.draws ?? 0) * 0.5) / currentUser.matches_played) * 100)
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
    const wasTournament = Boolean(tournamentMatch || editingTournamentContext);
    setShowMatch(false);
    setEditingMatch(null);
    setTournamentMatch(null);
    await loadData();
    setNotice(
      wasEditing
        ? "Correzione salvata. Classifica e statistiche sono state ricalcolate."
        : wasTournament
          ? "Risultato del torneo salvato. Classifica ed Elo sono stati aggiornati."
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

    // Il nome non e un vezzo: e quello che fa entrare la coppia in
    // classifica. Meglio dirlo qui, dove si sceglie, che lasciarlo scoprire.
    setNotice(
      error
        ? error.message
        : name.trim()
          ? "Squadra salvata: da ora è in classifica."
          : "Squadra senza nome: resta fuori dalla classifica.",
    );
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

  function openPadelPage(next: "matches" | "ranking" | "tournaments") {
    setView("padel");
    setPadelView(next);
    scrollPageTo(0, "instant" as ScrollBehavior);
  }

  type MobileDestination = "padel" | "pizza" | "profile";

  // Fra Padel, Pizza e Profilo si passa solo dalla barra: lo scorrimento
  // laterale faceva cambiare sezione per sbaglio mentre si leggeva. Resta
  // solo il ritorno indietro dagli archivi, che è un gesto senza ambiguità.
  function mobileDestination(direction: "left" | "right"): MobileDestination | null {
    const isPadelArchive = view === "padel"
      && (padelView === "matches" || padelView === "ranking" || padelView === "tournaments");
    if (isPadelArchive) return direction === "right" ? "padel" : null;
    return null;
  }

  function openMobileDestination(destination: MobileDestination) {
    if (destination === "padel") goHome();
    if (destination === "pizza") setView("pizza");
    if (destination === "profile") openOwnCard();
  }

  function clearPageMotion() {
    const page = contentRef.current;
    if (!page) return;
    page.classList.remove("is-page-dragging", "is-page-transitioning");
    page.style.removeProperty("transform");
    page.style.removeProperty("opacity");
    page.style.removeProperty("filter");
  }

  async function restorePagePosition() {
    const page = contentRef.current;
    if (!page) return;
    // Un semplice tap o uno scroll verticale non hanno mai spostato la
    // pagina: in quel caso non va avviata un'animazione che potrebbe
    // intercettare il click appena dopo il touchend.
    if (!page.classList.contains("is-page-dragging") && !page.style.transform) return;
    const fromTransform = page.style.transform || "translate3d(0, 0, 0)";
    const fromOpacity = page.style.opacity || "1";
    page.classList.remove("is-page-dragging");
    page.classList.add("is-page-transitioning");
    if (!page.animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      clearPageMotion();
      return;
    }
    const animation = page.animate(
      [
        { transform: fromTransform, opacity: fromOpacity },
        { transform: "translate3d(0, 0, 0) scale(1)", opacity: "1" },
      ],
      { duration: 230, easing: "cubic-bezier(0.22, 0.85, 0.25, 1)" },
    );
    try { await animation.finished; } catch { /* gesto interrotto da un nuovo disegno */ }
    clearPageMotion();
  }

  async function completePageSwipe(destination: MobileDestination, direction: "left" | "right") {
    const page = contentRef.current;
    if (!page || pageTransitioning.current) return;
    pageTransitioning.current = true;
    page.classList.remove("is-page-dragging");
    page.classList.add("is-page-transitioning");

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const exitSign = direction === "left" ? -1 : 1;
    let transitionLayer: HTMLDivElement | null = null;

    try {
      if (reduceMotion || !page.animate) {
        openMobileDestination(destination);
        scrollPageTo(0, "instant" as ScrollBehavior);
        return;
      }

      // React riusa lo stesso <main> per tutte le sezioni. Ne congeliamo una
      // copia solo per la durata della transizione: cosi il vecchio contenuto
      // puo uscire mentre quello nuovo, gia montato sotto, entra in parallelo.
      const outgoing = page.cloneNode(true) as HTMLElement;
      outgoing.setAttribute("aria-hidden", "true");
      outgoing.classList.remove("is-page-transitioning");
      outgoing.classList.add("is-page-outgoing");
      // Dove si trova adesso il bordo alto della pagina, letto a video: vale
      // sia quando a scorrere e la finestra sia quando scorre il contenuto,
      // e in quel caso offsetTop non direbbe niente di utile.
      const pageTop = page.getBoundingClientRect().top;
      const pageScrolled = page.scrollTop;
      outgoing.style.top = `${pageTop}px`;

      transitionLayer = document.createElement("div");
      transitionLayer.className = "page-transition-layer";
      transitionLayer.setAttribute("aria-hidden", "true");
      transitionLayer.appendChild(outgoing);
      document.body.appendChild(transitionLayer);
      // La copia nasce in cima: senza questo la pagina che esce ripartirebbe
      // dall'inizio invece che dal punto in cui la si stava leggendo.
      outgoing.scrollTop = pageScrolled;

      // Il main vivo resta invisibile mentre React sostituisce i dati: evita
      // un singolo frame della nuova pagina gia ferma al centro.
      page.getAnimations().forEach((animation) => animation.cancel());
      page.style.opacity = "0";
      page.style.filter = "none";
      openMobileDestination(destination);
      scrollPageTo(0, "instant" as ScrollBehavior);

      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

      const incomingTransform = `translate3d(${-exitSign * 100}vw, 0, 0) scale(0.985)`;
      page.style.transform = incomingTransform;
      page.style.opacity = "1";

      const outgoingTransform = outgoing.style.transform || "translate3d(0, 0, 0) scale(1)";
      const outgoingOpacity = outgoing.style.opacity || "1";
      const timing: KeyframeAnimationOptions = {
        duration: 340,
        easing: "cubic-bezier(0.2, 0.82, 0.2, 1)",
        fill: "forwards",
      };
      const exit = outgoing.animate(
        [
          { transform: outgoingTransform, opacity: outgoingOpacity },
          { transform: `translate3d(${exitSign * 108}vw, 0, 0) scale(0.975)`, opacity: "0.9" },
        ],
        timing,
      );
      const enter = page.animate(
        [
          { transform: incomingTransform, opacity: "1" },
          { transform: "translate3d(0, 0, 0) scale(1)", opacity: "1" },
        ],
        timing,
      );
      try { await Promise.all([exit.finished, enter.finished]); } catch { /* una nuova navigazione puo interromperle */ }
    } finally {
      transitionLayer?.remove();
      clearPageMotion();
      pageTransitioning.current = false;
    }
  }



  return (
    <div className="app-shell">
      {/* La sfocatura sotto la barra di sistema dell'iPhone: sfoca tutto
          quello che passa dietro all'ora e alle icone, e finisce dove finisce
          l'area sicura — la pagina vera, che comincia piu sotto, non la tocca.
          Due strati e non uno: la sfocatura non si puo sfumare da sola, e con
          un solo velo mascherato il taglio in basso si vedrebbe. Il secondo,
          piu forte e piu corto, fa da passaggio.
          Il contenitore e fisso ma non sfoca: la sfocatura sta sui figli, che
          sono in posizione assoluta. E la stessa precauzione della barra in
          basso — su iOS un elemento fisso che sfoca viene ridisegnato in
          ritardo durante lo scorrimento. */}
      <div className="system-blur" aria-hidden="true">
        <span />
        <span />
      </div>
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

      <main
        ref={contentRef}
        className="content"
        onTouchStart={(event) => {
          const page = contentRef.current;
          const target = event.target instanceof Element ? event.target : null;
          // La card della classifica ha un gesto orizzontale suo: se il dito
          // parte da lì, la pagina non si muove. Senza questa esclusione i due
          // gesti partirebbero insieme e si contenderebbero lo stesso dito.
          const ignored = target?.closest("input, select, textarea, label, iframe, video, [role='slider'], [role='dialog'], .tournament-tabs, .badge-grid, .ranking-preview");
          if (!page || pageTransitioning.current || event.touches.length !== 1 || ignored || !window.matchMedia("(max-width: 780px)").matches) {
            pageSwipeStart.current = null;
            return;
          }
          // Dove non si va da nessuna parte la pagina non si muove nemmeno di
          // un pixel. La resistenza elastica ha senso solo se dietro c'è una
          // destinazione che si rifiuta di aprire: in Padel, Pizza e Profilo
          // non c'è, e l'unico effetto era scoprire lo sfondo di lato, che
          // sembra un difetto. Il gesto qui resta quindi del tutto inerte,
          // coerente con quanto decide mobileDestination.
          if (!mobileDestination("left") && !mobileDestination("right")) {
            pageSwipeStart.current = null;
            return;
          }
          const touch = event.touches[0];
          if (touch.clientX < 24 || touch.clientX > window.innerWidth - 24) {
            pageSwipeStart.current = null;
            return;
          }
          page.getAnimations().forEach((animation) => animation.cancel());
          const now = performance.now();
          pageSwipeStart.current = {
            x: touch.clientX,
            y: touch.clientY,
            lastX: touch.clientX,
            lastAt: now,
            velocityX: 0,
            axis: "pending",
          };
        }}
        onTouchMove={(event) => {
          const swipe = pageSwipeStart.current;
          const touch = event.touches[0];
          const page = contentRef.current;
          if (!swipe || !touch || !page) return;
          const distanceX = touch.clientX - swipe.x;
          const distanceY = touch.clientY - swipe.y;
          if (swipe.axis === "pending" && Math.max(Math.abs(distanceX), Math.abs(distanceY)) >= 9) {
            swipe.axis = Math.abs(distanceX) > Math.abs(distanceY) * 1.15 ? "horizontal" : "vertical";
          }
          if (swipe.axis !== "horizontal") return;

          const now = performance.now();
          const elapsed = Math.max(1, now - swipe.lastAt);
          swipe.velocityX = (touch.clientX - swipe.lastX) / elapsed;
          swipe.lastX = touch.clientX;
          swipe.lastAt = now;

          const direction = distanceX < 0 ? "left" : "right";
          const canMove = Boolean(mobileDestination(direction));
          const translated = canMove ? distanceX : distanceX * 0.18;
          const progress = Math.min(1, Math.abs(translated) / Math.max(window.innerWidth, 1));
          page.classList.add("is-page-dragging");
          page.style.transform = `translate3d(${translated}px, 0, 0) scale(${1 - progress * 0.018})`;
          page.style.opacity = String(1 - progress * 0.09);
          page.style.filter = `drop-shadow(${-Math.sign(translated) * 14}px 10px 20px rgba(4, 15, 24, ${0.08 + progress * 0.18}))`;
        }}
        onTouchEnd={(event) => {
          const start = pageSwipeStart.current;
          pageSwipeStart.current = null;
          const touch = event.changedTouches[0];
          if (!start || !touch || start.axis !== "horizontal") {
            void restorePagePosition();
            return;
          }
          const distanceX = touch.clientX - start.x;
          const distanceY = Math.abs(touch.clientY - start.y);
          const direction = distanceX < 0 ? "left" : "right";
          const destination = mobileDestination(direction);
          const enoughDistance = Math.abs(distanceX) >= Math.max(68, window.innerWidth * 0.2);
          const enoughMomentum = Math.abs(distanceX) >= 34 && Math.abs(start.velocityX) >= 0.42;
          if (destination && distanceX !== 0 && distanceY < Math.abs(distanceX) * 0.9 && (enoughDistance || enoughMomentum)) {
            void completePageSwipe(destination, direction);
            return;
          }
          void restorePagePosition();
        }}
        onTouchCancel={() => {
          pageSwipeStart.current = null;
          void restorePagePosition();
        }}
      >
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
                    {/* Una riga sola sotto il numero: la barra di avanzamento
                        e la frase lunga allungavano la card senza aggiungere
                        niente che il numero non dicesse già. */}
                    <p>
                      {currentRank === 0
                        ? "Gioca la prima partita per entrare nella classifica."
                        : currentRank === 1
                          ? "Sei in testa alla classifica."
                          : <>Sei a <b>{pointsToNext} punti</b> dal prossimo posto.</>}
                    </p>
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
                    <button className="button button-primary cta-new-match cta-aurora" onClick={() => setShowMatch(true)}>+ Nuova partita</button>
                    {filteredMatches.length ? (
                      <button
                        className="button button-card cta-see-all-top"
                        onClick={() => { setChosenMonth(undefined); setSheet("matches"); }}
                      >
                        {`Vedi tutto (${filteredMatches.length})`}
                      </button>
                    ) : null}
                  </div>
                </div>
                {/* Il tasto è uscito dal riquadro e sta fra la card di chi
                    guarda e la classifica: è la prima cosa che si fa, quindi
                    sta in cima e non in mezzo all'elenco. Su desktop resta
                    invisibile, lì comandano quelli nell'intestazione di
                    sezione.
                    È un carosello come le card, ma con due tasti al posto di
                    due elenchi: scorrendo di lato compare quello del torneo.
                    Non gira da solo — una card che cambia da sola si guarda,
                    un tasto che cambia da solo si preme per sbaglio. */}
                <div className="cta-carousel" ref={setCtaCard}>
                  <div className="cta-carousel-track" ref={ctaTrackRef}>
                    {ctaFace === "match" ? (
                      <button
                        className="button button-primary cta-new-match cta-in-panel cta-between cta-aurora"
                        onClick={() => {
                          if (ctaSwipeHandled.current) return;
                          setShowMatch(true);
                        }}
                      >
                        + NUOVA PARTITA
                      </button>
                    ) : (
                      <button
                        className="button button-lime cta-new-match cta-in-panel cta-between cta-aurora"
                        onClick={() => {
                          if (ctaSwipeHandled.current) return;
                          setShowTournamentCreate(true);
                        }}
                        disabled={!tournamentSchemaReady}
                      >
                        + NUOVO TORNEO
                      </button>
                    )}
                  </div>
                </div>
                <div className="match-panel matches-panel" ref={setMatchesCard}>
                  {/* Titolo interno al riquadro, come "Classifica Elo".
                      Su desktop resta nascosto: li il titolo di sezione
                      c'e gia sopra, fuori dal riquadro. Su mobile sparisce
                      del tutto: cambiava insieme ai pallini e diceva due
                      volte la stessa cosa. */}
                  <div className="match-panel-head"><h2>Ultime partite</h2></div>
                  {filteredMatches.length ? (
                    isPhone ? (
                      /* Come la classifica: tutta la card è il bersaglio e
                         apre il foglio. Le singole partite non portano più in
                         modifica — dentro un tasto non ci possono stare altri
                         tasti, e per correggere un risultato si passa dal
                         foglio, dove le card sono per esteso. */
                      <button
                        type="button"
                        className="match-panel-open"
                        onClick={() => {
                          // Come la classifica: il tocco rimanda il cambio
                          // automatico, e il click che segue uno swipe non
                          // deve aprire il foglio.
                          touchMatches();
                          if (matchesSwipeHandled.current) return;
                          setChosenMonth(undefined);
                          setSheet("matches");
                        }}
                        aria-label={`Apri tutte le partite (${filteredMatches.length})`}
                      >
                        {/* Il nastro che si muove, col dito o da solo: e
                            l'unica cosa che scorre, il riquadro resta
                            fermo e taglia quello che esce. */}
                        <div className="match-preview-track" ref={matchesTrackRef}>
                          <div className="match-list">
                            {filteredMatches.slice(0, HOME_MATCHES).map((match) => (
                              <MatchCard
                                key={match.id}
                                match={match}
                                viewerId={session?.user.id}
                                compact
                              />
                            ))}
                          </div>
                        </div>
                      </button>
                    ) : (
                      <div className="match-list">
                        {filteredMatches.slice(0, HOME_MATCHES).map((match) => (
                          <MatchCard
                            key={match.id}
                            match={match}
                            onEdit={(selected) => setEditingMatch(selected)}
                            onPlayVideo={(id) => setPlayingVideo(id)}
                            viewerId={session?.user.id}
                          />
                        ))}
                      </div>
                    )
                  ) : (
                    <div className="compact-empty panel-empty"><span>00</span><p>{emptyMatchesNote}</p></div>
                  )}
                  {/* Gli stessi pallini della classifica: dicono che la card
                      ha due facce e quale stai guardando. Non si toccano —
                      dentro un tasto non ci possono stare altri tasti — ma
                      la card gira da sola e si cambia con lo swipe, come la
                      classifica. */}
                  <span className="card-dots" aria-hidden="true">
                    <i className={matchesMode === "mine" ? "is-current" : ""} />
                    <i className={matchesMode === "all" ? "is-current" : ""} />
                  </span>
                </div>

                {/* Tornei: stessa impaginazione delle partite, tasto di
                    creazione sopra e riquadro con gli ultimi due sotto. */}
                <div className="section-head section-head-tournaments">
                  <div className="section-head-label"><p className="eyebrow dark">THEBOYZ CUP</p><h2>I tornei</h2></div>
                  <div className="court-actions">
                    <button
                      className="button button-lime cta-new-match cta-aurora"
                      onClick={() => setShowTournamentCreate(true)}
                      disabled={!tournamentSchemaReady}
                    >
                      + Nuovo torneo
                    </button>
                  </div>
                </div>
                {/* Niente tasto "+ Nuovo torneo" dentro al riquadro: su
                    mobile era l'unico modo per crearne uno e per ora il
                    torneo non si crea da qui. Il riquadro con gli ultimi
                    resta, e su desktop il tasto è ancora nell'intestazione
                    di sezione qui sopra. */}
                <div className="match-panel tournament-panel">
                  <div className="match-panel-head"><h2>Ultimi tornei</h2></div>
                  {tournaments.length ? (
                    <div className="match-list">
                      {tournaments.slice(0, HOME_TOURNAMENTS).map((tournament) => (
                        <TournamentRow
                          key={tournament.id}
                          tournament={tournament}
                          matches={matches}
                          onOpen={() => openPadelPage("tournaments")}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="compact-empty panel-empty"><span>00</span><p>Nessun torneo ancora. Il primo trofeo aspetta un nome.</p></div>
                  )}
                  {tournaments.length ? (
                    <button
                      className="button button-ghost button-full cta-see-all-bottom"
                      aria-label="Vedi tutti i tornei"
                      onClick={() => openPadelPage("tournaments")}
                    >
                      {`Vedi tutto (${tournaments.length})`}
                    </button>
                  ) : null}
                </div>
              </div>

              <aside className="dashboard-side">
                {/* Tutta la card è il tasto: lo switch e il "Vedi tutti"
                    facevano tre bersagli dove ne bastava uno. Lo switch resta
                    nella classifica completa, qui si cambia con lo swipe. */}
                <button
                  type="button"
                  className="ranking-preview"
                  ref={setRankingCard}
                  onClick={() => {
                    // Anche il solo tocco rimanda il cambio automatico:
                    // riparte cinque secondi dopo che l'hai lasciata stare.
                    touchRanking();
                    // Uno swipe finisce comunque con un click: senza questa
                    // guardia cambiare classifica aprirebbe anche il foglio.
                    if (rankingSwipeHandled.current) return;
                    setSheet("ranking");
                  }}
                  aria-label={`Apri la classifica Elo ${rankingMode === "single" ? "singolo" : "squadra"} completa (${rankingRows})`}
                >
                  <div className="side-head">
                    <div><h2>{rankingMode === "single" ? "Classifica Elo - Singolo" : "Classifica Elo - Squadra"}</h2></div>
                    {/* I pallini del carosello: dicono che la card ha due
                        facce e quale delle due stai guardando. Sono muti per
                        i lettori di schermo — l'etichetta del tasto dice gia
                        quale classifica e a video — e non si toccano: dentro
                        un tasto non ci possono stare altri tasti. */}
                    <span className="ranking-dots" aria-hidden="true">
                      <i className={rankingMode === "single" ? "is-current" : ""} />
                      <i className={rankingMode === "team" ? "is-current" : ""} />
                    </span>
                  </div>
                  {/* La finestra ritaglia, il nastro dentro è quello che si
                      muove: col dito o da solo, ogni cinque secondi. */}
                  <div className="ranking-preview-list">
                    <div className="ranking-preview-track" ref={rankingTrackRef}>
                      {rankingMode === "single" ? (
                        <RankingList
                          profiles={seasonProfiles}
                          limit={HOME_ROWS}
                          focusId={currentUserId}
                        />
                      ) : rankedTeams.length ? (
                        <TeamRankingList teams={rankedTeams} limit={HOME_ROWS} focusId={lastTeamId} />
                      ) : (
                        <p className="demo-profile-note">
                          Una coppia entra qui quando le date un nome: apri la tua scheda, sezione
                          &ldquo;le mie squadre&rdquo;.
                        </p>
                      )}
                    </div>
                  </div>
                  {/* Su mobile i pallini scendono qui, centrati sotto la
                      terza riga: senza piu l'insegna in alto non avevano piu
                      niente accanto a cui stare, e sotto all'elenco sono
                      dove li si cerca — come sotto le foto di un profilo. */}
                  <span className="card-dots" aria-hidden="true">
                    <i className={rankingMode === "single" ? "is-current" : ""} />
                    <i className={rankingMode === "team" ? "is-current" : ""} />
                  </span>
                </button>
              </aside>
            </section>
          </>
        ) : null}

        {!loading && view === "padel" && padelView === "ranking" ? (
          <section className="page-section ranking-page">
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
                    current={currentYear}
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
                    <NavGlyph name="person" />
                  </button>
                  <button
                    className={rankingMode === "team" ? "active" : ""}
                    onClick={() => setRankingMode("team")}
                    aria-label="Classifica squadre"
                    title="Squadra"
                  >
                    <NavGlyph name="people" />
                  </button>
                </div>
              </div>
            </article>
            {rankingMode === "single" ? (
              <RankingList profiles={seasonProfiles} onSelect={openPlayer} />
            ) : rankedTeams.length ? (
              <TeamRankingList teams={rankedTeams} expanded />
            ) : (
              <div className="empty-board">
                <span>00</span>
                <h2>Nessuna squadra in classifica</h2>
                <p>
                  Le coppie si formano da sole con le partite, ma entrano in classifica solo quando
                  uno dei due le da un nome: apri la tua scheda, sezione &ldquo;le mie squadre&rdquo;.
                </p>
              </div>
            )}
          </section>
        ) : null}

        {!loading && view === "padel" && padelView === "tournaments" ? (
          <TournamentsPage
            tournaments={tournaments}
            profiles={profiles}
            matches={matches}
            schemaReady={tournamentSchemaReady}
            onCreate={() => setShowTournamentCreate(true)}
            onRecord={(context) => { setEditingMatch(null); setTournamentMatch(context); }}
          />
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

            {/* Il riquadro dei pareggi compare solo a chi ne ha: finche non
                se ne registra uno la fila resta di quattro, com'era. */}
            <div className={`player-kpis${(selectedPlayer.draws ?? 0) > 0 ? " player-kpis-drawn" : ""}`}>
              <article><b>{selectedPlayer.matches_played}</b><small>Partite</small></article>
              <article><b>{selectedPlayer.wins}</b><small>Vittorie</small></article>
              <article><b>{selectedPlayer.losses}</b><small>Sconfitte</small></article>
              {(selectedPlayer.draws ?? 0) > 0
                ? <article><b>{selectedPlayer.draws}</b><small>Pareggi</small></article>
                : null}
              <article><b>{padelWinRate(selectedPlayer.wins, selectedPlayer.draws ?? 0, selectedPlayer.matches_played)}%</b><small>Win rate</small></article>
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
                <small>{selectedPlayerTrophies.length ? `${selectedPlayerTrophies.length} conquistati` : "Nessun trofeo"}</small>
              </div>
              {selectedPlayerTrophies.length ? (
                <div className="trophy-room-list">
                  {selectedPlayerTrophies.map((tournament) => (
                    <article className="trophy-room-card" key={tournament.id}>
                      <TournamentTrophyBadge kind={tournament.trophy_badge} />
                      <span><small>{tournament.name}</small><b>{tournament.trophy_name}</b></span>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="trophy-room-empty">
                  <div aria-hidden="true">
                    <Emblem name="trophy" className="trophy-room-empty-art" />
                  </div>
                  <span><b>La prima coppa aspetta il suo torneo.</b><small>Comparirà qui quando una coppia completerà il girone al primo posto.</small></span>
                </div>
              )}
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
            <article className="section-hero">
              <BlockMark size="lg" />
              <div className="section-hero-head">
                <div><p className="eyebrow">ARCHIVIO THEBOYZ PADEL</p><h1>Tutte le partite</h1><p>{matches.length} risultati registrati dal gruppo.</p></div>
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
              <button
                className="button pizza-info-trigger"
                type="button"
                onClick={() => setShowPizzaInfo(true)}
                aria-haspopup="dialog"
              >
                <span className="pizza-info-icon" aria-hidden="true">i</span>
                <span>Info</span>
              </button>
              <div className="pizza-hero-title">
                <h1>Pizzeria<br /><span>Ranking.</span></h1>
              </div>
              <div className="pizza-hero-actions">
                <div className="pizza-hero-buttons">
                  <button className="button button-primary pizza-open-vote" onClick={() => {
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
                  const medalTone = complete ? pizzaMedalTones[index] : undefined;
                  const rowClass = `pizza-ranking-row ${medalTone ? `pizza-ranking-medal pizza-ranking-${medalTone}` : ""} ${restaurant.isNew ? "pizza-ranking-interactive" : ""} ${restaurant.pending ? "pizza-ranking-pending" : ""}`;
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

      {showPizzaInfo ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setShowPizzaInfo(false)}>
          <section className="modal pizza-info-modal" role="dialog" aria-modal="true" aria-labelledby="pizza-info-title">
            <div className="modal-head">
              <div>
                <p className="eyebrow dark">COME FUNZIONA</p>
                <h2 id="pizza-info-title">Ogni punto conta.</h2>
              </div>
              <button className="icon-button" onClick={() => setShowPizzaInfo(false)} aria-label="Chiudi">×</button>
            </div>
            <p className="pizza-info-copy">I voti ordinari valgono 93 punti. Con Fabio si aggiungono i suoi 7 punti; senza Fabio i 93 vengono riportati a 100.</p>
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
        </div>
      ) : null}

      {sheet === "matches" ? (
        <BottomSheet
          /* Sulle proprie partite il titolo porta il nome di chi guarda
             invece della parola "personale": e la stessa informazione, ma
             detta da qualcuno che ti conosce. Se il nome manca — profilo
             appena creato — si torna alla parola. */
          title={matchesMode === "mine"
            ? `Partite - ${currentUserName || "Personale"}`
            : "Partite - Tutte"}
          onClose={() => setSheet(null)}
          /* Dentro al foglio resta l'interruttore a icone: qui c'e lo spazio
             per un comando vero, e la faccia di chi guarda dice "queste sono
             le tue" meglio di un pallino. I pallini restano sulla card, dove
             sono un'indicazione e non un tasto. */
          action={(
            <div className="mode-switch" role="group" aria-label="Quali partite">
              <button
                className={matchesMode === "mine" ? "active" : ""}
                // Il raccoglitore da aprire lo decide l'effetto qui sopra:
                // cambiando insieme cambiano i mesi, e va riaperto il più
                // recente di quelli nuovi.
                onClick={() => { setMatchesMode("mine"); setChosenMonth(undefined); }}
                aria-label="Solo le mie partite"
                title={currentUserName || "Personale"}
              >
                {/* La faccia di chi guarda al posto di un glifo: dice "queste
                    sono le tue" senza bisogno di una parola. */}
                {currentUser
                  ? <Avatar profile={currentUser} size="sm" />
                  : <NavGlyph name="person" />}
              </button>
              <button
                className={matchesMode === "all" ? "active" : ""}
                onClick={() => { setMatchesMode("all"); setChosenMonth(undefined); }}
                aria-label="Tutte le partite"
                title="Tutte"
              >
                <NavGlyph name="people" />
              </button>
            </div>
          )}
        >
          {/* Un raccoglitore per mese invece di un elenco unico: le partite
              si accumulano, e scorrerne cento per arrivare a maggio non è
              cercare, è rassegnarsi. Aperto uno, gli altri si chiudono. */}
          <div className="month-groups">
            {matchMonths.length ? matchMonths.map((group) => (
              <MonthGroup
                key={group.key}
                label={group.label}
                count={group.matches.length}
                open={openMonth === group.key}
                onToggle={() => setChosenMonth(openMonth === group.key ? null : group.key)}
              >
                <div className="match-list">
                  {group.matches.map((match) => (
                    <MatchCard
                      key={match.id}
                      match={match}
                      onEdit={(selected) => { setSheet(null); setEditingMatch(selected); }}
                      onPlayVideo={(id) => setPlayingVideo(id)}
                      viewerId={session?.user.id}
                    />
                  ))}
                </div>
              </MonthGroup>
            )) : (
              <div className="compact-empty panel-empty">
                <span>00</span>
                <p>{emptyMatchesNote}</p>
              </div>
            )}
          </div>
        </BottomSheet>
      ) : null}
      {sheet === "ranking" ? (
        <BottomSheet
          // Niente selettore di stagione qui dentro: il foglio mostra la
          // stagione in corso e basta. Lo storico troverà casa nel profilo.
          title={rankingMode === "single" ? "Classifica Elo - Singolo" : "Classifica Elo - Squadra"}
          onClose={() => setSheet(null)}
          action={(
            <div className="mode-switch" role="group" aria-label="Tipo di classifica">
              <button
                className={rankingMode === "single" ? "active" : ""}
                // Cambiando tipo di classifica si torna sempre alla stagione
                // in corso: un anno archiviato è un contesto suo.
                onClick={() => { setRankingMode("single"); setSeason(currentYear); }}
                aria-label="Classifica singolo"
                title="Singolo"
              >
                <NavGlyph name="person" />
              </button>
              <button
                className={rankingMode === "team" ? "active" : ""}
                onClick={() => { setRankingMode("team"); setSeason(currentYear); }}
                aria-label="Classifica squadre"
                title="Squadra"
              >
                <NavGlyph name="people" />
              </button>
            </div>
          )}
        >
          {rankingMode === "single" ? (
            <RankingList
              profiles={seasonProfiles}
              showTrend={isCurrentSeason}
              onSelect={(profile) => { setSheet(null); openPlayer(profile); }}
            />
          ) : (
            <TeamRankingList teams={rankedSeasonTeams} showTrend={isCurrentSeason} />
          )}
        </BottomSheet>
      ) : null}
      {showMatch || editingMatch || tournamentMatch ? (
        <NewMatchModal
          profiles={profiles}
          match={editingMatch}
          tournamentContext={tournamentMatch ?? editingTournamentContext}
          onClose={() => { setShowMatch(false); setEditingMatch(null); setTournamentMatch(null); }}
          onSaved={() => void handleSaved()}
        />
      ) : null}
      {showTournamentCreate ? (
        <TournamentCreateModal
          profiles={profiles}
          onClose={() => setShowTournamentCreate(false)}
          onSaved={async () => {
            setShowTournamentCreate(false);
            await loadData();
            setNotice("Torneo creato: calendario e classifica sono pronti.");
          }}
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
