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

function Brand() {
  return (
    <div className="brand" aria-label="TheBoyz">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="brand-logo" src={`${basePath}/theBOYZ.png`} alt="" />
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

function youtubeId(url?: string | null) {
  if (!url) return null;
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/,
  );
  return match ? match[1] : null;
}

function MatchCard({
  match,
  onEdit,
  onPlayVideo,
}: {
  match: PadelMatch;
  onEdit?: (match: PadelMatch) => void;
  onPlayVideo?: (videoId: string) => void;
}) {
  const team1 = match.players.filter((player) => player.team === 1);
  const team2 = match.players.filter((player) => player.team === 2);
  const videoId = youtubeId(match.video_url);
  const formatTeam = (players: typeof team1) => players.map((player, index) => {
    const delta = player.rating_delta ?? 0;
    return (
      <span key={player.profile_id}>
        {index > 0 ? " · " : ""}
        {player.profile.display_name}{" "}
        <b className={`elo-delta ${delta >= 0 ? "up" : "down"}`}>
          {delta > 0 ? "+" : ""}{delta}
        </b>
      </span>
    );
  });

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
      <div className="match-video">
        {videoId ? (
          <button
            className="match-video-preview"
            onClick={() => onPlayVideo?.(videoId)}
            aria-label="Guarda il video della partita"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`https://img.youtube.com/vi/${videoId}/mqdefault.jpg`} alt="" />
            <b aria-hidden="true">▶</b>
          </button>
        ) : null}
      </div>
      {onEdit ? (
        <button
          className="match-menu-button"
          onClick={() => onEdit(match)}
          aria-label={`Modifica la partita del ${new Intl.DateTimeFormat("it-IT").format(new Date(match.played_at))}`}
        >
          <span aria-hidden="true">···</span>
        </button>
      ) : null}
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
      <label className="team-editor-photo">
        <TeamAvatars team={team} />
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={disabled || busy}
          onChange={(event) => void pickImage(event.target.files?.[0])}
        />
        <span>Foto</span>
      </label>
      <div className="team-editor-fields">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={team.players.map((profile) => profile.display_name).join(" · ")}
          maxLength={40}
          disabled={disabled || busy}
          aria-label="Nome della squadra"
        />
        <small>{team.matches_played} partite · {team.rating} pt</small>
      </div>
      <button className="button button-dark" disabled={disabled || busy}>
        {busy ? "Salvo…" : "Salva"}
      </button>
    </form>
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

function EloChart({ profile, matches }: { profile: Profile; matches: PadelMatch[] }) {
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
        <div><p className="eyebrow dark">ANDAMENTO ELO</p><h2>La corsa di {profile.display_name}</h2></div>
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

function NewMatchModal({
  profiles,
  match,
  onClose,
  onSaved,
}: {
  profiles: Profile[];
  match?: PadelMatch | null;
  onClose: () => void;
  onSaved: (action?: "deleted") => void;
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function removeMatch() {
    if (!match) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    if (!supabase) return;
    setDeleting(true);
    setError("");
    const { error: rpcError } = await supabase.rpc("delete_match", { p_match_id: match.id });
    if (rpcError) {
      setError(rpcError.message);
      setDeleting(false);
      setConfirmDelete(false);
      return;
    }
    onSaved("deleted");
    setDeleting(false);
  }

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
      if (match) {
        const { error: deleteError } = await supabase.rpc("delete_match", { p_match_id: match.id });
        if (deleteError) {
          setError(deleteError.message);
          setBusy(false);
          return;
        }
      }
      const { error: rpcError } = await supabase.rpc("record_match", {
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
          {error ? <p className="form-message error">{error}</p> : null}
          {editing && confirmDelete ? (
            <p className="form-message error">
              Eliminando la partita la classifica viene ricalcolata. Premi di nuovo Elimina per confermare.
            </p>
          ) : null}
          <div className="modal-actions">
            {editing ? (
              <button
                type="button"
                className={`button match-delete-action ${confirmDelete ? "is-confirming" : ""}`}
                onClick={() => void removeMatch()}
                disabled={deleting || busy}
              >
                {deleting ? "Elimino…" : confirmDelete ? "Confermi?" : "Elimina"}
              </button>
            ) : null}
            <button type="button" className="button button-ghost" onClick={onClose}>Annulla</button>
            <button className="button button-primary" disabled={busy || deleting}>{busy ? "Salvataggio…" : "Salva risultato"}</button>
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
  const [editingMatch, setEditingMatch] = useState<PadelMatch | null>(null);
  const [rankingMode, setRankingMode] = useState<"single" | "team">("single");
  const [playingVideo, setPlayingVideo] = useState<string | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [notice, setNotice] = useState("");
  const [profileName, setProfileName] = useState("");
  const [handedness, setHandedness] = useState("");
  const [courtSide, setCourtSide] = useState("");
  const [teamRecords, setTeamRecords] = useState<PadelTeamRecord[]>([]);
  const [teamSchemaReady, setTeamSchemaReady] = useState(true);

  const loadData = useCallback(async () => {
    const client = supabase;
    if (!client) return;
    const [profilesResult, matchesResult, pizzaResult, teamsResult] = await Promise.all([
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
      // Se la migrazione delle squadre non è ancora stata eseguita la query
      // fallisce: il resto dell'app deve continuare a funzionare.
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
  const teams = useMemo(
    () => buildPadelTeams(matches, profiles, teamRecords),
    [matches, profiles, teamRecords],
  );
  const myTeams = useMemo(
    () => teams.filter((team) => team.players.some((profile) => profile.id === session?.user.id)),
    [teams, session?.user.id],
  );
  const teamRanks = useMemo(() => ranksByRating(teams), [teams]);
  const pizzaEntries = useMemo(() => buildPizzaRanking(pizzaRestaurants), [pizzaRestaurants]);
  const currentUser = profiles.find((profile) => profile.id === session?.user.id);
  const currentUserCanManagePizza = currentUser ? canManagePizza(currentUser.display_name, session?.user.email) : false;
  const currentRank = currentUser?.matches_played ? rankOf(sorted, currentUser.id) : 0;
  const selectedPlayer = profiles.find((profile) => profile.id === selectedPlayerId) ?? null;
  const selectedPlayerRank = selectedPlayer?.matches_played ? rankOf(sorted, selectedPlayer.id) : 0;
  const selectedPlayerMatches = selectedPlayer
    ? matches.filter((match) => match.players.some((player) => player.profile_id === selectedPlayer.id))
    : [];
  // Con i parimerito il giocatore da raggiungere è il primo con punteggio più
  // alto, non semplicemente quello nella riga precedente.
  const nextRankedPlayer = currentUser
    ? [...sorted].reverse().find((profile) => profile.rating > currentUser.rating) ?? null
    : null;
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

  async function handleSaved(action?: "deleted") {
    const wasEditing = Boolean(editingMatch);
    setShowMatch(false);
    setEditingMatch(null);
    await loadData();
    setNotice(
      action === "deleted"
        ? "Partita eliminata. Classifica e statistiche sono state ricalcolate."
        : wasEditing
        ? "Fatto. Classifica e statistiche sono state ricalcolate."
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
            ["pizza", "Pizze"],
          ] as [View, string][]).map(([target, label]) => (
            <button key={target} className={view === target ? "active" : ""} onClick={() => { setView(target); if (target === "padel") setPadelView("overview"); }}>{label}</button>
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
                <img className="hub-mark" src={`${basePath}/theBOYZ.png`} alt="Simbolo TheBoyz" />
                <button
                  className="hub-profile"
                  onClick={() => setView("profile")}
                  aria-label="Vai al tuo profilo"
                >
                  <Avatar profile={currentUser} size="xl" rank={currentRank || undefined} />
                </button>
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
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <div className="hub-card-icon" aria-hidden="true"><img src="https://cdn-icons-gif.flaticon.com/6451/6451035.gif" alt="" /></div>
                <h3>Padel<br />Court</h3>
              </button>

              <button className="hub-card hub-card-pizza" onClick={() => setView("pizza")}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <div className="hub-card-icon pizza-icon" aria-hidden="true"><img src="https://cdn-icons-gif.flaticon.com/15240/15240280.gif" alt="" /></div>
                <h3>Pizza<br />Ranking</h3>
              </button>
            </div>

            <div className="hub-status">
              <span className="status-pulse" />
              <p><b>TheBoyz è online.</b> La prossima sezione la decidiamo noi.</p>
              <span>TB / 2026</span>
              <a className="icon-credit" href="https://www.flaticon.com" target="_blank" rel="noopener noreferrer">Icone animate by Flaticon</a>
            </div>
          </section>
        ) : null}

        {!loading && view === "padel" && padelView === "overview" ? (
          <>
            <div className="section-context">
              <button onClick={() => setView("hub")}>THEBOYZ</button><span>/</span><b>PADEL COURT</b>
            </div>
            <section className="dashboard-grid">
              <div className="dashboard-main">
                <article className="hero-stat">
                  <div className="hero-stat-copy">
                    <h1 className="hero-greeting">
                      Ciao, {currentUser.display_name}.<br />
                      <span>Pronto a difendere la posizione?</span>
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
                  <div className="court-actions">
                    <button className="button button-dark" onClick={() => setPadelView("matches")}>Vedi tutte</button>
                    <button className="button button-primary" onClick={() => setShowMatch(true)}>＋ Match</button>
                  </div>
                </div>
                {matches.length ? (
                  <div className="match-list">
                    {matches.slice(0, 2).map((match) => (
                      <MatchCard
                        key={match.id}
                        match={match}
                        onEdit={(selected) => setEditingMatch(selected)}
                        onPlayVideo={(id) => setPlayingVideo(id)}
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
                <RankingList profiles={sorted} onSelect={openPlayer} />
                <button className="button button-dark button-full" onClick={() => setPadelView("ranking")}>Classifica completa</button>
              </aside>
            </section>
          </>
        ) : null}

        {!loading && view === "padel" && padelView === "ranking" ? (
          <section className="page-section">
            <div className="section-context">
              <button onClick={() => setView("hub")}>THEBOYZ</button><span>/</span><button onClick={() => setPadelView("overview")}>PADEL COURT</button><span>/</span><b>RANKING</b>
            </div>
            <button className="player-back" type="button" onClick={() => setPadelView("overview")}>← Torna al court</button>
            <article className="section-hero">
              <div className="section-hero-head">
                <div><p className="eyebrow">THEBOYZ PADEL · STAGIONE 2026</p><h1>La classifica del gruppo</h1><p>Il ranking si aggiorna automaticamente dopo ogni risultato.</p></div>
                <div className="ranking-switch" role="group" aria-label="Tipo di classifica">
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
            <div className="section-context">
              <button onClick={() => setView("hub")}>THEBOYZ</button><span>/</span><button onClick={() => setPadelView("overview")}>PADEL COURT</button><span>/</span><b>{selectedPlayer.display_name.toUpperCase()}</b>
            </div>
            <button className="player-back" type="button" onClick={() => setPadelView("overview")}>← Torna al court</button>

            <article className="player-detail-hero">
              <div className="player-detail-identity">
                <Avatar profile={selectedPlayer} size="xl" rank={selectedPlayerRank || undefined} />
                <div>
                  <p className="eyebrow">SCHEDA GIOCATORE</p>
                  <h1>{selectedPlayer.display_name}</h1>
                  <div className="player-traits">
                    {padelTraits(selectedPlayer) ? <span>{padelTraits(selectedPlayer)}</span> : null}
                    <span>{selectedPlayer.matches_played ? `#${selectedPlayerRank} in classifica` : "Non classificato"}</span>
                    {selectedPlayer.matches_played ? <span>Serie {selectedPlayer.current_streak > 0 ? `+${selectedPlayer.current_streak}` : selectedPlayer.current_streak}</span> : null}
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
              <article><span>01</span><b>{selectedPlayer.matches_played}</b><small>Partite</small></article>
              <article><span>02</span><b>{selectedPlayer.wins}</b><small>Vittorie</small></article>
              <article><span>03</span><b>{selectedPlayer.losses}</b><small>Sconfitte</small></article>
              <article><span>04</span><b>{selectedPlayer.matches_played ? Math.round((selectedPlayer.wins / selectedPlayer.matches_played) * 100) : 0}%</b><small>Win rate</small></article>
            </div>

            <EloChart profile={selectedPlayer} matches={matches} />

            <div className="player-history-head">
              <div><p className="eyebrow dark">STORICO PERSONALE</p><h2>Le partite di {selectedPlayer.display_name}</h2></div>
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
                  />
                ))}
              </div>
            ) : (
              <div className="empty-board"><span>00</span><h2>Nessuna partita giocata</h2><p>La scheda si completerà dopo il primo risultato.</p></div>
            )}
          </section>
        ) : null}

        {!loading && view === "padel" && padelView === "matches" ? (
          <section className="page-section">
            <div className="section-context">
              <button onClick={() => setView("hub")}>THEBOYZ</button><span>/</span><button onClick={() => setPadelView("overview")}>PADEL COURT</button><span>/</span><b>MATCHES</b>
            </div>
            <button className="player-back" type="button" onClick={() => setPadelView("overview")}>← Torna al court</button>
            <article className="section-hero">
              <div className="section-hero-head">
                <div><p className="eyebrow">ARCHIVIO THEBOYZ PADEL</p><h1>Tutte le partite</h1><p>{matches.length} risultati registrati dal gruppo.</p></div>
                <button className="button button-primary" onClick={() => setShowMatch(true)}>＋ Match</button>
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
                  />
                ))}
              </div>
            ) : (
              <div className="empty-board"><span>00</span><h2>Ancora nessuna partita</h2><p>Registra il primo risultato per iniziare lo storico.</p></div>
            )}
          </section>
        ) : null}

        {!loading && view === "pizza" ? (
          <><div className="section-context"><button onClick={() => setView("hub")}>THEBOYZ</button><span>/</span><b>PIZZERIA RANKING</b></div><section className="pizza-page">
            
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

        {!loading && view === "profile" ? (
          <section className="page-section profile-page"><div className="section-context"><button onClick={() => setView("hub")}>THEBOYZ</button><span>/</span><b>PROFILO</b></div>
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
                <h2>
                  {currentRank ? <span className="profile-rank">#{currentRank}</span> : null}
                  {currentUser.display_name}
                </h2>
                <p>In campo dal {new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric" }).format(new Date(currentUser.created_at ?? "2026-01-01"))}</p>
                <div className="profile-stats">
                  <span><b>{currentRank ? currentUser.rating : "N/C"}</b><small>Punti</small></span>
                  <span><b>{currentUser.wins}/{currentUser.matches_played}</b><small>Vittorie</small></span>
                  <span><b>{winRate}%</b><small>Win rate</small></span>
                </div>
                <div className="profile-teams">
                  <h3>Le mie squadre</h3>
                  {!teamSchemaReady ? (
                    <p className="demo-profile-note">
                      Per dare nome e foto alle squadre esegui la migrazione
                      <code>migration-squadre.sql</code> in Supabase.
                    </p>
                  ) : myTeams.length ? (
                    myTeams.map((team) => (
                      <TeamEditor
                        key={team.id}
                        team={team}
                        disabled={!supabase}
                        onSave={(selected, name, file) => saveTeam(selected, name, file)}
                      />
                    ))
                  ) : (
                    <p className="demo-profile-note">
                      Le squadre nascono dalle partite: gioca un doppio e comparirà qui.
                    </p>
                  )}
                </div>
              </article>
              <article className="settings-card">
                <h2>Dati del profilo</h2>
                <form onSubmit={updateProfile}>
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
["hub", basePath + "/theBOYZ.png", "TheBoyz"],
["padel", "https://cdn-icons-gif.flaticon.com/6451/6451035.gif", "Padel"],
["pizza", "https://cdn-icons-gif.flaticon.com/15240/15240280.gif", "Pizze"],
] as [View, string, string][]).map(([target, icon, label]) => (
<button key={target} className={view === target ? "active" : ""} onClick={() => { setView(target); if (target === "padel") setPadelView("overview"); }}>
{/* eslint-disable-next-line @next/next/no-img-element */}
<span className="mobile-nav-icon"><img src={icon} alt="" /></span>{label}
</button>
))}
<button className={view === "profile" ? "active" : ""} onClick={() => setView("profile")}><span className="mobile-nav-icon"><Avatar profile={currentUser} size="sm" /></span>Profilo</button>
</nav>

      {showMatch || editingMatch ? (
        <NewMatchModal
          profiles={profiles}
          match={editingMatch}
          onClose={() => { setShowMatch(false); setEditingMatch(null); }}
          onSaved={(action) => void handleSaved(action)}
        />
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
