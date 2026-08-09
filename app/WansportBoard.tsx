"use client";

// Il tabellone dei campi liberi.
//
// Vive in un file suo e non dentro `page.tsx` per una ragione pratica: quel
// file lo tocchiamo in due e i conflitti nascono tutti li. Qui dentro non c'e
// niente che serva al resto dell'app, quindi non c'e motivo di aggiungere
// duecento righe a un file da seimila. In `page.tsx` restano tre righe di
// aggancio.
//
// La forma e quella di una tabella vera: una riga per campo, una colonna per
// mezz'ora, che scorre di lato. E il modo in cui il tabellone si legge al
// club — si scende lungo l'ora e si guarda quale campo e libero — e provare a
// riassumerlo in un elenco di fasce faceva perdere proprio quel confronto fra
// un campo e l'altro.

import { useEffect, useState } from "react";
import {
  WANSPORT_CLUBS,
  giornoIso,
  leggiTabellone,
  minutiDa,
  minutiDiOggi,
  type EsitoTabellone,
} from "../lib/wansport";

// Quattro giorni: oggi piu tre. Piu in la il tabellone e quasi tutto libero e
// non dice niente, e ogni giorno in piu e una chiamata in piu al sito del club.
const GIORNI = [0, 1, 2, 3];

function nomeGiorno(scarto: number): string {
  if (scarto === 0) return "Oggi";
  if (scarto === 1) return "Domani";
  const giorno = new Date();
  giorno.setDate(giorno.getDate() + scarto);
  return new Intl.DateTimeFormat("it-IT", { weekday: "short", timeZone: "Europe/Rome" })
    .format(giorno)
    .replace(".", "");
}

