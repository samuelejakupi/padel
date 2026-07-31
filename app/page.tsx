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

type View = "home" | "ranking" | "matches" | "profile";

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
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
    <div className="brand" aria-label="Padel House">
      <span className="brand-mark">P</span>
      <span>
        <b>PADEL</b>
        <small>HOUSE</small>
      </span>
    </div>
  );
}

function LoginScreen() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setMessage("");

    const result =
      mode === "login"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: { data: { display_name: name.trim() } },
          });

    if (result.error) {
      setMessage(
        result.error.message.includes("Database error")
          ? "Il gruppo ha già raggiunto il limite di 10 giocatori."
          : result.error.message,
      );
    } else if (mode === "signup" && !result.data.session) {
      setMessage("Controlla la tua email per confermare l’iscrizione.");
    }
    setBusy(false);
  }

  return (
    <main className="login-page">
      <section className="login-showcase">
        <Brand />
        <div className="court-lines" aria-hidden="true">
          <span className="court-ball">●</span>
        </div>
        <div className="login-copy">
          <p className="eyebrow">IL TUO CLUB. LE TUE REGOLE.</p>
          <h1>Ogni partita<br />lascia il segno.</h1>
          <p>Risultati, rivalità e classifica del tuo gruppo di padel. Finalmente tutti d’accordo sui numeri.</p>
        </div>
        <div className="login-proof">
          <span><b>10</b> posti nel gruppo</span>
          <span><b>∞</b> partite da ricordare</span>
        </div>
      </section>

      <section className="login-panel">
        <div className="login-card">
          <p className="eyebrow dark">BENTORNATO IN CAMPO</p>
          <h2>{mode === "login" ? "Accedi al tuo club" : "Entra nel gruppo"}</h2>
          <p className="login-subtitle">
            {mode === "login"
              ? "Usa le credenziali con cui ti sei registrato."
              : "I profili disponibili sono limitati a 10."}
          </p>

          <form onSubmit={submit}>
            {mode === "signup" ? (
              <label>
                Nome in classifica
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Es. Alessandro" required />
              </label>
            ) : null}
            <label>
              Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@email.it" required />
            </label>
            <label>
              Password
              <input type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Almeno 6 caratteri" required />
            </label>
            {message ? <p className="form-message">{message}</p> : null}
            <button className="button button-primary button-full" disabled={busy}>
              {busy ? "Un momento…" : mode === "login" ? "Entra nel club" : "Crea il mio profilo"}
            </button>
          </form>
          <button className="text-button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setMessage(""); }}>
            {mode === "login" ? "Non hai un profilo? Registrati" : "Hai già un profilo? Accedi"}
          </button>
        </div>
        <p className="login-footer">Accesso protetto da Supabase · Solo per i membri del gruppo</p>
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
        <h1>Collega Supabase<br />per entrare nel club.</h1>
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

function MatchCard({ match }: { match: PadelMatch }) {
  const team1 = match.players.filter((player) => player.team === 1);
  const team2 = match.players.filter((player) => player.team === 2);
  const formatTeam = (players: typeof team1) => players.map((player) => player.profile.display_name).join(" · ");

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
        <span className={match.winner_team === 1 ? "positive" : "negative"}>{match.winner_team === 1 ? "+" : "−"}{match.rating_delta ?? 16}</span>
        <small>PT RANKING</small>
      </div>
    </article>
  );
}

