"use client";

import { type PadelMatch, type PadelSet, type Profile } from "@/lib/supabase";
import { GlyphName } from "./ui";

// Le quattro sezioni del gruppo. La home non e una di loro: e lo smistamento
// che le apre, e da li la barra in basso cambia voci.
export type Section = "padel" | "pizza" | "gaming" | "cashout";
export type View = "home" | Section;
export type PadelView = "overview" | "ranking" | "matches" | "tournaments" | "player";
// Pizza e Gaming hanno una pagina principale e una classifica. Cash Out usa
// invece una sola area operativa con gruppi, spese e resoconti.
export type SectionView = "overview" | "ranking";
export type GamingView = "overview" | "mw4" | "mw4-meta" | "mw4-ranking" | "mw4-profile";
export type PizzaRankingMode = "contemporary" | "classic" | "personal";
export type PizzaRankingEntry = {
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

// L'Elo resta decimale nei calcoli e nelle classifiche. Solo il testo visibile
// e arrotondato, simmetricamente per valori positivi e negativi.
export function roundedElo(value: number) {
  return Math.sign(value) * Math.round(Math.abs(value));
}

export function eloLabel(value: number) {
  return String(roundedElo(value));
}

// "oggi", "ieri", "3 giorni fa": conta i giorni di calendario, non le 24 ore,
// cosi una partita di ieri sera resta "ieri" anche alle nove di mattina.
export function lastPlayedLabel(iso: string) {
  const day = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((day(new Date()) - day(new Date(iso))) / 86_400_000);
  if (days <= 0) return "giocato oggi";
  if (days === 1) return "giocato ieri";
  return `giocato ${days} giorni fa`;
}

export function eloDeltaLabel(value: number) {
  const displayed = roundedElo(value);
  return `${displayed > 0 ? "+" : ""}${displayed}`;
}

export type PizzaVote = {
  restaurant_id: string;
  voter_id: string;
  location: number;
  pizza: number;
  dessert: number;
  price: number;
  bonus_fabio: number;
};

export type PizzaRestaurantRecord = {
  id: string;
  name: string;
  place: string | null;
  created_by: string;
  created_at: string;
  votes: PizzaVote[];
};

export type PizzaDisplayEntry = PizzaRankingEntry & {
  id?: string;
  sessionId?: string;
  isNew?: boolean;
  votesCount?: number;
  votes?: PizzaVote[];
  pending?: boolean;
};

export type PizzaSession = {
  id: string;
  restaurant_id: string;
  opened_by: string;
  opened_at: string;
  completed_at: string | null;
  is_solo: boolean;
  average_location: number | null;
  average_pizza: number | null;
  average_dessert: number | null;
  average_price: number | null;
  final_score: number | null;
  participants: PizzaSessionParticipant[];
};

export type PizzaSessionParticipant = {
  voter_id: string;
  voted_at: string | null;
};

export type PizzaSessionVote = {
  session_id: string;
  voter_id: string;
  location: number;
  pizza: number;
  dessert: number;
  price: number;
  bonus_fabio: number;
};

// Ogni criterio si vota da 0 a 10. I pesi storici sommano 31: location 7,
// pizza 10, dolce 4 e prezzo 10. Postgres usa gli stessi rapporti per fissare
// il risultato definitivo; questa copia serve soltanto all'anteprima istantanea.
export const PIZZA_WEIGHTS = { location: 7, pizza: 10, dessert: 4, price: 10 } as const;
export const PIZZA_WEIGHT_TOTAL = 31;
// I quattro criteri nell'ordine delle colonne della classifica.
export const PIZZA_CRITERIA_KEYS = [
  { key: "location", label: "Location", weight: PIZZA_WEIGHTS.location },
  { key: "pizza", label: "Pizza", weight: PIZZA_WEIGHTS.pizza },
  { key: "dessert", label: "Dolce", weight: PIZZA_WEIGHTS.dessert },
  { key: "price", label: "Prezzo", weight: PIZZA_WEIGHTS.price },
] as const;

export function weightedPizzaAverage(vote: { location: number; pizza: number; dessert: number; price: number }) {
  return (
    vote.location * PIZZA_WEIGHTS.location
    + vote.pizza * PIZZA_WEIGHTS.pizza
    + vote.dessert * PIZZA_WEIGHTS.dessert
    + vote.price * PIZZA_WEIGHTS.price
  ) / PIZZA_WEIGHT_TOTAL;
}

export function sessionIsOpen(session: PizzaSession) {
  return session.completed_at === null;
}

export function roundPizzaScore(value: number) {
  return Math.floor(value + 0.5);
}

export function sessionHasFabio(session: PizzaSession, profiles: Profile[]) {
  return session.participants.some(({ voter_id }) => {
    const profile = profiles.find((item) => item.id === voter_id);
    return profile?.display_name.toLowerCase() === "fabio";
  });
}

export function finalPizzaScore(
  votes: PizzaSessionVote[],
  session: PizzaSession,
  profiles: Profile[],
  useStoredResult = true,
) {
  if (useStoredResult && typeof session.final_score === "number") return session.final_score;
  if (!votes.length) return 0;
  const ordinary = weightedPizzaAverage(averagePizzaVotes(votes));
  if (!sessionHasFabio(session, profiles)) {
    return roundPizzaScore(ordinary * 10);
  }
  const fabioId = session.participants.find(({ voter_id }) => (
    profiles.find((profile) => profile.id === voter_id)?.display_name.toLowerCase() === "fabio"
  ))?.voter_id;
  const fabioBonus = votes.find((vote) => vote.voter_id === fabioId)?.bonus_fabio ?? 0;
  return roundPizzaScore(ordinary * 9.3 + fabioBonus);
}

export const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
export const PROFILE_MATCH_PREVIEW = 5;
export const groupUsers = ["Samu", "Dani", "Atti", "Matte", "Fabio", "Alban", "Mattia", "Manu", "Mene"] as const;

// Le sezioni in un posto solo: da qui pescano sia le card della home sia la
// voce centrale della barra, cosi il nome non puo divergere fra i due posti.
export const sections = [
  { key: "padel", label: "Padel", glyph: "racket", claim: "Partite, tornei e ranking Elo." },
  { key: "pizza", label: "Pizza", glyph: "pizza", claim: "Votazioni a fine serata e classifica pizzerie." },
  { key: "gaming", label: "Gaming", glyph: "gamepad", claim: "Sfide multi-gioco e classifica del gruppo." },
  { key: "cashout", label: "Cashout", glyph: "wallet", claim: "Spese condivise e conti da pareggiare." },
] as const satisfies readonly { key: Section; label: string; glyph: GlyphName; claim: string }[];

export function sectionMeta(section: Section) {
  return sections.find((item) => item.key === section) ?? sections[0];
}
export const pizzaRanking: readonly PizzaRankingEntry[] = [
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

export const pizzaCriteria = [
  { label: "Location", max: 10, source: "PESO 7/31", tone: "cyan" },
  { label: "Pizza", max: 10, source: "PESO 10/31", tone: "lime" },
  { label: "Dolce", max: 10, source: "PESO 4/31", tone: "pink" },
  { label: "Prezzo", max: 10, source: "PESO 10/31", tone: "yellow" },
  { label: "Bonus Fabio", max: 7, source: "0–7", tone: "blue" },
] as const;
export const pizzaMedalTones = ["gold", "silver", "bronze"] as const;

export type MvpProgress = {
  match_id: string;
  votes_cast: number;
  total_voters: number;
};

export type MvpMatchState = {
  id: string;
  mvp_voting_enabled: boolean;
  mvp_voting_closed_at: string | null;
  mvps: { profile_id: string; awarded_at: string }[];
};

export type ViewerMvpVote = {
  match_id: string;
  target_id: string;
};

// Le schede storiche erano su scale diverse e comprendevano il bonus Fabio.
// Qui vengono riportate sugli stessi pesi delle nuove, così la classifica ha
// un metro solo: si divide per il vecchio massimo e si moltiplica per il peso.
export const HISTORIC_MAX = { location: 21, pizza: 30, dessert: 12, price: 30 } as const;

export function averagePizzaVotes(votes: PizzaSessionVote[]) {
  return votes.length
    ? {
        location: votes.reduce((sum, vote) => sum + vote.location, 0) / votes.length,
        pizza: votes.reduce((sum, vote) => sum + vote.pizza, 0) / votes.length,
        dessert: votes.reduce((sum, vote) => sum + vote.dessert, 0) / votes.length,
        price: votes.reduce((sum, vote) => sum + vote.price, 0) / votes.length,
      }
    : { location: 0, pizza: 0, dessert: 0, price: 0 };
}

export function sessionPizzaAverage(session: PizzaSession, votes: PizzaSessionVote[], useStoredResult = true) {
  const stored = [
    session.average_location,
    session.average_pizza,
    session.average_dessert,
    session.average_price,
  ];
  if (useStoredResult && stored.every((value) => typeof value === "number")) {
    return {
      location: Number(session.average_location),
      pizza: Number(session.average_pizza),
      dessert: Number(session.average_dessert),
      price: Number(session.average_price),
    };
  }
  return averagePizzaVotes(votes);
}

export function sortPizzaEntries(entries: PizzaDisplayEntry[]) {
  return entries.sort((a, b) => {
    const aReady = !a.pending;
    const bReady = !b.pending;
    if (aReady !== bReady) return aReady ? -1 : 1;
    return b.total - a.total || a.name.localeCompare(b.name, "it");
  });
}

export function buildContemporaryPizzaRanking(
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
  const interactive = restaurants.flatMap((restaurant) => {
    // Di una pizzeria conta l'ultima votazione. Finché non hanno votato tutti,
    // il database non restituisce i voti altrui e il risultato resta sospeso.
    const own = sessions
      .filter((session) => session.restaurant_id === restaurant.id && !session.is_solo)
      .sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime());
    const session = own[0];
    if (!session) return [];
    const votes = session ? sessionVotes.filter((vote) => vote.session_id === session.id) : [];
    const pending = sessionIsOpen(session) || votes.length === 0;

    const average = sessionPizzaAverage(session, votes);

    return [{
      id: restaurant.id,
      sessionId: session.id,
      name: restaurant.name,
      place: restaurant.place ?? undefined,
      ...average,
      fabio: 0,
      total: finalPizzaScore(votes, session, profiles),
      isNew: true,
      pending,
      votesCount: session.participants.filter((participant) => participant.voted_at).length,
    } as PizzaDisplayEntry];
  });

  return sortPizzaEntries([...historical, ...interactive]);
}

export function buildClassicPizzaRanking(
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
      .filter((item) => item.restaurant_id === restaurant.id && !item.is_solo)
      .filter((item) => [...classicIds].every((id) => item.participants.some((participant) => participant.voter_id === id)))
      .sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime())[0];
    if (!session) return [];
    const votes = sessionVotes.filter(
      (vote) => vote.session_id === session.id && classicIds.has(vote.voter_id),
    );
    const pending = sessionIsOpen(session) || votes.length !== 3;
    return [{
      id: restaurant.id,
      sessionId: session.id,
      name: restaurant.name,
      place: restaurant.place ?? undefined,
      ...sessionPizzaAverage(session, votes, false),
      fabio: votes.find((vote) => (
        profiles.find((profile) => profile.id === vote.voter_id)?.display_name.toLowerCase() === "fabio"
      ))?.bonus_fabio ?? 0,
      total: pending ? 0 : finalPizzaScore(votes, session, profiles, false),
      isNew: true,
      pending,
      votesCount: votes.length,
    } as PizzaDisplayEntry];
  });

  return sortPizzaEntries([...historical, ...interactive]);
}