export default function WansportBoard() {
  const [slug, setSlug] = useState(WANSPORT_CLUBS[0].slug);
  const [scarto, setScarto] = useState(0);
  // La risposta si porta dietro la domanda a cui rispondeva. Cosi non serve
  // uno stato "sto caricando" da accendere e spegnere a mano: se la risposta
  // in mano e di un'altra domanda, stiamo aspettando. Ed e anche il rimedio
  // alla corsa fra due chiamate — cambi club due volte di fila e la prima
  // risposta arriva per ultima — perche una risposta vecchia non combacia con
  // la domanda di adesso e resta dov'e.
  const [risposta, setRisposta] = useState<{ chiave: string; esito: EsitoTabellone } | null>(null);

  const club = WANSPORT_CLUBS.find((c) => c.slug === slug) ?? WANSPORT_CLUBS[0];
  const chiave = `${club.slug}|${scarto}`;

  useEffect(() => {
    // Il club che tiene il tabellone dietro al login lo sappiamo gia: inutile
    // far partire una chiamata per farsi dire di no.
    if (club.richiedeLogin) return;
    let vivo = true;
    const chiesta = `${club.slug}|${scarto}`;
    // Lo stato si tocca solo qui dentro, quando la risposta arriva. Scriverlo
    // subito nel corpo dell'effetto e quello che `react-hooks` non vuole: e
    // un secondo giro di disegno appiccicato al primo.
    void leggiTabellone(club.slug, giornoIso(scarto)).then((esito) => {
      if (vivo) setRisposta({ chiave: chiesta, esito });
    });
    return () => {
      vivo = false;
    };
  }, [club.richiedeLogin, club.slug, scarto]);

  const esito: EsitoTabellone | null = club.richiedeLogin
    ? { stato: "richiede-login" }
    : risposta?.chiave === chiave
      ? risposta.esito
      : null;
  const attesa = !club.richiedeLogin && risposta?.chiave !== chiave;

  // Le ore gia passate restano nel tabellone. Toglierle faceva partire la
  // giornata da un punto diverso a ogni ora, e nel confronto fra i campi la
  // mattina serve lo stesso: si guarda anche per capire com'e andata, o per
  // sapere se un campo e pieno da stamattina. Vengono spente, non nascoste.
  const adesso = scarto === 0 ? minutiDiOggi() : -1;

  const tabellone = esito?.stato === "ok" ? esito.tabellone : null;

  // Le colonne sono l'unione degli orari di tutti i campi, non quelli del
  // primo: due campi dello stesso centro possono avere aperture diverse, e
  // fidarsi del primo lascerebbe l'altro disallineato di una casella.
  const orari = tabellone
    ? Array.from(
        new Set(tabellone.campi.flatMap((campo) => campo.slot.map((s) => s.inizio))),
      ).sort((a, b) => minutiDa(a) - minutiDa(b))
    : [];

  return (
    <div className="wansport">
      <div className="wansport-filtri">
        <div className="wansport-chips" role="group" aria-label="Campo">
          {WANSPORT_CLUBS.map((c) => (
            <button
              key={c.slug}
              className={`wansport-chip${c.slug === slug ? " is-current" : ""}`}
              onClick={() => setSlug(c.slug)}
              type="button"
            >
              {/* Nell'etichetta il paese viene dopo il trattino e qui non
                  serve: la chip e stretta e il posto lo sai gia. */}
              {c.etichetta.split(" - ")[0]}
            </button>
          ))}
        </div>

        <div className="wansport-chips" role="group" aria-label="Giorno">
          {GIORNI.map((g) => (
            <button
              key={g}
              className={`wansport-chip${g === scarto ? " is-current" : ""}`}
              onClick={() => setScarto(g)}
              type="button"
            >
              {nomeGiorno(g)}
            </button>
          ))}
        </div>
      </div>

      {attesa ? (
        <p className="wansport-nota">Sto guardando il tabellone…</p>
      ) : esito?.stato === "richiede-login" ? (
        <div className="wansport-nota">
          <p>
            {club.etichetta.split(" - ")[0]} mostra gli orari solo a chi e registrato da loro. Il
            tabellone si apre sul loro sito.
          </p>
          <a className="wansport-link" href={club.sito} target="_blank" rel="noreferrer">
            Apri il tabellone del club
          </a>
        </div>
      ) : esito?.stato === "errore" ? (
        <div className="wansport-nota">
          {/* Il tabellone e di Wansport e puo cambiare senza avvisarci. Il
              giorno che succede questa schermata deve restare utile: il link
              porta dove l'informazione c'e comunque. */}
          <p>Non sono riuscito a leggere gli orari.</p>
          <a className="wansport-link" href={club.sito} target="_blank" rel="noreferrer">
            Apri il tabellone del club
          </a>
        </div>
      ) : tabellone ? (
        <>
          {orari.length ? (
            <div className="wansport-tabellone">
              <table>
                <thead>
                  <tr>
                    {/* L'angolo resta vuoto: sopra ai nomi dei campi non c'e
                        niente da intitolare, e la parola "campo" ripeterebbe
                        quello che si legge nella colonna sotto. */}
                    <th className="wansport-angolo" scope="col">
                      <span className="wansport-muto">Campo</span>
                    </th>
                    {orari.map((o) => (
                      // Solo le ore piene portano l'etichetta: con una scritta
                      // ogni mezz'ora la riga diventa un muro di numeri e non
                      // si legge piu niente. Le caselle restano tutte della
                      // stessa misura — l'ora e la mezza valgono uguale — e a
                      // dire dove comincia l'ora e una riga sottile nello
                      // stacco fra le due, non una casella piu larga.
                      <th key={o} scope="col" className={o.endsWith(":00") ? "is-ora" : ""}>
                        {o.endsWith(":00") ? o.slice(0, 2) : ""}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tabellone.campi.map((campo) => {
                    const stato = new Map(campo.slot.map((s) => [s.inizio, s.libero]));
                    return (
                      <tr key={campo.id}>
                        <th scope="row">{campo.nome}</th>
                        {orari.map((o) => {
                          const libero = stato.get(o);
                          // L'ora passata copre il libero e l'occupato: un
                          // campo libero alle nove, se sono le undici, non e
                          // un campo libero, e il verde sarebbe una promessa
                          // che non si puo mantenere. Non copre pero il
                          // chiuso, che resta chiuso a qualsiasi ora: li il
                          // centro non ha mai avuto niente da vendere.
                          const scaduto = minutiDa(o) < adesso;
                          const segno =
                            libero === undefined
                              ? "is-chiuso"
                              : scaduto
                                ? "is-scaduto"
                                : libero
                                  ? "is-libero"
                                  : "is-occupato";
                          const detto =
                            libero === undefined
                              ? "chiuso"
                              : scaduto
                                ? "passato"
                                : libero
                                  ? "libero"
                                  : "occupato";
                          return (
                            <td
                              key={o}
                              className={`${segno}${o.endsWith(":00") ? " is-ora" : ""}`}
                              aria-label={`${campo.nome}, ${o}, ${detto}`}
                            />
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="wansport-nota">Per questo giorno il centro non ha orari.</p>
          )}

          <div className="wansport-legenda">
            <span className="is-libero">Libero</span>
            <span className="is-occupato">Occupato</span>
            {/* La voce dello scaduto compare solo oggi: sugli altri giorni
                non c'e niente di passato da spiegare. */}
            {scarto === 0 ? <span className="is-scaduto">Passato</span> : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
