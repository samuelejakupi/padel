"use client";

import Image from "next/image";
import { FormEvent, useEffect, useId, useState } from "react";
import { type Profile, supabase } from "@/lib/supabase";
import { basePath, groupUsers, initials } from "./core";

// La corona dell'MVP, dentro la pastiglia oro al posto della parola. Tre
// lettere in corpo 7 su un avatar da 36px si leggevano solo sapendo gia cosa
// c'era scritto; la corona si riconosce alla stessa dimensione.
export function CrownGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 4.2 15 9.5l5.3-2.4c.8-.4 1.6.4 1.4 1.2l-1.7 7.1H4L2.3 8.3c-.2-.8.6-1.6 1.4-1.2L9 9.5z" />
      <rect x="4" y="17.2" width="16" height="2.6" rx="1.3" />
    </svg>
  );
}

export function Avatar({
  profile,
  size = "md",
  rank,
  mvp = false,
}: {
  profile: Profile;
  size?: "sm" | "md" | "lg" | "xl";
  rank?: number;
  mvp?: boolean;
}) {
  return (
    <span className={`avatar avatar-${size}${mvp ? " avatar-mvp" : ""}`} aria-label={`Foto di ${profile.display_name}${mvp ? ", MVP della partita" : ""}`}>
      {profile.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={profile.avatar_url} alt="" />
      ) : (
        <span>{initials(profile.display_name)}</span>
      )}
      {mvp ? (
        <b className="avatar-mvp-label" title="MVP della partita">
          <CrownGlyph />
        </b>
      ) : null}
      {rank === 1 ? (
        <b className="rank-badge rank-badge-award" title="Primo in classifica">
          <Image
            className="rank-goat-emblem"
            src={`${basePath}/emblems/goat.webp?v=prestige-20261011`}
            alt=""
            width={128}
            height={128}
          />
        </b>
      ) : null}
    </span>
  );
}

export type GlyphName = "home" | "ranking" | "racket" | "rackets" | "person" | "people" | "pizza" | "gamepad" | "wallet" | "crosshair";

// La racchetta singola, riusata anche per la coppia.
export const RACKET_HEAD = "M9.6 16.2C7 15 5.3 12.4 5.3 9.4 5.3 5.7 8.3 2.7 12 2.7s6.7 3 6.7 6.7c0 3-1.7 5.6-4.3 6.8Z";
export const RACKET_GRIP = "M10.4 16.2v3.1a1.6 1.6 0 0 0 3.2 0v-3.1";

// Busto: testa e spalle chiuse in basso, non un arco aperto.
export const PERSON_HEAD = "M12 3.6a3.9 3.9 0 1 1 0 7.8 3.9 3.9 0 0 1 0-7.8Z";
export const PERSON_BODY = "M4.9 20.4c0-3.7 3.2-6.5 7.1-6.5s7.1 2.8 7.1 6.5Z";