export function buildPersonalPizzaRanking(
  restaurants: PizzaRestaurantRecord[],
  sessions: PizzaSession[],
  sessionVotes: PizzaSessionVote[],
  profiles: Profile[],
  viewerId: string,
): PizzaDisplayEntry[] {
  const personal = restaurants.flatMap((restaurant) => {
    const session = sessions
      .filter((item) => (
        item.restaurant_id === restaurant.id
        && item.is_solo
        && item.opened_by === viewerId
      ))
      .sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime())[0];
    if (!session) return [];

    const votes = sessionVotes.filter(
      (vote) => vote.session_id === session.id && vote.voter_id === viewerId,
    );
    const pending = sessionIsOpen(session) || votes.length === 0;

    return [{
      id: restaurant.id,
      sessionId: session.id,
      name: restaurant.name,
      place: restaurant.place ?? undefined,
      ...sessionPizzaAverage(session, votes),
      fabio: votes[0]?.bonus_fabio ?? 0,
      total: pending ? 0 : finalPizzaScore(votes, session, profiles),
      isNew: true,
      pending,
      votesCount: votes.length,
    } as PizzaDisplayEntry];
  });

  return sortPizzaEntries(personal);
}

export function initials(name: string) {
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
export const PADEL_COURTS = [
  "DON QUIQUE - IMPERIA",
  "QUPOLA - PONTEDASSIO",
  "ONEGLIA PADEL - CASTELVECCHIO",
  "CORCUERA - IMPERIA",
  "RIVIERA PADEL - SAN LORENZO",
  "DIANO PADEL - DIANO MARINA",
];

// Un set finito ha un vincitore: sei giochi con due di scarto, oppure il 7-6
// del tie-break. Tutto il resto — 2-1, 4-4, 5-3 — e un set lasciato a meta
// perche il campo e scaduto. Il set interrotto resta nello storico,
// ma non assegna ne una vittoria ne punti Elo.
export function setIsComplete(team1Games: number, team2Games: number) {
  const high = Math.max(team1Games, team2Games);
  const low = Math.min(team1Games, team2Games);
  return (high >= 6 && high - low >= 2) || (high === 7 && low === 6);
}

// In lettura ci si fida solo del flag salvato: le partite registrate prima
// della migrazione hanno tutti i set completi per costruzione, e ricalcolare
// la regola su quei dati vecchi rischierebbe di riscrivere risultati chiusi.
export function setIsIncomplete(set: PadelSet) {
  return set.incomplete === true;
}

export function matchIsDraw(match: PadelMatch) {
  return match.winner_team === 0;
}

// Il win rate descrive soltanto le partite che hanno prodotto un vincitore:
// i pareggi non sono né vittorie né sconfitte e restano fuori dal denominatore.
//
// Prende due numeri e non il profilo intero di proposito: passare l'oggetto
// fa credere al compilatore di React che la funzione possa modificarlo, e i
// memo che lo usano smettono di essere ottimizzati.
export function padelWinRateRatio(wins: number, losses: number) {
  const decidedMatches = wins + losses;
  return decidedMatches ? wins / decidedMatches : 0;
}

export function padelWinRate(wins: number, losses: number) {
  return Math.round(padelWinRateRatio(wins, losses) * 100);
}

// Nel meglio dei tre un eventuale terzo set storico giocato dopo il 2-0
// resta visibile, ma non appartiene piu alla partita.
export function countedSets(sets: PadelSet[]) {
  const counted: PadelSet[] = [];
  let team1Wins = 0;
  let team2Wins = 0;
  for (const set of [...sets].sort((a, b) => a.set_number - b.set_number)) {
    if (team1Wins === 2 || team2Wins === 2) break;
    counted.push(set);
    if (setIsIncomplete(set)) continue;
    if (set.team1_games > set.team2_games) team1Wins += 1;
    if (set.team2_games > set.team1_games) team2Wins += 1;
  }
  return counted;
}

// Solo i set conclusi prima che una squadra arrivi a due contano nell'Elo
// e nelle statistiche sui set. Il set interrotto resta nel referto.
export function decidedSets(sets: PadelSet[]) {
  return countedSets(sets).filter((set) => !setIsIncomplete(set));
}

export function sortPadelProfiles(profiles: Profile[]) {
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
export const heroSalutes = {
  // "GOAT" spetta solo a chi comanda, "Gancio" solo a chi chiude.
  first: ["Ciao {nome},", "Ciao GOAT,"],
  last: ["Ciao {nome},", "Ciao Gancio,"],
  any: ["Ciao {nome},"],
} as const;

export function heroSalutePool(rank: number, isLast: boolean) {
  if (rank === 0) return heroSalutes.any;
  if (isLast) return heroSalutes.last;
  if (rank === 1) return heroSalutes.first;
  return heroSalutes.any;
}

// Le frasi sotto la barra. Sono gia senza saluto e con l'iniziale
// maiuscola: cosi non c'e niente da ritagliare o correggere a video.
export const heroGreetings = {
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
export function heroGreetingPool(rank: number, isLast: boolean, hasNarrowLead: boolean) {
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
export function padelRanks(sorted: Profile[]) {
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

export type SeasonStanding = {
  season: number;
  profile_id: string;
  position: number;
  rating: number;
  matches_played: number;
  wins: number;
  losses: number;
  current_streak: number;
};

export type PadelTeamRecord = {
  id: string;
  player_a: string;
  player_b: string;
  name: string | null;
  image_path: string | null;
  image_url?: string | null;
};

export type PadelTeam = {
  id: string;
  players: Profile[];
  // Nullo quando nessuno dei due ha ancora giocato: il 1000 di partenza non e
  // un punteggio, e il posto vuoto prima del primo risultato. Si legge N/C,
  // come per il singolo non classificato.
  rating: number | null;
  matches_played: number;
  wins: number;
  losses: number;
  draws: number;
  current_streak: number;
  name?: string | null;
  imageUrl?: string | null;
  // La coppia e stata formata davvero: esiste una riga in padel_teams, creata
  // da uno dei due. Le coppie che hanno solo giocato insieme senza formarsi
  // restano nei risultati e nello storico, ma non sono squadre di nessuno e
  // non compaiono nelle schede.
  isSaved: boolean;
  // In classifica ci va la squadra formata che ha giocato almeno una volta.
  // Il nome da solo non basta piu: senza partite si riempirebbe la classifica
  // di coppie inventate, ordinate su una media di punti mai messa alla prova.
  isRanked: boolean;
};

// La forza di una coppia e la media dei due, ma un giocatore senza partite non
// ha un punteggio da mediare: vale il punteggio di chi ce l'ha, e se non ce
// l'ha nessuno dei due non c'e niente da dire.
export function teamRating(players: Profile[]) {
  const rated = players.filter((profile) => profile.matches_played > 0);
  if (!rated.length) return null;
  return rated.reduce((sum, profile) => sum + profile.rating, 0) / rated.length;
}

export function teamRatingLabel(team: PadelTeam) {
  return team.rating === null ? "N/C" : eloLabel(team.rating);
}

// Le coppie da mettere in classifica: quelle battezzate. Le altre restano
// nella scheda del giocatore, che e il posto da cui si danno i nomi.
export function rankedPadelTeams(teams: PadelTeam[]) {
  return teams.filter((team) => team.isRanked);
}

export function teamLabel(team: PadelTeam) {
  return team.name?.trim() || team.players.map((profile) => profile.display_name).join(" · ");
}

// Le coppie non stanno su Supabase: le ricaviamo dalle partite già registrate,
// così una squadra nuova entra in classifica da sola al primo risultato.
// Da padel_teams arrivano soltanto nome e immagine scelti dai due membri.
export function buildPadelTeams(
  matches: PadelMatch[],
  profiles: Profile[],
  records: PadelTeamRecord[] = [],
): PadelTeam[] {
  const meta = new Map(records.map((record) => [`${record.player_a}|${record.player_b}`, record]));
  const byId = new Map(profiles.map((profile) => [profile.id, profile]));
  const teams = new Map<string, PadelTeam>();
  const chronological = matches.filter((match) => !match.is_friendly).sort(
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
          isSaved: Boolean(record),
          isRanked: Boolean(record?.name?.trim()),
        });
      }
    });
  });

  // Le coppie formate che non hanno ancora giocato. Non escono dalle partite —
  // partite non ne hanno — ma esistono lo stesso: qualcuno le ha messe
  // insieme, e devono comparire nella sua scheda con zero partite.
  records.forEach((record) => {
    const key = `${record.player_a}|${record.player_b}`;
    if (teams.has(key)) return;
    const players = [record.player_a, record.player_b].map((id) => byId.get(id)).filter(Boolean) as Profile[];
    if (players.length !== 2) return;
    teams.set(key, {
      id: key,
      players,
      rating: null,
      matches_played: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      current_streak: 0,
      name: record.name ?? null,
      imageUrl: record.image_url ?? null,
      isSaved: true,
      isRanked: false,
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
      rating: teamRating(team.players),
      // Il nome fa entrare in classifica, ma solo dopo la prima partita.
      isRanked: team.isRanked && team.matches_played > 0,
    }))
    .sort(
      (a, b) =>
        (b.rating ?? -1) - (a.rating ?? -1) ||
        a.players[0].display_name.localeCompare(b.players[0].display_name, "it"),
    );
}

export function ranksByRating(items: { rating: number | null }[]) {
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

export function teamSides(team: PadelTeam) {
  const sides = team.players.map((profile) =>
    profile.court_side === "sinistra" ? "Rovescio" : profile.court_side === "destra" ? "Dritto" : null,
  );
  return sides.every(Boolean) ? sides.join(" / ") : null;
}

export function rankOf(sorted: Profile[], profileId?: string) {
  if (!profileId) return 0;
  const index = sorted.findIndex((profile) => profile.id === profileId);
  return index < 0 ? 0 : padelRanks(sorted)[index];
}

// In padel il lato di campo si chiama dritto (destra) e rovescio (sinistra).
export function padelTraits(profile: Profile) {
  const hand = profile.handedness === "mancino" ? "Mancino" : profile.handedness === "destro" ? "Destro" : null;
  const side = profile.court_side === "sinistra" ? "Rovescio" : profile.court_side === "destra" ? "Dritto" : null;
  const parts = [hand, side].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}
