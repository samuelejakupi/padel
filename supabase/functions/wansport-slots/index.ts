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
// `richiedeLogin` segna i centri che rispondono {"success": false} a chi non e
// registrato presso di loro: il gate di Wansport e per club e vale anche sul
// dato, non solo sulla pagina. Restano elencati lo stesso perche l'app possa
// spiegare *perche* non li mostra invece di far finta che non esistano.
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

// L'id con cui Wansport identifica il padel. E lo stesso su tutti i centri.
const SPORT_PADEL = 15;

// Quanto teniamo buona una risposta. Un minuto: abbastanza da non ripetere la
// stessa chiamata quando in tre aprono l'app insieme, abbastanza poco da non
// mostrare come libero un campo appena preso.
const CACHE_TTL_SECONDI = 60;

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const rispondi = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  let corpo: { club?: string; giorno?: string };
  try {
    corpo = await req.json();
  } catch {
    return rispondi({ errore: "Richiesta non leggibile" }, 400);
  }

  const club = typeof corpo.club === "string" ? corpo.club : "";
  const configurazione = CLUBS[club];
  if (!configurazione) return rispondi({ errore: "Club sconosciuto" }, 400);

  const giorno = giornoValido(corpo.giorno);
  if (!giorno) return rispondi({ errore: "Data non valida" }, 400);

  if (configurazione.richiedeLogin) {
    // Non e un errore nostro ed e stabile nel tempo: l'app lo mostra come
    // stato del club, non come guasto.
    return rispondi({ errore: "richiede-login", nome: configurazione.nome }, 409);
  }

  const db = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

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

  const indirizzo = new URL(`https://${configurazione.host}/index.php`);
  indirizzo.searchParams.set("option", "com_wsinit");
  indirizzo.searchParams.set("task", "prenotazioni.getPannelloPrenotazioni");
  indirizzo.searchParams.set("format", "raw");
  indirizzo.searchParams.set("filtroData", giorno);
  indirizzo.searchParams.set("filtroSport", String(SPORT_PADEL));

  let grezzo: unknown;
  try {
    const risposta = await fetch(indirizzo, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!risposta.ok) return rispondi({ errore: "wansport-non-raggiungibile" }, 502);
    grezzo = await risposta.json();
  } catch {
    return rispondi({ errore: "wansport-non-raggiungibile" }, 502);
  }

  // Il centro puo aver chiuso il pannello da quando l'abbiamo verificato: e
  // un'impostazione che l'amministratore del club cambia quando vuole.
  if ((grezzo as { success?: boolean })?.success === false) {
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
