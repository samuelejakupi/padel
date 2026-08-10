// Edge Function · tabellone dei campi liberi
//
// Perche esiste. Il sito e uno static export (`output: "export"`): non ci sono
// API route, quindi non c'e nessun posto nostro dove far girare del codice
// server. E dal browser non si puo comunque chiamare wansport.com, perche il
// CORS lo blocca. Questa funzione e quel posto: e l'unica cosa che parla con
// Wansport, e l'app parla solo con lei.
//
// Cosa NON esce da qui. La risposta di Wansport contiene nome e cognome di chi
// ha prenotato. Sono dati personali di gente che non ci ha chiesto niente:
// vengono letti per capire che quello slot e occupato e buttati via subito. In
// cache finisce solo il risultato normalizzato, che non li contiene. Se un
// domani serve altro da quella risposta, la regola resta questa — si estrae il
// minimo e si scarta il resto qui dentro, non piu a valle.
//
// Deploy: `supabase functions deploy wansport-slots`. Serve una volta sola, e
// va rifatto a ogni modifica di questo file.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// I club che ci interessano, con il sottodominio Wansport corrispondente.
// La lista sta qui e non nel client per un motivo di sicurezza: senza, la
// funzione sarebbe un proxy aperto verso qualsiasi indirizzo le si passi.
//
// `richiedeLogin` segna i centri che non hanno acceso il pannello pubblico:
// agli anonimi rispondono
// `{"success":false,"errCode":401,"errMsg":"Il pannello non e attivo"}`.
// Non c'entra l'essere tesserati li — basta una sessione qualunque, e la
// sessione cambia solo la porta da cui si entra (vedi `chiediPannello`).
// Restano elencati lo stesso perche l'app possa spiegare *perche* non li
// mostra invece di far finta che non esistano.
//
// Su questi la funzione entra da sola con le credenziali del gruppo (Vault, o
// i secret come via di servizio — vedi `credenziali` e `accedi`). Il flag
// resta a `true` lo stesso: dice com'e fatto il centro, non se ci riusciamo.
// Se le credenziali mancano o smettono di funzionare si torna esattamente al
// comportamento di prima.
const CLUBS: Record<string, { host: string; nome: string; richiedeLogin: boolean }> = {
  corcuera: {
    host: "corcuerapadel.wansport.com",
    nome: "CORCUERA - IMPERIA",
    richiedeLogin: false,
  },
  "don-quique": {
    host: "donquiquepadelimperia.wansport.com",
    nome: "DON QUIQUE - IMPERIA",
    richiedeLogin: true,
  },
  oneglia: {
    host: "onegliapadel.wansport.com",
    nome: "ONEGLIA PADEL - CASTELVECCHIO",
    richiedeLogin: true,
  },
  riviera: {
    host: "rivierapadel.wansport.com",
    nome: "RIVIERA PADEL - SAN LORENZO",
    richiedeLogin: true,
  },
  diano: {
    host: "dianopadelacademy.wansport.com",
    nome: "DIANO PADEL - DIANO MARINA",
    richiedeLogin: true,
  },
};

// L'account Wansport e uno solo e vale su tutti i sottodomini: ci si iscrive
// a Wansport, e sono poi i club a tesserarti. Quindi una coppia sola, non una
// per centro. Su un club dove non siamo tesserati il login riesce lo stesso
// ma il pannello risponde `success: false`, ed e esattamente il caso che
// gestivamo gia: quel club torna a dire "richiede login". Il giorno che ci
// tesseriamo, si accende da solo senza toccare niente.
//
// Due posti da cui possono arrivare, in quest'ordine:
//
// 1. il Vault del database, dove le mette il profilo dentro l'app;
// 2. i secret della funzione (`WANSPORT_USER` / `WANSPORT_PASS`), che restano
//    come via di servizio se il Vault non e stato ancora preparato.
//
// In nessuno dei due casi escono da qui dentro: quello che torna al telefono
// e solo la griglia libero/occupato. E l'account del gruppo, non quello dei
// singoli: nessuno deve consegnare all'app la password che usa altrove.
async function credenziali(
  db: ReturnType<typeof createClient>,
): Promise<{ utente: string; segreto: string } | null> {
  try {
    const { data } = await db.rpc("accesso_wansport");
    const riga = Array.isArray(data) ? data[0] : data;
    const utente = (riga as { utente?: string })?.utente;
    const segreto = (riga as { segreto?: string })?.segreto;
    if (utente && segreto) return { utente, segreto };
  } catch {
    // Il Vault puo non essere ancora preparato: si prova la via di servizio.
  }

  const utente = Deno.env.get("WANSPORT_USER");
  const segreto = Deno.env.get("WANSPORT_PASS");
  return utente && segreto ? { utente, segreto } : null;
}

