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
  // Il centro apre il tabellone solo a chi e registrato da loro. Lo sappiamo
  // in anticipo, quindi lo diciamo prima di far aspettare qualcuno per niente.
  richiedeLogin: boolean;
  // Dove mandare chi vuole guardare comunque, o prenotare.
  sito: string;
};

export const WANSPORT_CLUBS: WansportClub[] = [
  {
    slug: "corcuera",
    etichetta: "CORCUERA - IMPERIA",
    richiedeLogin: false,
    sito: "https://corcuerapadel.wansport.com/bookingspanel",
  },
  {
    slug: "don-quique",
    etichetta: "DON QUIQUE - IMPERIA",
    richiedeLogin: true,
    sito: "https://donquiquepadelimperia.wansport.com/bookingspanel",
  },
  {
    slug: "oneglia",
    etichetta: "ONEGLIA PADEL - CASTELVECCHIO",
    richiedeLogin: true,
    sito: "https://onegliapadel.wansport.com/bookingspanel",
  },
  {
    slug: "riviera",
    etichetta: "RIVIERA PADEL - SAN LORENZO",
    richiedeLogin: true,
    sito: "https://rivierapadel.wansport.com/bookingspanel",
  },
  {
    slug: "diano",
    etichetta: "DIANO PADEL - DIANO MARINA",
    richiedeLogin: true,
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

export type FasciaLibera = {
  inizio: string;
  fine: string;
  durata: number;
};

// Gli slot arrivano da mezz'ora l'uno, ma nessuno prenota mezz'ora di padel: si
// gioca un'ora e mezza. Un elenco di trenta caselle verdi non risponde alla
// domanda che ci si fa davvero, che e "da che ora posso partire". Qui le
// caselle contigue diventano una fascia sola, e la durata dice subito se ci sta
// una partita.
export function fasceLibere(slot: WansportSlot[], daMinuti = -1): FasciaLibera[] {
  const fasce: FasciaLibera[] = [];
  let corrente: FasciaLibera | null = null;

  for (const s of slot) {
    const inizio = minutiDa(s.inizio);
    const fine = minutiDa(s.fine);
    const utile = s.libero && fine > daMinuti;

    if (!utile) {
      corrente = null;
      continue;
    }

    // Contiguo alla fascia che stavamo costruendo? Si allunga. Altrimenti se ne
    // apre una nuova: fra le 10:00 e le 11:30 con le 10:30 occupate ci sono due
    // finestre, non una da un'ora e mezza.
    if (corrente && minutiDa(corrente.fine) === inizio) {
      corrente.fine = s.fine;
      corrente.durata = minutiDa(corrente.fine) - minutiDa(corrente.inizio);
      continue;
    }

    corrente = { inizio: s.inizio, fine: s.fine, durata: fine - inizio };
    fasce.push(corrente);
  }

  return fasce;
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
