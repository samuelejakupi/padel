"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
};

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const groupUsers = ["Samu", "Dani", "Atti", "Matte", "Fabio", "Alban", "Mattia", "Manu"] as const;
const pizzaEditors = ["Samu", "Fabio", "Dani"] as const;
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
  { label: "Location", max: 21, source: "3 × 0–7", tone: "cyan" },
  { label: "Pizza", max: 30, source: "3 × 0–10", tone: "lime" },
  { label: "Dolce", max: 12, source: "3 × 0–4", tone: "pink" },
  { label: "Prezzo", max: 30, source: "3 × 0–10", tone: "yellow" },
  { label: "Bonus Fabio", max: 7, source: "0–7", tone: "blue" },
] as const;

function canManagePizza(displayName: string, email?: string | null) {
  const normalizedEmail = email?.toLowerCase();
  return normalizedEmail === "samu@theboyz.local" || normalizedEmail === "fabio@theboyz.local" || normalizedEmail === "dani@theboyz.local"
    || pizzaEditors.includes(displayName as (typeof pizzaEditors)[number]);
}

function buildPizzaRanking(restaurants: PizzaRestaurantRecord[]): PizzaDisplayEntry[] {
  const historical: PizzaDisplayEntry[] = pizzaRanking.map((entry) => ({ ...entry, isNew: false, votesCount: 3 }));
  const interactive = restaurants.map((restaurant) => {
    const votes = restaurant.votes ?? [];
    const totals = votes.reduce(
      (sum, vote) => ({
        location: sum.location + vote.location,
        pizza: sum.pizza + vote.pizza,
        dessert: sum.dessert + vote.dessert,
        price: sum.price + vote.price,
        fabio: sum.fabio + vote.bonus_fabio,
      }),
      { location: 0, pizza: 0, dessert: 0, price: 0, fabio: 0 },
    );
    return {
      id: restaurant.id,
      name: restaurant.name,
      place: restaurant.place ?? undefined,
      location: totals.location,
      pizza: totals.pizza,
      dessert: totals.dessert,
      price: totals.price,
      fabio: totals.fabio,
      total: totals.location + totals.pizza + totals.dessert + totals.price + totals.fabio,
      isNew: true,
      votesCount: votes.length,
      votes,
    };
  });

  return [...historical, ...interactive].sort((a, b) => {
    const aComplete = !a.isNew || a.votesCount === 3;
    const bComplete = !b.isNew || b.votesCount === 3;
    if (aComplete !== bComplete) return aComplete ? -1 : 1;
    return b.total - a.total || a.name.localeCompare(b.name, "it");
  });
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
const heroGreetings = {
  first: [
    "Ciao {nome}, bella giornata per stare al top!",
    "Ciao GOAT, quanto brucia agli altri?",
    "Fino a un mese fa non ti voleva nemmeno tua madre e ora guardati!",
  ],
  second: [
    "Ciao {nome}, manca poco alla vetta.",
    "Non mollare, ci sei quasi!",
  ],
  third: [
    "Ciao {nome}, comunque a podio, non male!",
    "Allora? Scaliamo o scendiamo?",
  ],
  fourth: [
    "Ti giuro che siamo arrivati, il podio è lì davanti.",
    "Ciao {nome}, ancora uno sforzo dai!",
  ],
  rest: [
    "Ciao {nome}, quanto fa freddo qua giù?",
    "Per Natale ci siamo a podio?",
  ],
  last: [
    "Ciao {nome}, mai pensato di darti all'ippica?",
    "Sei proprio un gancio!",
  ],
  narrowLead: [
    "Sei un intenditore di ippica, musetto davanti, bravo!",
  ],
  unranked: [
    "Pronto a difendere la posizione?",
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
function padelRanks(sorted: Profile[]) {
  let lastRating: number | null = null;
  let lastRank = 0;
  return sorted.map((profile, index) => {
    if (profile.matches_played === 0) return 0;
    if (lastRating !== null && profile.rating === lastRating) return lastRank;
    lastRating = profile.rating;
    lastRank = index + 1;
    return lastRank;
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
  let lastRank = 0;
  return items.map((item, index) => {
    if (lastRating !== null && item.rating === lastRating) return lastRank;
    lastRating = item.rating;
    lastRank = index + 1;
    return lastRank;
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

type GlyphName = "home" | "ranking" | "racket" | "pizza";

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
        <img src={`${basePath}/theboyz-mark.png`} alt="TheBoyz" width={108} height={108} />
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
// Trofei e record
//
// Due famiglie diverse. I trofei sono soglie personali: li prende chiunque le
// superi, e quello più alto sostituisce i precedenti (chi ha 15 vittorie non
// mostra anche 10 e 5). I record sono comparativi: li tiene solo chi guida la
// classifica di quella statistica, e in caso di parità li tengono in due.
// Tutto si calcola qui dai dati già caricati: niente da salvare, niente da
// aggiornare a mano, e le soglie si spostano da sole quando qualcuno cresce.
// ---------------------------------------------------------------------------

type BadgeTone = "gold" | "red" | "plain";
type BadgeGlyph = "flame" | "trophy" | "medal" | "chart" | "shield" | "down";

type Badge = {
  id: string;
  tone: BadgeTone;
  glyph: BadgeGlyph;
  label: string;
  detail: string;
};

// Storia di un giocatore in ordine cronologico: esito e Elo dopo ogni partita.
type PlayerHistory = {
  results: boolean[];
  ratings: number[];
  peak: number;
  low: number;
  bestWinStreak: number;
  bestLoseStreak: number;
};

function playerHistory(profile: Profile, matches: PadelMatch[]): PlayerHistory {
  const own = [...matches]
    .filter((match) => match.players.some((player) => player.profile_id === profile.id))
    .sort((a, b) =>
      new Date(a.played_at).getTime() - new Date(b.played_at).getTime()
      || new Date(a.created_at ?? a.played_at).getTime() - new Date(b.created_at ?? b.played_at).getTime()
      || a.id.localeCompare(b.id),
    );

  const results = own.map((match) => {
    const side = match.players.find((player) => player.profile_id === profile.id)?.team;
    return match.winner_team === side;
  });

  // L'Elo attuale è il punto di arrivo: si risale all'indietro sottraendo i
  // delta, così la serie non dipende da nessuno storico salvato.
  const deltas = own.map(
    (match) => match.players.find((player) => player.profile_id === profile.id)?.rating_delta ?? 0,
  );
  const ratings: number[] = [];
  let running = profile.rating;
  for (let index = deltas.length - 1; index >= 0; index -= 1) {
    ratings.unshift(running);
    running -= deltas[index];
  }
  ratings.unshift(running);

  let bestWinStreak = 0;
  let bestLoseStreak = 0;
  let winRun = 0;
  let loseRun = 0;
  for (const won of results) {
    winRun = won ? winRun + 1 : 0;
    loseRun = won ? 0 : loseRun + 1;
    bestWinStreak = Math.max(bestWinStreak, winRun);
    bestLoseStreak = Math.max(bestLoseStreak, loseRun);
  }

  return {
    results,
    ratings,
    peak: ratings.length ? Math.max(...ratings) : profile.rating,
    low: ratings.length ? Math.min(...ratings) : profile.rating,
    bestWinStreak,
    bestLoseStreak,
  };
}

// Scalino inferiore più vicino: 1287 con passo 25 diventa 1275.
function stepDown(value: number, step: number) {
  return Math.floor(value / step) * step;
}

function playerTrophies(profile: Profile, history: PlayerHistory): Badge[] {
  const badges: Badge[] = [];

  if (history.peak >= 1250) {
    const step = stepDown(history.peak, 25);
    badges.push({
      id: "elo",
      tone: "gold",
      glyph: "chart",
      label: `${step} ELO`,
      detail: `Massimo toccato: ${history.peak}`,
    });
  } else if (history.peak >= 1125) {
    badges.push({ id: "elo", tone: "plain", glyph: "chart", label: "1125 ELO", detail: `Massimo toccato: ${history.peak}` });
  }

  if (profile.matches_played >= 20) {
    const step = stepDown(profile.matches_played, 5);
    badges.push({ id: "matches", tone: "gold", glyph: "shield", label: `${step} PARTITE`, detail: `${profile.matches_played} giocate` });
  } else if (profile.matches_played >= 15) {
    badges.push({ id: "matches", tone: "plain", glyph: "shield", label: "15 PARTITE", detail: `${profile.matches_played} giocate` });
  } else if (profile.matches_played >= 10) {
    badges.push({ id: "matches", tone: "plain", glyph: "shield", label: "10 PARTITE", detail: `${profile.matches_played} giocate` });
  }

  if (profile.wins >= 15) {
    const step = stepDown(profile.wins, 5);
    badges.push({ id: "wins", tone: "gold", glyph: "trophy", label: `${step} VITTORIE`, detail: `${profile.wins} vinte in totale` });
  } else if (profile.wins >= 10) {
    badges.push({ id: "wins", tone: "gold", glyph: "trophy", label: "10 VITTORIE", detail: `${profile.wins} vinte in totale` });
  } else if (profile.wins >= 5) {
    badges.push({ id: "wins", tone: "plain", glyph: "trophy", label: "5 VITTORIE", detail: `${profile.wins} vinte in totale` });
  }

  if (history.bestWinStreak >= 5) {
    badges.push({
      id: "streak",
      tone: "gold",
      glyph: "flame",
      label: `${history.bestWinStreak} DI FILA`,
      detail: "Serie di vittorie consecutive",
    });
  }

  return badges;
}

// I record guardano tutti gli altri: si vincono, non si raggiungono.
function playerRecords(
  profile: Profile,
  profiles: Profile[],
  matches: PadelMatch[],
  history: PlayerHistory,
): Badge[] {
  const badges: Badge[] = [];
  const others = profiles.filter((other) => other.id !== profile.id);
  const historyOf = new Map(profiles.map((item) => [item.id, playerHistory(item, matches)]));
  const eligible = (item: Profile) => item.matches_played >= 5;

  const leads = (value: number, pick: (item: Profile) => number, filter = (_: Profile) => true) =>
    others.filter(filter).every((other) => pick(other) <= value);

  if (history.bestWinStreak > 0 && leads(history.bestWinStreak, (other) => historyOf.get(other.id)?.bestWinStreak ?? 0)) {
    badges.push({
      id: "record-streak",
      tone: "gold",
      glyph: "flame",
      label: "SERIE PIÙ LUNGA",
      detail: `${history.bestWinStreak} vittorie consecutive`,
    });
  }

  if (eligible(profile) && profile.wins > 0 && leads(profile.wins, (other) => (eligible(other) ? other.wins : 0))) {
    badges.push({ id: "record-wins", tone: "gold", glyph: "medal", label: "PIÙ VITTORIE", detail: `${profile.wins} in totale` });
  }

  if (history.peak >= 1050 && leads(history.peak, (other) => historyOf.get(other.id)?.peak ?? 0)) {
    badges.push({ id: "record-elo", tone: "gold", glyph: "chart", label: "ELO PIÙ ALTO", detail: `Picco a ${history.peak}` });
  }

  if (
    eligible(profile)
    && history.bestLoseStreak > 0
    && leads(history.bestLoseStreak, (other) => (eligible(other) ? historyOf.get(other.id)?.bestLoseStreak ?? 0 : 0))
  ) {
    badges.push({
      id: "record-lose-streak",
      tone: "red",
      glyph: "down",
      label: "PEGGIOR SERIE",
      detail: `${history.bestLoseStreak} sconfitte consecutive`,
    });
  }

  if (eligible(profile) && profile.losses > 0 && leads(profile.losses, (other) => (eligible(other) ? other.losses : 0))) {
    badges.push({ id: "record-losses", tone: "red", glyph: "down", label: "PIÙ SCONFITTE", detail: `${profile.losses} in totale` });
  }

  // Qui vince chi sta più in basso, quindi il confronto si rovescia.
  const lowestOthers = others
    .map((other) => historyOf.get(other.id)?.low ?? Number.POSITIVE_INFINITY)
    .filter((value) => Number.isFinite(value));
  if (history.low <= 999 && lowestOthers.every((value) => value >= history.low)) {
    badges.push({ id: "record-low", tone: "red", glyph: "down", label: "ELO PIÙ BASSO", detail: `Minimo a ${history.low}` });
  }

  return badges;
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
      {name === "medal" ? (
        <>
          <circle cx="12" cy="14.6" r="5.6" />
          <path d="m8.6 9.4-2.5-6h11.8l-2.5 6" />
          <path d="m12 11.9 1.05 2.13 2.35.34-1.7 1.66.4 2.34L12 17.3l-2.1 1.07.4-2.34-1.7-1.66 2.35-.34z" />
        </>
      ) : null}
      {name === "flame" ? (
        <path d="M12 2.9c3.4 3 5.1 5.5 5.1 7.6 0 1.2-.5 2.2-1.4 2.9.3-1.7-.4-3.2-2-4.6.2 3-1 4.5-2.4 5.7-1 .9-1.6 1.8-1.6 3 0 .6.2 1.2.5 1.7-2.1-.9-3.5-2.9-3.5-5.4 0-2.1 1-3.9 2.4-5.5-.1 1.2.2 2.1.9 2.7.5-3.6 1.4-6.2 2-8.1Z" />
      ) : null}
      {name === "chart" ? (
        <>
          <path d="M3.4 20.3h17.2" />
          <path d="m4.6 15.6 4.5-4.6 3.5 3.3 6.6-7" />
          <path d="M15.4 7.3h3.8v3.8" />
        </>
      ) : null}
      {name === "shield" ? (
        <path d="M12 3.1 4.9 5.9v5.6c0 4.1 2.9 7.6 7.1 9 4.2-1.4 7.1-4.9 7.1-9V5.9z" />
      ) : null}
      {name === "down" ? (
        <>
          <path d="M3.4 4.2h17.2" />
          <path d="m4.6 8.6 4.5 4.6 3.5-3.3 6.6 7" />
          <path d="M15.4 16.9h3.8v-3.8" />
        </>
      ) : null}
    </svg>
  );
}

function BadgeList({ badges }: { badges: Badge[] }) {
  return (
    <div className="badge-grid">
      {badges.map((badge) => (
        <article className={`badge badge-${badge.tone}`} key={badge.id} title={badge.detail}>
          <span className="badge-icon"><BadgeGlyphIcon name={badge.glyph} /></span>
          <div className="badge-text">
            <b>{badge.label}</b>
            <span>{badge.detail}</span>
          </div>
        </article>
      ))}
    </div>
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

function TeamRankingList({ teams }: { teams: PadelTeam[] }) {
  const ranks = ranksByRating(teams);
  return (
    <div className="ranking-table ranking-table-team">
      {teams.map((team, index) => {
        const winRate = team.matches_played ? Math.round((team.wins / team.matches_played) * 100) : 0;
        return (
          <div className="ranking-row" key={team.id}>
            <span className={`rank-number rank-${ranks[index]}`}>{ranks[index]}</span>
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

function RankingList({
  profiles,
  expanded = false,
  onSelect,
}: {
  profiles: Profile[];
  expanded?: boolean;
  onSelect?: (profile: Profile) => void;
}) {
  const sorted = sortPadelProfiles(profiles);
  const ranks = padelRanks(sorted);
  return (
    <div className={expanded ? "ranking-table" : "ranking-list"}>
      {sorted.map((profile, index) => {
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
        return onSelect ? (
          <button
            type="button"
            className={`ranking-row ranking-row-link ${isRanked ? "" : "unranked"}`}
            key={profile.id}
            onClick={() => onSelect(profile)}
            aria-label={`Apri la scheda di ${profile.display_name}`}
          >
            {content}
          </button>
        ) : (
          <div className={`ranking-row ${isRanked ? "" : "unranked"}`} key={profile.id}>
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

function PizzaCreateModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [place, setPlace] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !name.trim()) return;
    setBusy(true);
    setError("");
    const { error: rpcError } = await supabase.rpc("create_pizza_restaurant", {
      p_name: name.trim(),
      p_place: place.trim() || null,
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
          <div><p className="eyebrow dark">NUOVA SCHEDA</p><h2 id="pizza-create-title">Aggiungi pizzeria</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Chiudi">×</button>
        </div>
        <form onSubmit={submit}>
          <label>Nome pizzeria<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Es. La Nuova Pala" maxLength={80} required /></label>
          <label>Località <span className="optional-label">facoltativa</span><input value={place} onChange={(event) => setPlace(event.target.value)} placeholder="Es. Sanremo" maxLength={80} /></label>
          {error ? <p className="form-message error">{error}</p> : null}
          <div className="modal-actions">
            <button type="button" className="button button-ghost" onClick={onClose}>Annulla</button>
            <button className="button button-primary" disabled={busy}>{busy ? "Creazione…" : "Crea pizzeria"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function PizzaVoteModal({
  restaurant,
  voter,
  onClose,
  onSaved,
}: {
  restaurant: PizzaRestaurantRecord;
  voter: Profile;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const previous = restaurant.votes?.find((vote) => vote.voter_id === voter.id);
  const [scores, setScores] = useState({
    location: previous?.location?.toString() ?? "",
    pizza: previous?.pizza?.toString() ?? "",
    dessert: previous?.dessert?.toString() ?? "",
    price: previous?.price?.toString() ?? "",
    fabio: previous?.bonus_fabio?.toString() ?? "0",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isFabio = voter.display_name.toLowerCase() === "fabio";

  function updateScore(key: keyof typeof scores, value: string) {
    setScores((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    const values = [scores.location, scores.pizza, scores.dessert, scores.price];
    if (values.some((value) => value === "")) {
      setError("Compila tutti i punteggi prima di salvare.");
      return;
    }
    setBusy(true);
    setError("");
    const { error: rpcError } = await supabase.rpc("save_pizza_vote", {
      p_restaurant_id: restaurant.id,
      p_location: Number(scores.location),
      p_pizza: Number(scores.pizza),
      p_dessert: Number(scores.dessert),
      p_price: Number(scores.price),
      p_bonus_fabio: isFabio ? Number(scores.fabio || 0) : 0,
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
      <section className="modal pizza-vote-modal" role="dialog" aria-modal="true" aria-labelledby="pizza-vote-title">
        <div className="modal-head">
          <div><p className="eyebrow dark">VOTO DI {voter.display_name.toUpperCase()}</p><h2 id="pizza-vote-title">{restaurant.name}</h2><p className="modal-subtitle">Il totale finale nasce dalla somma dei tre voti.</p></div>
          <button className="icon-button" onClick={onClose} aria-label="Chiudi">×</button>
        </div>
        <form onSubmit={submit}>
          <div className="pizza-vote-fields">
            <label>Location <small>0–7</small><input type="number" min="0" max="7" value={scores.location} onChange={(event) => updateScore("location", event.target.value)} required /></label>
            <label>Pizza <small>0–10</small><input type="number" min="0" max="10" value={scores.pizza} onChange={(event) => updateScore("pizza", event.target.value)} required /></label>
            <label>Dolce <small>0–4</small><input type="number" min="0" max="4" value={scores.dessert} onChange={(event) => updateScore("dessert", event.target.value)} required /></label>
            <label>Prezzo <small>0–10</small><input type="number" min="0" max="10" value={scores.price} onChange={(event) => updateScore("price", event.target.value)} required /></label>
            {isFabio ? <label>Bonus Fabio <small>0–7</small><input type="number" min="0" max="7" value={scores.fabio} onChange={(event) => updateScore("fabio", event.target.value)} /></label> : null}
          </div>
          {!isFabio ? <p className="pizza-vote-hint">Il Bonus Fabio verrà aggiunto da Fabio.</p> : null}
          {error ? <p className="form-message error">{error}</p> : null}
          <div className="modal-actions">
            <button type="button" className="button button-ghost" onClick={onClose}>Annulla</button>
            <button className="button button-primary" disabled={busy}>{busy ? "Salvataggio…" : previous ? "Aggiorna voto" : "Salva voto"}</button>
          </div>
        </form>
      </section>
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
  const [showPizzaCreate, setShowPizzaCreate] = useState(false);
  const [votingRestaurant, setVotingRestaurant] = useState<PizzaRestaurantRecord | null>(null);
  const [pizzaSchemaReady, setPizzaSchemaReady] = useState(true);
  const [editingMatch, setEditingMatch] = useState<PadelMatch | null>(null);
  const [showProfileEdit, setShowProfileEdit] = useState(false);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const avatarFileRef = useRef<HTMLInputElement>(null);
  const [rankingMode, setRankingMode] = useState<"single" | "team">("single");
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

    const [profilesResult, matchesResult, pizzaResult, teamsResult, seasonsResult, playsResult, courtsResult] = await Promise.all([
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
  const singleRanks = useMemo(() => padelRanks(rankedProfiles), [rankedProfiles]);
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
  const playerTeams = useMemo(
    () => teams.filter((team) => team.players.some((profile) => profile.id === selectedPlayerId)),
    [teams, selectedPlayerId],
  );
  const teamRanks = useMemo(() => ranksByRating(teams), [teams]);
  const pizzaEntries = useMemo(() => buildPizzaRanking(pizzaRestaurants), [pizzaRestaurants]);
  const currentUser = profiles.find((profile) => profile.id === session?.user.id);
  const currentUserCanManagePizza = currentUser ? canManagePizza(currentUser.display_name, session?.user.email) : false;
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
  // I record confrontano tutti con tutti: il calcolo va fatto una volta sola.
  const selectedPlayerBadges = useMemo(() => {
    if (!selectedPlayer) return [];
    const history = playerHistory(selectedPlayer, matches);
    return [
      ...playerRecords(selectedPlayer, profiles, matches, history),
      ...playerTrophies(selectedPlayer, history),
    ];
  }, [selectedPlayer, profiles, matches]);
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

  const navItems = useMemo(() => ([
    { key: "overview", glyph: "home", label: "Home", active: view === "padel" && padelView === "overview", select: () => { setView("padel"); setPadelView("overview"); } },
    { key: "matches", glyph: "racket", label: "Matches", active: view === "padel" && padelView === "matches", select: () => { setView("padel"); setPadelView("matches"); } },
    { key: "ranking", glyph: "ranking", label: "Ranking", active: view === "padel" && padelView === "ranking", select: () => { setView("padel"); setPadelView("ranking"); } },
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
    const line = (pool[Math.floor(greetingSeed * pool.length)] ?? pool[0] ?? "")
      .replace("{nome}", currentUser?.display_name ?? "");
    // "Ciao Dani, ..." va spezzato per tenere il saluto in evidenza e il
    // resto in chiaro, come prima. Le frasi senza saluto restano intere.
    const opening = line.match(/^(Ciao[^,]*,)\s*(.*)$/);
    return opening ? { lead: opening[1], rest: opening[2] } : { lead: "", rest: line };
  }, [currentRank, isLastRanked, hasNarrowLead, currentUser?.display_name, greetingSeed]);
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

  async function handlePizzaSaved(message: string) {
    setShowPizzaCreate(false);
    setVotingRestaurant(null);
    await loadData();
    setNotice(message);
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
            className={view === "padel" && padelView === "overview" ? "active" : ""}
            onClick={goHome}
          >
            Home
          </button>
          <button
            className={view === "padel" && padelView === "matches" ? "active" : ""}
            onClick={() => { setView("padel"); setPadelView("matches"); }}
          >
            Matches
          </button>
          <button
            className={view === "padel" && padelView === "ranking" ? "active" : ""}
            onClick={() => { setView("padel"); setPadelView("ranking"); }}
          >
            Ranking
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
                    <h1 className="hero-greeting">
                      {heroGreeting.lead ? <>{heroGreeting.lead}<br /></> : null}
                      <span>{heroGreeting.rest}</span>
                    </h1>
                    <p className="eyebrow">LA TUA POSIZIONE</p>
                    <div className="position">{currentRank ? <><span>#</span>{currentRank}</> : "N/C"}</div>
                    <p>
                      {currentRank === 0
                        ? "Gioca la prima partita per entrare nella classifica."
                        : currentRank === 1
                          ? "Sei in testa alla classifica."
                          : <>Sei a <b>{pointsToNext} punti</b> dal prossimo posto.</>}
                    </p>
                    <div className="progress-track"><span style={{ width: `${currentRank ? Math.min(92, 48 + winRate / 2) : 0}%` }} /></div>
                    <small>{currentRank ? `Continua così: ${currentUser.current_streak > 0 ? `${currentUser.current_streak} vittorie consecutive` : "la prossima è quella buona"}.` : "Il ranking si attiva dopo il primo risultato."}</small>
                  </div>
                  <div className="hero-player">
                    <Avatar profile={currentUser} size="xl" rank={currentRank || undefined} />
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
                    <button className="button button-ghost cta-see-all-top" aria-label="Vedi tutte le partite" onClick={() => setPadelView("matches")}>Vedi tutto</button>
                  </div>
                </div>
                {matches.length ? (
                  // Su mobile la lista sfuma verso il basso e il tasto ci
                  // finisce sopra: vedi .fade-stack in globals.css.
                  <div className="fade-stack">
                    <div className="match-list fade-stack-body">
                      {matches.slice(0, 2).map((match, index) => (
                        <MatchCard
                          key={match.id}
                          match={match}
                          // Solo la prima card apre la modifica. La seconda e
                          // mezza coperta dalla sfumatura e dal tasto: toccarla
                          // porta all'elenco completo, dove si vede per intero.
                          onEdit={index === 0
                            ? (selected) => setEditingMatch(selected)
                            : () => setPadelView("matches")}
                          actionLabel={index === 0 ? undefined : "Vedi tutte le partite"}
                          onPlayVideo={(id) => setPlayingVideo(id)}
                      viewerId={session?.user.id}
                        />
                      ))}
                    </div>
                    <button className="button button-ghost button-full cta-see-all-bottom" aria-label="Vedi tutte le partite" onClick={() => setPadelView("matches")}>Vedi tutto</button>
                  </div>
                ) : (
                  <div className="compact-empty"><span>00</span><p>Nessuna partita registrata. La prima scriverà la storia.</p></div>
                )}
              </div>

              <aside className="dashboard-side">
                <div className="side-head">
                  <div><p className="eyebrow dark">TOP PLAYERS</p><h2>Ranking</h2></div>
                  <SeasonPicker
                    value={season}
                    options={[currentYear, ...archivedSeasons.filter((year) => year !== currentYear)]}
                    onChange={setSeason}
                  />
                </div>
                <div className="fade-stack">
                  <div className="fade-stack-body">
                    <RankingList profiles={seasonProfiles} onSelect={openPlayer} />
                  </div>
                  <button className="button button-ghost button-full" aria-label="Vedi il ranking completo" onClick={() => setPadelView("ranking")}>Vedi tutto</button>
                </div>
              </aside>
            </section>
          </>
        ) : null}

        {!loading && view === "padel" && padelView === "ranking" ? (
          <section className="page-section">
            <article className="section-hero">
              <BlockMark size="lg" />
              <div className="section-hero-head">
                <div><p className="eyebrow">THEBOYZ PADEL · STAGIONE 2026</p><h1>Il ranking del gruppo</h1><p>Il ranking si aggiorna automaticamente dopo ogni risultato.</p></div>
                <div className="ranking-switch" role="group" aria-label="Tipo di ranking">
                  <button
                    className={rankingMode === "single" ? "active" : ""}
                    onClick={() => setRankingMode("single")}
                  >
                    Singolo
                  </button>
                  <button
                    className={rankingMode === "team" ? "active" : ""}
                    onClick={() => setRankingMode("team")}
                  >
                    Squadra
                  </button>
                </div>
              </div>
              {rankingMode === "single" ? (
                <div className="podium">
                  {rankedProfiles.slice(0, 3).map((profile, index) => (
                    <article key={profile.id} className={`podium-card podium-${index + 1}`}>
                      <div className="podium-avatars">
                        <Avatar profile={profile} size="lg" rank={singleRanks[index]} />
                      </div>
                      <h3>
                        <span className="podium-rank">#{singleRanks[index]}</span>
                        {profile.display_name}
                      </h3>
                      <b>{profile.rating} pt</b>
                    </article>
                  ))}
                </div>
              ) : teams.length ? (
                <div className="podium">
                  {teams.slice(0, 3).map((team, index) => (
                    <article key={team.id} className={`podium-card podium-${index + 1} podium-shared`}>
                      {team.imageUrl ? (
                        <TeamAvatars team={team} size="lg" />
                      ) : (
                        <div className="podium-avatars">
                          {team.players.map((profile) => (
                            <Avatar key={profile.id} profile={profile} size="lg" rank={teamRanks[index]} />
                          ))}
                        </div>
                      )}
                      <h3>
                        <span className="podium-rank">#{teamRanks[index]}</span>
                        {teamLabel(team)}
                      </h3>
                      <b>{team.rating} pt</b>
                      {team.name ? (
                        <div className="podium-members">
                          <div className="team-avatars">
                            {team.players.map((profile) => (
                              <Avatar key={profile.id} profile={profile} size="sm" />
                            ))}
                          </div>
                          <span>{team.players.map((profile) => profile.display_name).join(" · ")}</span>
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : null}
            </article>
            {rankingMode === "single" ? (
              <RankingList profiles={profiles} expanded onSelect={openPlayer} />
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
                <div><p className="eyebrow dark">BACHECA</p><h2>Trofei e record</h2></div>
                <span>{selectedPlayerBadges.length} {selectedPlayerBadges.length === 1 ? "titolo" : "titoli"}</span>
              </div>
              {selectedPlayerBadges.length ? (
                <BadgeList badges={selectedPlayerBadges} />
              ) : (
                <div className="player-trophies-empty">
                  <p>Ancora nessun titolo: i primi arrivano a 5 vittorie, 10 partite o 1125 di Elo.</p>
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
                <p>Le pizzerie dei TheBoyz, tre voti per ogni nuova scheda e un solo verdetto gastronomico.</p>
              </div>
              <div className="pizza-hero-actions">
                <div className="pizza-stamp">
                  <span>01</span>
                  <b>PORTEGO<br />DE MÀ</b>
                  <strong>78 / 100</strong>
                  <small>CAMPIONE IN CARICA</small>
                </div>
                {currentUserCanManagePizza ? <button className="button button-primary" onClick={() => {
                  if (!pizzaSchemaReady) {
                    setNotice("Prima di aggiungere una pizzeria devi eseguire lo schema aggiornato in Supabase.");
                    return;
                  }
                  setShowPizzaCreate(true);
                }}>＋ Aggiungi pizzeria</button> : null}
              </div>
            </div>

            <div className="pizza-podium" aria-label="Podio pizzerie">
              {pizzaEntries.filter((restaurant) => !restaurant.isNew || restaurant.votesCount === 3).slice(0, 3).map((restaurant, index) => (
                <article className={`pizza-podium-card pizza-place-${index + 1}`} key={restaurant.name}>
                  <span className="pizza-medal">{index + 1}</span>
                  {index === 0 ? <img className="pizza-medal-icon" src="https://cdn-icons-gif.flaticon.com/19016/19016244.gif" alt="Trofeo primo posto pizza" /> : null}
                  <div>
                    <small>{index === 0 ? "THEBOYZ CHAMPION" : "TOP THREE"}</small>
                    <h2>{restaurant.name}</h2>
                    {restaurant.place ? <p>{restaurant.place}</p> : null}
                  </div>
                  <b>{restaurant.total}<small>/100</small></b>
                </article>
              ))}
            </div>

            <section className="pizza-method">
              <div className="pizza-method-copy">
                <p className="eyebrow dark">COME FUNZIONA</p>
                <h2>Ogni punto conta.</h2>
                <p>I voti del gruppo si sommano nelle quattro categorie, poi arriva il Bonus Fabio. Totale massimo: 100 punti.</p>
              </div>
              <div className="pizza-criteria">
                {pizzaCriteria.map((criterion) => (
                  <div className={`pizza-criterion criterion-${criterion.tone}`} key={criterion.label}>
                    <span>
                      {criterion.label}
                      {criterion.label === "Bonus Fabio" ? (
                        <img className="bonus-fabio-icon" src={`${basePath}/bonus-fabio.jpg`} alt="" />
                      ) : null}
                    </span>
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
                <span>BONUS F.</span>
                <span>TOTALE</span>
              </div>
              <div className="pizza-ranking-list">
                {pizzaEntries.map((restaurant, index) => {
                  const dbRestaurant = restaurant.id ? pizzaRestaurants.find((item) => item.id === restaurant.id) : null;
                  const complete = !restaurant.isNew || restaurant.votesCount === 3;
                  const rowClass = `pizza-ranking-row ${index < 3 && complete ? "pizza-ranking-top" : ""} ${restaurant.isNew ? "pizza-ranking-interactive" : ""} ${restaurant.isNew && !complete ? "pizza-ranking-pending" : ""}`;
                  const rowContent = (<>
                    <span className="pizza-position">{index + 1}</span>
                    <div className="pizza-name-cell">
                      <b>{restaurant.name}</b>
                      <small>{restaurant.isNew ? `${restaurant.place ?? "NUOVA SCHEDA"} · ${restaurant.votesCount ?? 0}/3 VOTI` : restaurant.address ? <a className="pizza-address-link" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(restaurant.address)}`} target="_blank" rel="noopener noreferrer">{restaurant.address}</a> : (restaurant.place ?? "THEBOYZ TESTED")}</small>
                      <span className="pizza-score-track" aria-hidden="true">
                        <i style={{ width: `${complete ? restaurant.total : 0}%` }} />
                      </span>
                    </div>
                    <span className="pizza-category-score"><b>{restaurant.isNew && !complete ? "—" : restaurant.location}</b><small>/21</small></span>
                    <span className="pizza-category-score"><b>{restaurant.isNew && !complete ? "—" : restaurant.pizza}</b><small>/30</small></span>
                    <span className="pizza-category-score"><b>{restaurant.isNew && !complete ? "—" : restaurant.dessert}</b><small>/12</small></span>
                    <span className="pizza-category-score"><b>{restaurant.isNew && !complete ? "—" : restaurant.price}</b><small>/30</small></span>
                    <span className="pizza-category-score pizza-fabio-score"><b>{restaurant.isNew && !complete ? "—" : restaurant.fabio}</b><small>/7</small></span>
                    <span className="pizza-total-score"><b>{restaurant.isNew && !complete ? "N/C" : restaurant.total}</b><small>{restaurant.isNew && !complete ? "" : "/100"}</small></span>
                  </>);
                  return restaurant.isNew && dbRestaurant ? (
                    <button type="button" className={rowClass} key={`${restaurant.name}-${index}`} onClick={() => setVotingRestaurant(dbRestaurant)} aria-label={`Vota ${restaurant.name}`}>
                      {rowContent}
                    </button>
                  ) : <article className={rowClass} key={`${restaurant.name}-${index}`}>{rowContent}</article>;
                })}
              </div>
            </div>
            <p className="pizza-source-note">Classifica storica TheBoyz · Le nuove schede si attivano con i voti di Samu, Fabio e Dani.</p>
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
      {showPizzaCreate ? <PizzaCreateModal onClose={() => setShowPizzaCreate(false)} onSaved={() => handlePizzaSaved("Pizzeria aggiunta. Ora potete inserire i tre voti.")} /> : null}
      {votingRestaurant ? <PizzaVoteModal restaurant={votingRestaurant} voter={currentUser} onClose={() => setVotingRestaurant(null)} onSaved={() => handlePizzaSaved("Voto salvato. Il totale si aggiorna con i voti del gruppo.")} /> : null}
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