// Glifi in stile SF Symbols: tratto uniforme, estremi arrotondati, nessun
// riempimento. Ereditano currentColor, così seguono lo stato della barra.
export function NavGlyph({ name }: { name: GlyphName }) {
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
      {name === "crosshair" ? (
        <>
          <circle cx="12" cy="12" r="7.6" />
          <path d="M12 2.6v4.2M12 17.2v4.2M2.6 12h4.2M17.2 12h4.2" />
          <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
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
      {/* Pad: corpo schiacciato ai lati, croce a sinistra e due tasti a
          destra. Le impugnature non sono due lobi staccati ma lo stesso
          contorno che scende: a 24px due pezzi separati diventano macchie. */}
      {name === "gamepad" ? (
        <>
          <path d="M8.3 7.4h7.4a4.9 4.9 0 0 1 4.8 4l1 5.6a2.5 2.5 0 0 1-4.5 1.9l-1.6-2.2a1.7 1.7 0 0 0-1.4-.7h-3.6a1.7 1.7 0 0 0-1.4.7l-1.6 2.2a2.5 2.5 0 0 1-4.5-1.9l1-5.6a4.9 4.9 0 0 1 4.8-4Z" />
          <path d="M7.6 11.6v2.5" />
          <path d="M6.35 12.85h2.5" />
          <g fill="currentColor" stroke="none">
            <circle cx="16.1" cy="11.9" r="0.95" />
            <circle cx="17.6" cy="14.1" r="0.95" />
          </g>
        </>
      ) : null}
      {/* Portafoglio: la busta chiusa e il bottone sul lato destro. Non una
          banconota — le spese qui dentro non sono in contanti, sono un conto
          che si tiene. */}
      {name === "wallet" ? (
        <>
          {/* Il lembo dietro poggia sul tratto dritto del bordo (fra 5.8 e
              18.2, dove finiscono gli angoli tondi): se tocca la curva, ne
              esce un dentino. */}
          <path d="M6.2 8.1a2 2 0 0 1 2-2h7.6a2 2 0 0 1 2 2" />
          <rect x="3.4" y="8.1" width="17.2" height="11.5" rx="2.4" />
          <path d="M20.6 12.6h-3.4a1.6 1.6 0 0 0 0 3.2h3.4" />
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
export function LoadingScreen() {
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

export function Brand() {
  return (
    <div className="brand" aria-label="TheBoyz">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="brand-logo" src={`${basePath}/theboyz-mark.png`} alt="TheBoyz" width={46} height={46} />
    </div>
  );
}

// Marchio in filigrana dentro i blocchi scuri: decorativo, mai cliccabile.
export function BlockMark({ size = "md" }: { size?: "md" | "lg" }) {
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

// L'ultimo nome con cui si e entrati da questo telefono: la volta dopo e gia
// scelto. Mai un nome a caso preimpostato: chi non lo cambiava provava a
// entrare come qualcun altro.
export const LAST_LOGIN_KEY = "theboyz:ultimo-accesso";

export function LoginScreen() {
  const [username, setUsername] = useState("");
  const [loginUsers, setLoginUsers] = useState(() => groupUsers.map(name => ({ username: name.toLowerCase(), display_name: name })));
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    if (supabase) void supabase.rpc("list_login_users").then(({ data, error }) => {
      if (active && !error && data?.length) setLoginUsers(data);
    });
    const timer = window.setTimeout(() => {
      try {
        const last = window.localStorage.getItem(LAST_LOGIN_KEY);
        if (last && active) setUsername(last);
      } catch { /* senza memoria del telefono si sceglie a mano */ }
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    if (!username) return setMessage("Scegli il tuo nome.");
    setBusy(true);
    setMessage("");

    const email = `${username.toLowerCase()}@theboyz.local`;
    const result = await supabase.auth.signInWithPassword({ email, password });

    if (result.error) {
      setMessage("Nome o password non corretti.");
    } else {
      try { window.localStorage.setItem(LAST_LOGIN_KEY, username); } catch { /* niente da ricordare */ }
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
                onChange={(event) => setUsername(event.target.value)}
                required
              >
                <option value="" disabled>Chi sei?</option>
                {loginUsers.map((user) => <option key={user.username} value={user.username}>{user.display_name}</option>)}
              </select>
            </label>
            <label>
              Password
              <span className="login-password">
                <input type={showPassword ? "text" : "password"} minLength={6} value={password} onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password" autoCapitalize="none" autoCorrect="off" spellCheck={false} required />
                <button type="button" className="login-password-toggle" onClick={() => setShowPassword((current) => !current)}
                  aria-pressed={showPassword} aria-label={showPassword ? "Nascondi la password" : "Mostra la password"}>
                  {showPassword ? "Nascondi" : "Mostra"}
                </button>
              </span>
            </label>
            {message ? <p className="form-message" role="alert">{message}</p> : null}
            <button className="button button-primary button-full" disabled={busy}>
              {busy ? "Un momento…" : "Entra in TheBoyz"}
            </button>
          </form>
        </div>
        <p className="login-footer">Password dimenticata? Chiedila a un admin del gruppo.</p>
      </section>
    </main>
  );
}

export function SetupScreen() {
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