// L'id con cui Wansport identifica il padel. E lo stesso su tutti i centri.
const SPORT_PADEL = 15;

// Quanto teniamo buona una risposta. Un minuto: abbastanza da non ripetere la
// stessa chiamata quando in tre aprono l'app insieme, abbastanza poco da non
// mostrare come libero un campo appena preso.
const CACHE_TTL_SECONDI = 60;

// Quanto teniamo buona una sessione Wansport. Quindici minuti sta sotto la
// scadenza di Joomla con margine, e soprattutto tiene basso il numero di
// accessi: rifare il login a ogni richiesta riempirebbe il loro registro di
// centinaia di righe a nome nostro, che e il modo piu rapido per farsi
// notare e chiudere l'account.
const SESSIONE_TTL_SECONDI = 15 * 60;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Slot = { inizio: string; fine: string; libero: boolean };
type Campo = { id: number; nome: string; slot: Slot[] };
type Tabellone = { club: string; nome: string; giorno: string; campi: Campo[] };

function minuti(orario: string): number {
  const [h, m] = orario.split(":");
  return Number(h) * 60 + Number(m);
}

// Da "2026-08-12" a se stesso, ma solo se e davvero una data. Serve a non
// passare a Wansport qualcosa che non abbiamo guardato.
function giornoValido(valore: unknown): string | null {
  if (typeof valore !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valore)) return null;
  const d = new Date(`${valore}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : valore;
}

// Il cuore: dalla risposta di Wansport tira fuori campi e slot, e nient'altro.
//
// Due segnali dicono che uno slot e occupato, e li usiamo tutti e due perche
// non sempre concordano: `lista_organizzazioni` piena (l'ha riempita il
// pannello) e la sovrapposizione con un intervallo di `listaPrenotazioni` (il
// dato grezzo). I campi `postiDisponibiliNelTs` e `nessunPostoDisponibiliNelTs`
// sembrerebbero fatti apposta, ma su una risorsa a prenotazione singola valgono
// 0 e true anche sugli slot liberi: non dicono niente e vanno ignorati.
function normalizza(payload: unknown, club: string, nome: string, giorno: string): Tabellone {
  const dati = (payload as { dati?: { sedi?: unknown[] } })?.dati;
  const sedi = Array.isArray(dati?.sedi) ? dati!.sedi : [];
  const campi: Campo[] = [];

  for (const sede of sedi as Array<{ risorse?: unknown[] }>) {
    const risorse = Array.isArray(sede?.risorse) ? sede.risorse : [];

    for (const risorsa of risorse as Array<Record<string, unknown>>) {
      const prenotazioni = Array.isArray(risorsa.listaPrenotazioni) ? risorsa.listaPrenotazioni : [];
      const occupati = (prenotazioni as Array<Record<string, string>>)
        .map((p) => ({ da: minuti(p.starttime ?? "00:00"), a: minuti(p.endtime ?? "00:00") }))
        .filter((o) => o.a > o.da);

      const tslots = Array.isArray(risorsa.tslots) ? risorsa.tslots : [];
      const slot: Slot[] = [];

      for (const ts of tslots as Array<Record<string, unknown>>) {
        // Uno slot non pubblicato non e chiuso: non esiste proprio, il centro
        // non lo mette in vendita. Mostrarlo come occupato direbbe una cosa
        // falsa, mostrarlo come libero pure.
        if (ts.published === false) continue;

        const inizio = String(ts.starttime ?? "");
        const fine = String(ts.endtime ?? "");
        if (!inizio || !fine) continue;

        const da = minuti(String(ts.starttimeHMS ?? inizio));
        const a = minuti(String(ts.endtimeHMS ?? fine));
        const organizzazioni = Array.isArray(ts.lista_organizzazioni) ? ts.lista_organizzazioni : [];

        // Qui e l'unico punto in cui i nomi delle persone passano davanti al
        // codice, e li guardiamo solo per contarli.
        const prenotato = organizzazioni.length > 0 || occupati.some((o) => da < o.a && a > o.da);

        slot.push({ inizio, fine, libero: !prenotato });
      }

      if (!slot.length) continue;

      campi.push({
        id: Number(risorsa.id ?? campi.length + 1),
        // Il nome della risorsa ("Campo 1") lo teniamo; quello della sede no.
        // Su Corcuera la sede si chiama come la parrocchia proprietaria, che in
        // un'app di padel non vuol dire niente a nessuno: il nome del posto lo
        // mettiamo noi, ed e quello che sta gia nelle card delle partite.
        nome: String(risorsa.nome ?? `Campo ${campi.length + 1}`),
        slot,
      });
    }
  }

  return { club, nome, giorno, campi };
}

// ── Accesso ───────────────────────────────────────────────────────────────
//
// Wansport gira su Joomla e il modulo di accesso e quello standard: POST alla
// radice del sito con `option=com_users`, `task=user.login`, piu un token
// anti-CSRF che cambia a ogni visita. Il token e un campo nascosto dal nome
// casuale di 32 cifre esadecimali e valore "1": va pescato dalla pagina
// appena prima di rispedirlo. Da qui la sequenza in due tempi — prima si
// prende pagina e cookie, poi si accede.
//
// `fetch` di Deno non ha un barattolo dei biscotti: i cookie li teniamo noi.

function raccogliCookie(barattolo: Map<string, string>, risposta: Response): void {
  for (const riga of risposta.headers.getSetCookie()) {
    const coppia = riga.split(";")[0] ?? "";
    const taglio = coppia.indexOf("=");
    if (taglio > 0) barattolo.set(coppia.slice(0, taglio).trim(), coppia.slice(taglio + 1).trim());
  }
}

function intestazioneCookie(barattolo: Map<string, string>): string {
  return Array.from(barattolo, ([nome, valore]) => `${nome}=${valore}`).join("; ");
}

async function accedi(host: string, utente: string, segreto: string): Promise<string | null> {
  const barattolo = new Map<string, string>();

  let html: string;
  try {
    const pagina = await fetch(`https://${host}/`, { signal: AbortSignal.timeout(10_000) });
    if (!pagina.ok) return null;
    raccogliCookie(barattolo, pagina);
    html = await pagina.text();
  } catch {
    return null;
  }

  const token = html.match(/<input[^>]*name="([0-9a-f]{32})"[^>]*value="1"/)?.[1];
  if (!token) return null;

  const modulo = new URLSearchParams({
    username: utente,
    password: segreto,
    option: "com_users",
    task: "user.login",
    // Dove Joomla ci rimanda dopo: "index.php" in base64, com'e nel modulo.
    return: "aW5kZXgucGhw",
    [token]: "1",
  });

  try {
    const risposta = await fetch(`https://${host}/`, {
      method: "POST",
      body: modulo,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: intestazioneCookie(barattolo),
      },
      // Senza `manual` il redirect verrebbe seguito perdendo per strada il
      // cookie nuovo: Joomla rigenera l'id di sessione proprio al login, e
      // quello vecchio da quel momento non vale piu niente.
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
    raccogliCookie(barattolo, risposta);
  } catch {
    return null;
  }

  // Non controlliamo qui se le credenziali erano giuste: Joomla rimanda
  // indietro con un redirect sia quando entra sia quando rifiuta, e leggere
  // il messaggio d'errore vorrebbe dire indovinare la traduzione. La prova
  // vera e la chiamata al pannello subito dopo — se risponde, siamo dentro.
  return intestazioneCookie(barattolo);
}

