// Tabellone dei campi liberi · lato client
//
// Qui non si parla con Wansport: si parla con la nostra Edge Function
// `wansport-slots`, che e l'unica a farlo. Dal browser non si potrebbe
// comunque — il CORS blocca — e non si dovrebbe, perche la risposta grezza di
// Wansport contiene i nomi di chi ha prenotato. Quello che arriva fin qui e
// gia ripulito: campi, orari, libero o occupato.

import { supabase } from "./supabase";

export type WansportSlot = {
  inizio: string;
  fine: string;
  libero: boolean;
};

export type WansportCampo = {
  id: number;
  nome: string;
  slot: WansportSlot[];
};

export type WansportTabellone = {
  club: string;
  nome: string;
  giorno: string;
  campi: WansportCampo[];
  daCache?: boolean;
};

// Un campo che si puo guardare dall'app. Le etichette sono le stesse di
// `PADEL_COURTS` in `page.tsx`: se un giorno le due liste divergono, la card
// della partita e il tabellone parlerebbero di due posti diversi con lo stesso
// nome. Il collegamento e lo slug, che deve restare uguale a quello nella
// Edge Function.
export type WansportClub = {
  slug: string;
  etichetta: string;
  // Dove mandare chi vuole guardare comunque, o prenotare.
  sito: string;
};

// Quali di questi si riescano davvero a vedere non e scritto qui, e per un
// motivo: dipende dall'accesso configurato lato server, che cambia senza che
// il codice lo sappia. Prima c'era un elenco di club "fuori portata" e andava
// tenuto allineato a mano. Ora si chiede e basta: la Edge Function risponde
// 409 se non ci arriva, e il giorno che l'accesso funziona quel club si
// accende da solo.
//
// (Fino al 10 ago 2026 qui c'era scritto che dipendeva da "dove il nostro
// account e tesserato". Non era vero: il tesseramento non c'entra, basta una
// sessione qualunque. Vedi LAVORI.md, "Il pannello dei loggati e un altro
// componente".)
export const WANSPORT_CLUBS: WansportClub[] = [
  {
    slug: "corcuera",
    etichetta: "CORCUERA - IMPERIA",
    sito: "https://corcuerapadel.wansport.com/bookingspanel",
  },
  {
    slug: "don-quique",
    etichetta: "DON QUIQUE - IMPERIA",
    sito: "https://donquiquepadelimperia.wansport.com/bookingspanel",
  },
  {
    slug: "oneglia",
    etichetta: "ONEGLIA PADEL - CASTELVECCHIO",
    sito: "https://onegliapadel.wansport.com/bookingspanel",
  },
  {
    slug: "riviera",
    etichetta: "RIVIERA PADEL - SAN LORENZO",
    sito: "https://rivierapadel.wansport.com/bookingspanel",
  },
  {
    slug: "diano",
    etichetta: "DIANO PADEL - DIANO MARINA",
    sito: "https://dianopadelacademy.wansport.com/bookingspanel",
  },
];

export type EsitoTabellone =
  | { stato: "ok"; tabellone: WansportTabellone }
  | { stato: "richiede-login" }
  | { stato: "errore" };

// La data nel formato che vuole Wansport, letta sull'ora italiana e non su
// quella del dispositivo: un telefono col fuso sbagliato chiederebbe il
// tabellone del giorno prima senza che nessuno se ne accorga.
export function giornoIso(scarto = 0): string {
  const adesso = new Date();
  adesso.setDate(adesso.getDate() + scarto);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(adesso);
}

// I minuti passati da mezzanotte, in Italia. Serve a nascondere gli slot gia
// passati: un campo libero alle 9 non e un campo libero, se sono le 11.
export function minutiDiOggi(): number {
  const ore = new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
  const [h, m] = ore.split(":");
  return Number(h) * 60 + Number(m);
}

export function minutiDa(orario: string): number {
  const [h, m] = orario.split(":");
  return Number(h) * 60 + Number(m);
}

// ── L'accesso Wansport del gruppo ────────────────────────────────────────
//
// Le credenziali si mettono dal profilo e da li in poi non si rivedono piu:
// vanno nel Vault del database e le rilegge solo la Edge Function. Da qui si
// puo sapere se ci sono e sostituirle, non leggerle — non c'e nessuna
// chiamata che le restituisca, ed e voluto.

export async function accessoConfigurato(): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.functions.invoke<{ configurato?: boolean }>(
    "wansport-slots",
    { body: { azione: "stato" } },
  );
  return !error && data?.configurato === true;
}

export type EsitoSalvataggio = "salvato" | "salvato-ma-non-passa" | "errore";

export async function salvaAccesso(utente: string, segreto: string): Promise<EsitoSalvataggio> {
  if (!supabase) return "errore";
  const { data, error } = await supabase.functions.invoke<{
    salvato?: boolean;
    verificato?: boolean;
  }>("wansport-slots", { body: { azione: "salva", utente, segreto } });

  if (error || !data?.salvato) return "errore";
  // Salvato e verificato sono due cose diverse: la password finisce nel Vault
  // comunque, ma se il login non passa e meglio dirlo adesso che lasciarlo
  // scoprire davanti al campo.
  return data.verificato ? "salvato" : "salvato-ma-non-passa";
}

export async function leggiTabellone(club: string, giorno: string): Promise<EsitoTabellone> {
  if (!supabase) return { stato: "errore" };

  const { data, error } = await supabase.functions.invoke<WansportTabellone | { errore: string }>(
    "wansport-slots",
    { body: { club, giorno } },
  );

  if (error) {
    // Il centro che apre il tabellone solo ai suoi iscritti non e un guasto: e
    // una risposta, e l'app la racconta come tale. supabase-js impacchetta i
    // codici diversi da 2xx dentro un errore, quindi il corpo va ripescato.
    const risposta = (error as { context?: Response }).context;
    if (risposta?.status === 409) return { stato: "richiede-login" };
    return { stato: "errore" };
  }

  if (!data || "errore" in data) {
    return data && "errore" in data && data.errore === "richiede-login"
      ? { stato: "richiede-login" }
      : { stato: "errore" };
  }

  return { stato: "ok", tabellone: data };
}
