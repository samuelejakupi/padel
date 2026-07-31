"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  hasSupabaseConfig,
  type PadelMatch,
  type PadelSet,
  type Profile,
  supabase,
} from "@/lib/supabase";

type View = "hub" | "padel" | "pizza" | "profile";
type PadelView = "overview" | "ranking" | "matches";
type PizzaRankingEntry = {
  name: string;
  place?: string;
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
  { name: "PORTEGO DE MA", location: 16, pizza: 25, dessert: 8, price: 22, fabio: 7, total: 78 },
  { name: "L’OASI La Pizza", location: 17, pizza: 21, dessert: 7, price: 19, fabio: 6, total: 70 },
  { name: "FERMENTO", location: 15, pizza: 24, dessert: 5, price: 17, fabio: 7, total: 68 },
  { name: "SENESE", place: "Sanremo", location: 11, pizza: 25, dessert: 5, price: 18, fabio: 7, total: 66 },
  { name: "SANTA FE", location: 9, pizza: 22, dessert: 5, price: 24, fabio: 6, total: 66 },
  { name: "SCIABECCO", location: 9, pizza: 23, dessert: 8, price: 19, fabio: 6, total: 65 },
  { name: "LE CAVE", location: 9, pizza: 21, dessert: 7, price: 21, fabio: 6, total: 64 },
  { name: "FRA DIAVOLO", place: "Diano", location: 11, pizza: 23, dessert: 8, price: 14, fabio: 6, total: 62 },
  { name: "BONGA", location: 11, pizza: 21, dessert: 6, price: 17, fabio: 7, total: 62 },
  { name: "LE LOGGE", location: 8, pizza: 20, dessert: 4, price: 17, fabio: 7, total: 56 },
  { name: "KILO", location: 10, pizza: 24, dessert: 7, price: 14, fabio: 0, total: 55 },
  { name: "A GHE SEMMU", location: 6, pizza: 16, dessert: 6, price: 18, fabio: 6, total: 52 },
];

const pizzaCriteria = [
  { label: "Location", max: 21, source: "3 × 0–7", tone: "cyan" },
  { label: "Pizza", max: 30, source: "3 × 0–10", tone: "lime" },
  { label: "Dolce", max: 12, source: "3 × 0–4", tone: "pink" },
  { label: "Prezzo", max: 30, source: "3 × 0–10", tone: "yellow" },
  { label: "Bonus Fabio", max: 7, source: "0–7", tone: "blue" },
] as const;

function canManagePizza(displayName: string) {
  return pizzaEditors.includes(displayName as (typeof pizzaEditors)[number]);
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
      {rank ? <b className="rank-badge">{rank}</b> : null}
    </span>
  );
}