async function sessioneSalvata(
  db: ReturnType<typeof createClient>,
  club: string,
): Promise<string | null> {
  try {
    const { data } = await db
      .from("wansport_sessioni")
      .select("cookie, creata_il")
      .eq("club", club)
      .maybeSingle();
    if (!data) return null;
    const eta = (Date.now() - new Date(data.creata_il as string).getTime()) / 1000;
    return eta < SESSIONE_TTL_SECONDI ? (data.cookie as string) : null;
  } catch {
    return null;
  }
}

// La richiesta vera al pannello. `null` vuol dire "non ci siamo arrivati",
// diverso da "ci siamo arrivati e ci ha detto di no".
//
// Il componente cambia a seconda di chi chiede, ed e la cosa che ci ha fatto
// perdere piu tempo (misurato il 10 ago 2026 leggendo le XHR del sito da
// loggato — vedi il file dei lavori):
//   - `com_wsinit` e la porta degli anonimi. Funziona solo sui club che hanno
//     acceso il pannello pubblico: Corcuera si, tutti gli altri rispondono
//     `{"success":false,"errCode":401,"errMsg":"Il pannello non e attivo"}`.
//     Quel messaggio non parla di tesseramento e non parla di noi: dice solo
//     che da fuori quella porta e chiusa.
//   - `com_wansport` e la porta di chi ha una sessione, la stessa che usa il
//     sito dopo il login e che spiega perche dall'app i campi si vedevano.
//     Basta un account Wansport qualsiasi: **non serve essere tesserati** al
//     singolo club, cosa che invece avevamo dato per vera per un giorno.
// Quindi il componente lo sceglie il cookie, non il club.
async function chiediPannello(
  host: string,
  giorno: string,
  cookie: string | null,
): Promise<unknown | null> {
  const indirizzo = new URL(`https://${host}/index.php`);
  indirizzo.searchParams.set("option", cookie ? "com_wansport" : "com_wsinit");
  indirizzo.searchParams.set("task", "prenotazioni.getPannelloPrenotazioni");
  indirizzo.searchParams.set("format", "raw");
  indirizzo.searchParams.set("filtroData", giorno);
  indirizzo.searchParams.set("filtroSport", String(SPORT_PADEL));
  // Lo manda il sito e non costa niente mandarlo: "wanna play" e la ricerca di
  // compagni di gioco, un'altra vista sullo stesso pannello. Senza, la
  // risposta e la stessa; con, siamo identici a una richiesta del loro sito.
  if (cookie) indirizzo.searchParams.set("isWannaplay", "0");

  try {
    const risposta = await fetch(indirizzo, {
      headers: cookie ? { Accept: "application/json", Cookie: cookie } : { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!risposta.ok) return null;
    return await risposta.json();
  } catch {
    return null;
  }
}

function respinto(grezzo: unknown): boolean {
  return (grezzo as { success?: boolean })?.success === false;
}

// Chi sta chiamando. Le Edge Function accettano gia solo richieste con un JWT
// valido, ma la chiave anonima *e* un JWT valido: passa chiunque abbia aperto
// il sito. Per salvare l'accesso serve di piu — una persona con un account
// nel club — e questo e il modo di distinguerle.
async function utenteDellaRichiesta(req: Request): Promise<string | null> {
  const autorizzazione = req.headers.get("Authorization") ?? "";
  if (!autorizzazione.startsWith("Bearer ")) return null;
  try {
    const cliente = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: autorizzazione } } },
    );
    const { data } = await cliente.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