function RankingList({ profiles, expanded = false }: { profiles: Profile[]; expanded?: boolean }) {
  const sorted = [...profiles].sort((a, b) => b.rating - a.rating);
  return (
    <div className={expanded ? "ranking-table" : "ranking-list"}>
      {sorted.map((profile, index) => {
        const winRate = profile.matches_played ? Math.round((profile.wins / profile.matches_played) * 100) : 0;
        return (
          <div className="ranking-row" key={profile.id}>
            <span className={`rank-number rank-${index + 1}`}>{String(index + 1).padStart(2, "0")}</span>
            <Avatar profile={profile} size={expanded ? "md" : "sm"} />
            <div className="ranking-name">
              <b>{profile.display_name}</b>
              <span>{profile.matches_played} partite</span>
            </div>
            {expanded ? (
              <>
                <span className="table-stat"><b>{profile.wins}</b><small>Vinte</small></span>
                <span className="table-stat"><b>{winRate}%</b><small>Win rate</small></span>
                <span className={`streak ${profile.current_streak >= 0 ? "up" : "down"}`}>
                  {profile.current_streak >= 0 ? "↗" : "↘"} {Math.abs(profile.current_streak)}
                </span>
              </>
            ) : (
              <span className={`trend ${profile.current_streak >= 0 ? "up" : "down"}`}>{profile.current_streak >= 0 ? "↑" : "↓"}</span>
            )}
            <span className="ranking-points"><b>{profile.rating}</b><small>PT</small></span>
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

function AppShell({ session }: { session: Session | null }) {
  const [view, setView] = useState<View>("home");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [matches, setMatches] = useState<PadelMatch[]>([]);
  const [showMatch, setShowMatch] = useState(false);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [notice, setNotice] = useState("");
  const [profileName, setProfileName] = useState("");

  const loadData = useCallback(async () => {
    const client = supabase;
    if (!client) return;
    const [profilesResult, matchesResult] = await Promise.all([
      client.from("profiles").select("*").order("rating", { ascending: false }),
      client
        .from("matches")
        .select("id, played_at, created_by, winner_team, notes, rating_delta, sets:match_sets(set_number, team1_games, team2_games), players:match_players(profile_id, team, profile:profiles(*))")
        .order("played_at", { ascending: false })
        .limit(50),
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
      setProfileName(withAvatars.find((profile) => profile.id === session?.user.id)?.display_name ?? "");
    }
    setLoading(false);
  }, [session?.user.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadData(), 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const sorted = useMemo(() => [...profiles].sort((a, b) => b.rating - a.rating), [profiles]);
  const currentUser = profiles.find((profile) => profile.id === session?.user.id);
  const currentRank = currentUser
    ? Math.max(1, sorted.findIndex((profile) => profile.id === currentUser.id) + 1)
    : 0;
  const winRate = currentUser?.matches_played
    ? Math.round((currentUser.wins / currentUser.matches_played) * 100)
    : 0;

  if (!currentUser) {
    return (
      <div className="app-shell">
        <header className="topbar"><Brand /></header>
        <main className="content">
          {loading ? (
            <div className="loading-state"><span>●</span><p>Carichiamo i dati reali…</p></div>
          ) : (
            <div className="empty-state">
              <p className="eyebrow dark">PROFILO NON DISPONIBILE</p>
              <h1>Nessun dato dimostrativo.</h1>
              <p>{notice || "Il tuo profilo non è ancora presente nel database Supabase."}</p>
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

  return (
    <div className="app-shell">
      <header className="topbar">
        <Brand />
        <nav className="desktop-nav" aria-label="Navigazione principale">
          {([
            ["home", "Panoramica"],
            ["ranking", "Classifica"],
            ["matches", "Partite"],
            ["profile", "Profilo"],
          ] as [View, string][]).map(([target, label]) => (
            <button key={target} className={view === target ? "active" : ""} onClick={() => setView(target)}>{label}</button>
          ))}
        </nav>
        <button className="profile-chip" onClick={() => setView("profile")}>
          <span><b>{currentUser.display_name}</b><small>#{currentRank} in classifica</small></span>
          <Avatar profile={currentUser} size="sm" />
        </button>
      </header>

      {notice ? <button className="notice" onClick={() => setNotice("")}>{notice}<span>×</span></button> : null}

      <main className="content">
        {loading ? (
          <div className="loading-state"><span>●</span><p>Prepariamo il campo…</p></div>
        ) : null}

        {!loading && view === "home" ? (
          <>
            <section className="welcome-row">
              <div>
                <p className="eyebrow dark">VENERDÌ, {new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long" }).format(new Date()).toUpperCase()}</p>
                <h1>Ciao, {currentUser.display_name}.<br /><span>Pronto a difendere la posizione?</span></h1>
              </div>
              <button className="button button-primary add-match" onClick={() => setShowMatch(true)}><span>＋</span> Registra partita</button>
            </section>

            <section className="dashboard-grid">
              <div className="dashboard-main">
                <article className="hero-stat">
                  <div className="hero-stat-copy">
                    <p className="eyebrow">LA TUA POSIZIONE</p>
                    <div className="position"><span>#</span>{currentRank}</div>
                    <p>Sei a <b>{Math.max(0, sorted[Math.max(0, currentRank - 2)]?.rating - currentUser.rating || 24)} punti</b> dal prossimo posto.</p>
                    <div className="progress-track"><span style={{ width: `${Math.min(92, 48 + winRate / 2)}%` }} /></div>
                    <small>Continua così: {currentUser.current_streak > 0 ? `${currentUser.current_streak} vittorie consecutive` : "la prossima è quella buona"}.</small>
                  </div>
                  <div className="hero-player">
                    <div className="orbit orbit-one" />
                    <div className="orbit orbit-two" />
                    <Avatar profile={currentUser} size="xl" rank={currentRank} />
                  </div>
                  <div className="hero-kpis">
                    <span><b>{currentUser.rating}</b><small>PUNTI</small></span>
                    <span><b>{winRate}%</b><small>WIN RATE</small></span>
                    <span><b>{currentUser.current_streak > 0 ? currentUser.current_streak : 0}</b><small>STRISCIA</small></span>
                  </div>
                </article>

                <div className="section-head">
                  <div><p className="eyebrow dark">ULTIMI INCONTRI</p><h2>La storia recente</h2></div>
                  <button className="text-link" onClick={() => setView("matches")}>Vedi tutte →</button>
                </div>
                <div className="match-list">{matches.slice(0, 3).map((match) => <MatchCard key={match.id} match={match} />)}</div>
              </div>

              <aside className="dashboard-side">
                <div className="side-head">
                  <div><p className="eyebrow dark">TOP PLAYERS</p><h2>Classifica</h2></div>
                  <span className="season">STAGIONE 2026</span>
                </div>
                <RankingList profiles={profiles.slice(0, 6)} />
                <button className="button button-dark button-full" onClick={() => setView("ranking")}>Classifica completa</button>
                <div className="next-game">
                  <span className="next-icon">◆</span>
                  <div><small>PROSSIMO OBIETTIVO</small><b>Arriva a {Math.ceil(currentUser.rating / 50) * 50 + 50} punti</b></div>
                  <span>→</span>
                </div>
              </aside>
            </section>
          </>
        ) : null}

        {!loading && view === "ranking" ? (
          <section className="page-section">
            <div className="page-title">
              <div><p className="eyebrow dark">STAGIONE 2026</p><h1>La classifica del club</h1><p>Il ranking si aggiorna automaticamente dopo ogni risultato.</p></div>
              <button className="button button-primary" onClick={() => setShowMatch(true)}>＋ Registra partita</button>
            </div>
            <div className="podium">
              {sorted.slice(0, 3).map((profile, index) => (
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

        {!loading && view === "matches" ? (
          <section className="page-section">
            <div className="page-title">
              <div><p className="eyebrow dark">ARCHIVIO DEL CLUB</p><h1>Tutte le partite</h1><p>{matches.length} risultati registrati dal gruppo.</p></div>
              <button className="button button-primary" onClick={() => setShowMatch(true)}>＋ Registra partita</button>
            </div>
            <div className="match-list match-list-full">{matches.map((match) => <MatchCard key={match.id} match={match} />)}</div>
          </section>
        ) : null}

        {!loading && view === "profile" ? (
          <section className="page-section profile-page">
            <div className="page-title">
              <div><p className="eyebrow dark">IL MIO SPAZIO</p><h1>Profilo giocatore</h1><p>Aggiorna la foto e il nome visibile agli amici.</p></div>
            </div>
            <div className="profile-grid">
              <article className="profile-card">
                <div className="profile-photo">
                  <Avatar profile={currentUser} size="xl" rank={currentRank} />
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
                  <span><b>{currentUser.rating}</b><small>Punti</small></span>
                  <span><b>{currentUser.wins}</b><small>Vittorie</small></span>
                  <span><b>{winRate}%</b><small>Win rate</small></span>
                </div>
              </article>
              <article className="settings-card">
                <h2>Dati del profilo</h2>
                <form onSubmit={updateProfile}>
                  <label>Nome in classifica<input value={profileName || currentUser.display_name} onChange={(e) => setProfileName(e.target.value)} disabled={!supabase} /></label>
                  <label>Email<input value={session?.user.email ?? "demo@padelhouse.it"} disabled /></label>
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
          ["home", "⌂", "Home"],
          ["ranking", "≡", "Ranking"],
          ["matches", "◫", "Partite"],
          ["profile", "○", "Profilo"],
        ] as [View, string, string][]).map(([target, icon, label]) => (
          <button key={target} className={view === target ? "active" : ""} onClick={() => setView(target)}><span>{icon}</span>{label}</button>
        ))}
      </nav>

      {showMatch ? <NewMatchModal profiles={profiles} onClose={() => setShowMatch(false)} onSaved={() => void handleSaved()} /> : null}
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