function Brand() {
  return (
    <div className="brand" aria-label="TheBoyz">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="brand-logo" src={`${basePath}/theboyz-logo.png`} alt="" />
      <span>
        <b>THEBOYZ</b>
        <small>GROUP HQ</small>
      </span>
    </div>
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

function MatchCard({
  match,
  onDelete,
  deleting = false,
}: {
  match: PadelMatch;
  onDelete?: (match: PadelMatch) => void;
  deleting?: boolean;
}) {
  const team1 = match.players.filter((player) => player.team === 1);
  const team2 = match.players.filter((player) => player.team === 2);
  const formatTeam = (players: typeof team1) => players
    .map((player) => {
      const delta = player.rating_delta ?? 0;
      return `${player.profile.display_name} ${delta > 0 ? "+" : ""}${delta}`;
    })
    .join(" · ");

  return (
    <article className="match-card">
      <div className="match-date">
        <b>{new Intl.DateTimeFormat("it-IT", { day: "2-digit" }).format(new Date(match.played_at))}</b>
        <span>{new Intl.DateTimeFormat("it-IT", { month: "short" }).format(new Date(match.played_at)).replace(".", "")}</span>
      </div>
      <div className="match-main">
        <div className={`match-team ${match.winner_team === 1 ? "winner" : ""}`}>
          <div className="mini-avatars">{team1.map((player) => <Avatar key={player.profile_id} profile={player.profile} size="sm" />)}</div>
          <span>{formatTeam(team1)}</span>
          {match.winner_team === 1 ? <em>VITTORIA</em> : null}
        </div>
        <div className="match-score">
          {match.sets
            .sort((a, b) => a.set_number - b.set_number)
            .map((set) => (
              <span key={set.set_number}>
                <b>{set.team1_games}</b>
                <i>—</i>
                <b>{set.team2_games}</b>
              </span>
            ))}
        </div>
        <div className={`match-team team-right ${match.winner_team === 2 ? "winner" : ""}`}>
          <div className="mini-avatars">{team2.map((player) => <Avatar key={player.profile_id} profile={player.profile} size="sm" />)}</div>
          <span>{formatTeam(team2)}</span>
          {match.winner_team === 2 ? <em>VITTORIA</em> : null}
        </div>
      </div>
      <div className="match-points">
        <span>{match.rating_delta ?? 0}</span>
        <small>MEDIA |Δ ELO|</small>
      </div>
      {onDelete ? (
        <button
          className="match-delete-button"
          disabled={deleting}
          onClick={() => onDelete(match)}
          aria-label={`Elimina la partita del ${new Intl.DateTimeFormat("it-IT").format(new Date(match.played_at))}`}
        >
          <span>{deleting ? "Elimino…" : "Elimina"}</span>
          <b aria-hidden="true">×</b>
        </button>
      ) : null}
    </article>
  );
}

function RankingList({ profiles, expanded = false }: { profiles: Profile[]; expanded?: boolean }) {
  const sorted = sortPadelProfiles(profiles);
  return (
    <div className={expanded ? "ranking-table" : "ranking-list"}>
      {sorted.map((profile, index) => {
        const isRanked = profile.matches_played > 0;
        const winRate = profile.matches_played ? Math.round((profile.wins / profile.matches_played) * 100) : 0;
        return (
          <div className={`ranking-row ${isRanked ? "" : "unranked"}`} key={profile.id}>
            <span className={`rank-number ${isRanked ? `rank-${index + 1}` : "rank-nc"}`}>
              {isRanked ? String(index + 1).padStart(2, "0") : "N/C"}
            </span>
            <Avatar profile={profile} size={expanded ? "md" : "sm"} />
            <div className="ranking-name">
              <b>{profile.display_name}</b>
              <span>{profile.matches_played} partite</span>
            </div>
            {expanded ? (
              <>
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
          </div>
        );
      })}
    </div>
  );
}

function NewMatchModal({
  profiles,
  onClose,
  onSaved,
}: {
  profiles: Profile[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [players, setPlayers] = useState(profiles.slice(0, 4).map((profile) => profile.id));
  const [scores, setScores] = useState([["6", "4"], ["6", "3"], ["", ""]]);
  const [playedAt, setPlayedAt] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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

    setBusy(true);
    if (supabase) {
      const { error: rpcError } = await supabase.rpc("record_match", {
        p_played_at: new Date(`${playedAt}T20:00:00`).toISOString(),
        p_team1: players.slice(0, 2),
        p_team2: players.slice(2, 4),
        p_sets: sets,
        p_notes: notes.trim() || null,
      });
      if (rpcError) {
        setError(rpcError.message);
        setBusy(false);
        return;
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
            <p className="eyebrow dark">NUOVO RISULTATO</p>
            <h2 id="match-title">Registra una partita</h2>
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
            Nota facoltativa
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Es. Rimonta incredibile al terzo set" />
          </label>
          {error ? <p className="form-message error">{error}</p> : null}
          <div className="modal-actions">
            <button type="button" className="button button-ghost" onClick={onClose}>Annulla</button>
            <button className="button button-primary" disabled={busy}>{busy ? "Salvataggio…" : "Salva risultato"}</button>
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
  const [view, setView] = useState<View>("hub");
  const [padelView, setPadelView] = useState<PadelView>("overview");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [matches, setMatches] = useState<PadelMatch[]>([]);
  const [pizzaRestaurants, setPizzaRestaurants] = useState<PizzaRestaurantRecord[]>([]);
  const [showMatch, setShowMatch] = useState(false);
  const [showPizzaCreate, setShowPizzaCreate] = useState(false);
  const [votingRestaurant, setVotingRestaurant] = useState<PizzaRestaurantRecord | null>(null);
  const [pizzaSchemaReady, setPizzaSchemaReady] = useState(true);
  const [deletingMatchId, setDeletingMatchId] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [notice, setNotice] = useState("");
  const [profileName, setProfileName] = useState("");

  const loadData = useCallback(async () => {
    const client = supabase;
    if (!client) return;
    const [profilesResult, matchesResult, pizzaResult] = await Promise.all([
      client.from("profiles").select("*").order("rating", { ascending: false }),
      client
        .from("matches")
        .select("id, played_at, created_by, winner_team, notes, rating_delta, sets:match_sets(set_number, team1_games, team2_games), players:match_players(profile_id, team, rating_delta, profile:profiles(*))")
        .order("played_at", { ascending: false })
        .limit(50),
      client
        .from("pizza_restaurants")
        .select("id, name, place, created_by, created_at, votes:pizza_votes(restaurant_id, voter_id, location, pizza, dessert, price, bonus_fabio)")
        .order("created_at", { ascending: false }),
    ]);

    if (profilesResult.error || matchesResult.error) {
      setNotice(profilesResult.error?.message ?? matchesResult.error?.message ?? "Non è stato possibile caricare i dati.");
    } else {
      const withAvatars = (profilesResult.data ?? []).map((profile) => ({
        ...profile,
        avatar_url: profile.avatar_path
          ? client.storage.from("avatars").getPublicUrl(profile.avatar_path).data.publicUrl
          : null,
      })) as Profile[];
      const profileMap = new Map(withAvatars.map((profile) => [profile.id, profile]));
      const normalized = (matchesResult.data ?? []).map((match) => ({
        ...match,
        players: (match.players ?? []).map((player) => ({
          ...player,
          profile: profileMap.get(player.profile_id) ?? player.profile,
        })),
      })) as unknown as PadelMatch[];
      setProfiles(withAvatars);
      setMatches(normalized);
      setPizzaSchemaReady(!pizzaResult.error);
      if (!pizzaResult.error) setPizzaRestaurants((pizzaResult.data ?? []) as PizzaRestaurantRecord[]);
      setProfileName(withAvatars.find((profile) => profile.id === session?.user.id)?.display_name ?? "");
    }
    setLoading(false);
  }, [session?.user.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadData(), 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const sorted = useMemo(() => sortPadelProfiles(profiles), [profiles]);
  const rankedProfiles = useMemo(() => sorted.filter((profile) => profile.matches_played > 0), [sorted]);
  const pizzaEntries = useMemo(() => buildPizzaRanking(pizzaRestaurants), [pizzaRestaurants]);
  const currentUser = profiles.find((profile) => profile.id === session?.user.id);
  const currentRank = currentUser?.matches_played
    ? Math.max(1, sorted.findIndex((profile) => profile.id === currentUser.id) + 1)
    : 0;
  const nextRankedPlayer = currentRank > 1 ? sorted[currentRank - 2] : null;
  const pointsToNext = nextRankedPlayer && currentUser
    ? Math.max(0, nextRankedPlayer.rating - currentUser.rating)
    : 0;
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
            <div className="loading-state"><span>●</span><p>Carichiamo i dati reali…</p></div>
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
    setShowMatch(false);
    await loadData();
    setNotice("Partita salvata. La classifica è stata aggiornata.");
  }

  async function deleteMatch(match: PadelMatch) {
    if (!supabase || deletingMatchId) return;
    const playedAt = new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "long", year: "numeric" })
      .format(new Date(match.played_at));
    const confirmed = window.confirm(
      `Eliminare definitivamente la partita del ${playedAt}?\n\nClassifica e statistiche verranno ricalcolate.`,
    );
    if (!confirmed) return;

    setDeletingMatchId(match.id);
    setNotice("");
    const { error } = await supabase.rpc("delete_match", { p_match_id: match.id });
    if (error) {
      setNotice(error.message);
    } else {
      await loadData();
      setNotice("Partita eliminata. Classifica e statistiche sono state ricalcolate.");
    }
    setDeletingMatchId(null);
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
    const { error } = await supabase.from("profiles").update({ display_name: profileName.trim() }).eq("id", session.user.id);
    setNotice(error ? error.message : "Profilo aggiornato.");
    if (!error) await loadData();
  }

  async function handlePizzaSaved(message: string) {
    setShowPizzaCreate(false);
    setVotingRestaurant(null);
    await loadData();
    setNotice(message);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand-home" onClick={() => setView("hub")} aria-label="Vai alla home TheBoyz">
          <Brand />
        </button>
        <nav className="desktop-nav" aria-label="Navigazione principale">
          {([
            ["hub", "TheBoyz"],
            ["padel", "Padel"],
            ["pizza", "Pizzeria ranking"],
          ] as [View, string][]).map(([target, label]) => (
            <button key={target} className={view === target ? "active" : ""} onClick={() => setView(target)}>{label}</button>
          ))}
        </nav>
        <button className="profile-chip" onClick={() => setView("profile")}>
          <span><b>{currentUser.display_name}</b><small>Padel {currentRank ? `#${currentRank}` : "N/C"}</small></span>
          <Avatar profile={currentUser} size="sm" />
        </button>
      </header>

      {notice ? <button className="notice" onClick={() => setNotice("")}>{notice}<span>×</span></button> : null}

      <main className="content">
        {loading ? (
          <div className="loading-state"><span>●</span><p>Prepariamo il campo…</p></div>
        ) : null}

        {!loading && view === "hub" ? (
          <section className="hub-page">
            <div className="hub-hero">
              <div className="hub-hero-copy">
                <p className="eyebrow">THEBOYZ · GROUP HQ</p>
                <h1>Le nostre cose.<br /><span>Un posto solo.</span></h1>
                <p>Classifiche serissime, discussioni inutili e nuove idee. Questo è il nostro spazio.</p>
                <div className="hub-members">
                  <div className="mini-avatars">
                    {sorted.slice(0, 5).map((profile) => <Avatar key={profile.id} profile={profile} size="sm" />)}
                  </div>
                  <span><b>{profiles.length}</b> membri attivi</span>
                </div>
              </div>
              <div className="hub-logo-stage">
                <span className="logo-glow" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`${basePath}/theboyz-logo.png`} alt="Simbolo TheBoyz" />
                <small>EST. BY THE GROUP</small>
              </div>
            </div>

            <div className="hub-section-title">
              <div>
                <p className="eyebrow dark">I NOSTRI SPAZI</p>
                <h2>Cosa facciamo qui</h2>
              </div>
              <span>02 SEZIONI</span>
            </div>

            <div className="hub-cards">
              <button className="hub-card hub-card-padel" onClick={() => { setView("padel"); setPadelView("overview"); }}>
                <span className="hub-card-index">01</span>
                <div className="hub-card-icon"><span>●</span></div>
                <div className="hub-card-copy">
                  <p>SEZIONE ATTIVA</p>
                  <h3>Padel</h3>
                  <span>Partite, risultati e rivalità del gruppo.</span>
                </div>
                <div className="hub-card-meta">
                  <span><b>{matches.length}</b> partite</span>
                  <span><b>{profiles.length}</b> giocatori</span>
                </div>
                <span className="hub-card-arrow">↗</span>
              </button>

              <button className="hub-card hub-card-pizza" onClick={() => setView("pizza")}>
                <span className="hub-card-index">02</span>
                <div className="hub-card-icon pizza-icon"><span>△</span></div>
                <div className="hub-card-copy">
                  <p>PROSSIMAMENTE</p>
                  <h3>Pizzeria<br />Ranking</h3>
                  <span>La classifica ufficialmente non ufficiale.</span>
                </div>
                <div className="hub-card-meta">
                  <span>Spazio pronto</span>
                  <span>Classifica vuota</span>
                </div>
                <span className="hub-card-arrow">↗</span>
              </button>
            </div>

            <div className="hub-status">
              <span className="status-pulse" />
              <p><b>TheBoyz è online.</b> La prossima sezione la decidiamo noi.</p>
              <span>TB / 2026</span>
            </div>
          </section>
        ) : null}

        {!loading && view === "padel" && padelView === "overview" ? (
          <>
            <div className="section-context">
              <button onClick={() => setView("hub")}>THEBOYZ</button><span>/</span><b>PADEL</b>
              <nav aria-label="Navigazione sezione padel">
                <button className="active" onClick={() => setPadelView("overview")}>Panoramica</button>
                <button onClick={() => setPadelView("ranking")}>Classifica</button>
                <button onClick={() => setPadelView("matches")}>Partite</button>
              </nav>
            </div>
            <section className="welcome-row">
              <div>
                <p className="eyebrow dark">THEBOYZ PADEL CLUB</p>
                <h1>Ciao, {currentUser.display_name}.<br /><span>Pronto a difendere la posizione?</span></h1>
              </div>
              <button className="button button-primary add-match" onClick={() => setShowMatch(true)}><span>＋</span> Registra partita</button>
            </section>

            <section className="dashboard-grid">
              <div className="dashboard-main">
                <article className="hero-stat">
                  <div className="hero-stat-copy">
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
                    <div className="orbit orbit-one" />
                    <div className="orbit orbit-two" />
                    <Avatar profile={currentUser} size="xl" rank={currentRank || undefined} />
                  </div>
                  <div className="hero-kpis">
                    <span><b>{currentRank ? currentUser.rating : "N/C"}</b><small>PUNTI</small></span>
                    <span><b>{winRate}%</b><small>WIN RATE</small></span>
                    <span><b>{currentUser.current_streak > 0 ? currentUser.current_streak : 0}</b><small>STRISCIA</small></span>
                  </div>
                </article>

                <div className="section-head">
                  <div><p className="eyebrow dark">ULTIMI INCONTRI</p><h2>La storia recente</h2></div>
                  <button className="text-link" onClick={() => setPadelView("matches")}>Vedi tutte →</button>
                </div>
                {matches.length ? (
                  <div className="match-list">
                    {matches.slice(0, 3).map((match) => (
                      <MatchCard
                        key={match.id}
                        match={match}
                        deleting={deletingMatchId === match.id}
                        onDelete={(selected) => void deleteMatch(selected)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="compact-empty"><span>00</span><p>Nessuna partita registrata. La prima scriverà la storia.</p></div>
                )}
              </div>

              <aside className="dashboard-side">
                <div className="side-head">
                  <div><p className="eyebrow dark">TOP PLAYERS</p><h2>Classifica</h2></div>
                  <span className="season">STAGIONE 2026</span>
                </div>
                <RankingList profiles={sorted.slice(0, 6)} />
                <button className="button button-dark button-full" onClick={() => setPadelView("ranking")}>Classifica completa</button>
                <div className="next-game">
                  <span className="next-icon">◆</span>
                  <div><small>PROSSIMO OBIETTIVO</small><b>{currentRank ? `Arriva a ${Math.ceil(currentUser.rating / 50) * 50 + 50} punti` : "Gioca la prima partita"}</b></div>
                  <span>→</span>
                </div>
              </aside>
            </section>
          </>
        ) : null}

        {!loading && view === "padel" && padelView === "ranking" ? (
          <section className="page-section">
            <div className="section-context">
              <button onClick={() => setView("hub")}>THEBOYZ</button><span>/</span><button onClick={() => setPadelView("overview")}>PADEL</button><span>/</span><b>CLASSIFICA</b>
            </div>
            <div className="page-title">
              <div><p className="eyebrow dark">THEBOYZ PADEL · STAGIONE 2026</p><h1>La classifica del gruppo</h1><p>Il ranking si aggiorna automaticamente dopo ogni risultato.</p></div>
              <button className="button button-primary" onClick={() => setShowMatch(true)}>＋ Registra partita</button>
            </div>
            <div className="podium">
              {rankedProfiles.slice(0, 3).map((profile, index) => (
                <article key={profile.id} className={`podium-card podium-${index + 1}`}>
                  <span className="podium-number">{index + 1}</span>
                  <Avatar profile={profile} size="lg" />
                  <h3>{profile.display_name}</h3>
                  <b>{profile.rating} pt</b>
                  <small>{profile.wins} vittorie · {profile.matches_played} partite</small>
                </article>
              ))}
            </div>
            <RankingList profiles={profiles} expanded />
          </section>
        ) : null}

        {!loading && view === "padel" && padelView === "matches" ? (
          <section className="page-section">
            <div className="section-context">
              <button onClick={() => setView("hub")}>THEBOYZ</button><span>/</span><button onClick={() => setPadelView("overview")}>PADEL</button><span>/</span><b>PARTITE</b>
            </div>
            <div className="page-title">
              <div><p className="eyebrow dark">ARCHIVIO THEBOYZ PADEL</p><h1>Tutte le partite</h1><p>{matches.length} risultati registrati dal gruppo.</p></div>
              <button className="button button-primary" onClick={() => setShowMatch(true)}>＋ Registra partita</button>
            </div>
            {matches.length ? (
              <div className="match-list match-list-full">
                {matches.map((match) => (
                  <MatchCard
                    key={match.id}
                    match={match}
                    deleting={deletingMatchId === match.id}
                    onDelete={(selected) => void deleteMatch(selected)}
                  />
                ))}
              </div>
            ) : (
              <div className="empty-board"><span>00</span><h2>Ancora nessuna partita</h2><p>Registra il primo risultato per iniziare lo storico.</p></div>
            )}
          </section>
        ) : null}

        {!loading && view === "pizza" ? (
          <section className="pizza-page">
            <div className="section-context section-context-dark">
              <button onClick={() => setView("hub")}>THEBOYZ</button><span>/</span><b>PIZZERIA RANKING</b>
            </div>
            <div className="pizza-hero">
              <div>
                <p className="eyebrow">CLASSIFICA UFFICIALMENTE NON UFFICIALE</p>
                <h1>Pizzeria<br /><span>Ranking.</span></h1>
                <p>Le pizzerie dei TheBoyz, tre voti per ogni nuova scheda e un solo verdetto gastronomico.</p>
              </div>
              <div className="pizza-hero-actions">
                <div className="pizza-stamp">
                  <span>01</span>
                  <b>PORTEGO<br />DE MA</b>
                  <strong>78 / 100</strong>
                  <small>CAMPIONE IN CARICA</small>
                </div>
                {canManagePizza(currentUser.display_name) && pizzaSchemaReady ? <button className="button button-primary" onClick={() => setShowPizzaCreate(true)}>＋ Aggiungi pizzeria</button> : null}
              </div>
            </div>

            {!pizzaSchemaReady ? <div className="pizza-schema-note">La votazione interattiva sarà disponibile dopo l’aggiornamento del database.</div> : null}

            <div className="pizza-podium" aria-label="Podio pizzerie">
              {pizzaEntries.filter((restaurant) => !restaurant.isNew || restaurant.votesCount === 3).slice(0, 3).map((restaurant, index) => (
                <article className={`pizza-podium-card pizza-place-${index + 1}`} key={restaurant.name}>
                  <span className="pizza-medal">{String(index + 1).padStart(2, "0")}</span>
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
                <span>BONUS F.</span>
                <span>TOTALE</span>
              </div>
              <div className="pizza-ranking-list">
                {pizzaEntries.map((restaurant, index) => {
                  const dbRestaurant = restaurant.id ? pizzaRestaurants.find((item) => item.id === restaurant.id) : null;
                  const complete = !restaurant.isNew || restaurant.votesCount === 3;
                  const rowClass = `pizza-ranking-row ${index < 3 && complete ? "pizza-ranking-top" : ""} ${restaurant.isNew ? "pizza-ranking-interactive" : ""} ${restaurant.isNew && !complete ? "pizza-ranking-pending" : ""}`;
                  const rowContent = (<>
                    <span className="pizza-position">{String(index + 1).padStart(2, "0")}</span>
                    <div className="pizza-name-cell">
                      <b>{restaurant.name}</b>
                      <small>{restaurant.isNew ? `${restaurant.place ?? "NUOVA SCHEDA"} · ${restaurant.votesCount ?? 0}/3 VOTI` : (restaurant.place ?? "THEBOYZ TESTED")}</small>
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
          </section>
        ) : null}

        {!loading && view === "profile" ? (
          <section className="page-section profile-page">
            <div className="page-title">
              <div><p className="eyebrow dark">IL MIO SPAZIO THEBOYZ</p><h1>Profilo del gruppo</h1><p>Aggiorna la foto e il nome visibile agli amici.</p></div>
            </div>
            <div className="profile-grid">
              <article className="profile-card">
                <div className="profile-photo">
                  <Avatar profile={currentUser} size="xl" rank={currentRank || undefined} />
                  {supabase ? (
                    <label className="photo-button">
                      Cambia foto
                      <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => void uploadAvatar(e.target.files?.[0])} />
                    </label>
                  ) : null}
                </div>
                <h2>{currentUser.display_name}</h2>
                <p>In campo dal {new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric" }).format(new Date(currentUser.created_at ?? "2026-01-01"))}</p>
                <div className="profile-stats">
                  <span><b>{currentRank ? currentUser.rating : "N/C"}</b><small>Punti</small></span>
                  <span><b>{currentUser.wins}</b><small>Vittorie</small></span>
                  <span><b>{winRate}%</b><small>Win rate</small></span>
                </div>
              </article>
              <article className="settings-card">
                <h2>Dati del profilo</h2>
                <form onSubmit={updateProfile}>
                  <label>Nome in classifica<input value={profileName || currentUser.display_name} onChange={(e) => setProfileName(e.target.value)} disabled={!supabase} /></label>
                  <label>Email<input value={session?.user.email ?? ""} disabled /></label>
                  <button className="button button-primary" disabled={!supabase}>Salva modifiche</button>
                </form>
                {supabase ? <button className="signout-button" onClick={() => void supabase?.auth.signOut()}>Esci dal club</button> : <p className="demo-profile-note">Il profilo diventa modificabile dopo il collegamento a Supabase.</p>}
              </article>
            </div>
          </section>
        ) : null}
      </main>

      <nav className="mobile-nav" aria-label="Navigazione mobile">
        {([
          ["hub", "⌂", "TheBoyz"],
          ["padel", "●", "Padel"],
          ["pizza", "△", "Pizzerie"],
          ["profile", "○", "Profilo"],
        ] as [View, string, string][]).map(([target, icon, label]) => (
          <button key={target} className={view === target ? "active" : ""} onClick={() => setView(target)}><span>{icon}</span>{label}</button>
        ))}
      </nav>

      {showMatch ? <NewMatchModal profiles={profiles} onClose={() => setShowMatch(false)} onSaved={() => void handleSaved()} /> : null}
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
    return <main className="splash"><Brand /><span className="splash-ball">●</span><p>Prepariamo il campo…</p></main>;
  }
  if (!hasSupabaseConfig) {
    return <SetupScreen />;
  }
  if (!session) {
    return <LoginScreen />;
  }
  return <AppShell session={session} />;
}