// Un controllo di cortesia dopo il salvataggio: le credenziali appena messe
// aprono davvero una sessione? Si accede e si richiede la pagina iniziale col
// cookie in mano — se il modulo di login e ancora li, non siamo entrati.
//
// E un indizio, non una sentenza: serve a dire "guarda che cosi non passa"
// subito invece di lasciarlo scoprire fra tre giorni davanti al campo. Il
// salvataggio avviene comunque, anche se questo dice di no.
async function verificaAccesso(host: string, utente: string, segreto: string): Promise<boolean> {
  const cookie = await accedi(host, utente, segreto);
  if (!cookie) return false;
  try {
    const pagina = await fetch(`https://${host}/`, {
      headers: { Cookie: cookie },
      signal: AbortSignal.timeout(10_000),
    });
    if (!pagina.ok) return false;
    return !(await pagina.text()).includes('value="user.login"');
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const rispondi = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  let corpo: { club?: string; giorno?: string; azione?: string; utente?: string; segreto?: string };
  try {
    corpo = await req.json();
  } catch {
    return rispondi({ errore: "Richiesta non leggibile" }, 400);
  }

  const db = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  // ── Le due azioni del profilo ──────────────────────────────────────────

  // "C'e un accesso configurato?" e tutto quello che il profilo ha bisogno di
  // sapere: ne l'utente ne, tantomeno, la password tornano mai indietro.
  if (corpo.azione === "stato") {
    if (!(await utenteDellaRichiesta(req))) return rispondi({ errore: "Serve l'accesso" }, 401);
    try {
      const { data } = await db.rpc("accesso_wansport_configurato");
      return rispondi({ configurato: data === true });
    } catch {
      return rispondi({ configurato: false });
    }
  }

  if (corpo.azione === "salva") {
    if (!(await utenteDellaRichiesta(req))) return rispondi({ errore: "Serve l'accesso" }, 401);

    const utente = typeof corpo.utente === "string" ? corpo.utente.trim() : "";
    const segreto = typeof corpo.segreto === "string" ? corpo.segreto : "";
    // I limiti non sono una convalida del formato — Wansport accetta email o
    // numero di cellulare e non tocca a noi decidere quale — ma un tetto: da
    // qui in avanti finiscono nel Vault, e nel Vault ci va una credenziale,
    // non un file.
    if (!utente || !segreto || utente.length > 200 || segreto.length > 200) {
      return rispondi({ errore: "Utente e password non possono essere vuoti" }, 400);
    }

    try {
      const { error } = await db.rpc("salva_accesso_wansport", { utente, segreto });
      if (error) return rispondi({ errore: "salvataggio-fallito" }, 500);
    } catch {
      return rispondi({ errore: "salvataggio-fallito" }, 500);
    }

    // Le sessioni aperte con le credenziali di prima non valgono piu niente:
    // si buttano subito, se no per un quarto d'ora si continuerebbe a usare
    // il vecchio accesso e sembrerebbe che il salvataggio non abbia fatto
    // nulla.
    try {
      await db.from("wansport_sessioni").delete().neq("club", "");
    } catch {
      // Scadono da sole: fastidioso, non grave.
    }

    // La prova si fa sul primo club che vuole il login: se il modulo di
    // accesso sparisce, le credenziali sono buone.
    const banco = Object.values(CLUBS).find((c) => c.richiedeLogin);
    const verificato = banco ? await verificaAccesso(banco.host, utente, segreto) : false;
    return rispondi({ salvato: true, verificato });
  }

  // ── Il tabellone ───────────────────────────────────────────────────────

  const club = typeof corpo.club === "string" ? corpo.club : "";
  const configurazione = CLUBS[club];
  if (!configurazione) return rispondi({ errore: "Club sconosciuto" }, 400);

  const giorno = giornoValido(corpo.giorno);
  if (!giorno) return rispondi({ errore: "Data non valida" }, 400);

  // Un club dietro al login senza credenziali configurate: non e un errore
  // nostro ed e stabile nel tempo, l'app lo mostra come stato del club e non
  // come guasto.
  const accesso = configurazione.richiedeLogin ? await credenziali(db) : null;
  if (configurazione.richiedeLogin && !accesso) {
    return rispondi({ errore: "richiede-login", nome: configurazione.nome }, 409);
  }

  // Cache. Se qualcosa qui non funziona non e un motivo per non rispondere:
  // si perde il risparmio di chiamate, non il tabellone.
  try {
    const { data } = await db
      .from("wansport_cache")
      .select("payload, fetched_at")
      .eq("club", club)
      .eq("giorno", giorno)
      .maybeSingle();

    if (data) {
      const eta = (Date.now() - new Date(data.fetched_at).getTime()) / 1000;
      if (eta < CACHE_TTL_SECONDI) {
        return rispondi({ ...(data.payload as Tabellone), daCache: true });
      }
    }
  } catch {
    // avanti lo stesso
  }

  // Primo tentativo con quello che abbiamo in mano: la sessione salvata se il
  // club ne vuole una, niente se il pannello e aperto a tutti. Se il club
  // vuole una sessione e non ce l'abbiamo, la chiamata si salta: sarebbe un
  // no garantito, e un no garantito non vale la pena di chiederlo.
  let cookie = accesso ? await sessioneSalvata(db, club) : null;
  let grezzo =
    accesso && !cookie ? null : await chiediPannello(configurazione.host, giorno, cookie);

  // Secondo tentativo, solo dove abbiamo un accesso: la sessione puo essere
  // scaduta prima del previsto, o non esserci mai stata. Si rifa il login una
  // volta sola — se anche questo non basta, la risposta e "richiede-login" e
  // l'app manda al sito del club, che e dove l'informazione c'e comunque.
  if (accesso && (grezzo === null || respinto(grezzo))) {
    cookie = await accedi(configurazione.host, accesso.utente, accesso.segreto);
    if (cookie) {
      grezzo = await chiediPannello(configurazione.host, giorno, cookie);
      if (grezzo !== null && !respinto(grezzo)) {
        try {
          await db
            .from("wansport_sessioni")
            .upsert({ club, cookie, creata_il: new Date().toISOString() });
        } catch {
          // La sessione salvata e un risparmio di accessi, non una dipendenza.
        }
      }
    }
  }

  if (grezzo === null) return rispondi({ errore: "wansport-non-raggiungibile" }, 502);

  // Il centro puo aver chiuso il pannello da quando l'abbiamo verificato, o
  // aver disdetto la nostra iscrizione: e roba che l'amministratore del club
  // cambia quando vuole, e da qui si vede uguale.
  if (respinto(grezzo)) {
    return rispondi({ errore: "richiede-login", nome: configurazione.nome }, 409);
  }

  const tabellone = normalizza(grezzo, club, configurazione.nome, giorno);

  try {
    await db
      .from("wansport_cache")
      .upsert({ club, giorno, payload: tabellone, fetched_at: new Date().toISOString() });
  } catch {
    // vedi sopra: la cache e un risparmio, non una dipendenza
  }

  return rispondi(tabellone);
});
