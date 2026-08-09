"use client";

// Il tabellone dei campi liberi.
//
// Vive in un file suo e non dentro `page.tsx` per una ragione pratica: quel
// file lo tocchiamo in due e i conflitti nascono tutti li. Qui dentro non c'e
// niente che serva al resto dell'app, quindi non c'e motivo di aggiungere
// duecento righe a un file da seimila. In `page.tsx` restano tre righe di
// aggancio.
//
// Cosa mostra: le fasce libere, non le caselle. Wansport ragiona a mezz'ora,
// ma nessuno prenota mezz'ora di padel — la domanda vera e "da che ora posso
// partire, e per quanto".

import { useCallback, useEffect, useState } from "react";
import {
  WANSPORT_CLUBS,
  fasceLibere,
  giornoIso,
  leggiTabellone,
  minutiDiOggi,
  type EsitoTabellone,
} from "../lib/wansport";

// Quattro giorni: oggi piu tre. Piu in la il tabellone e quasi tutto libero e
// non dice niente, e ogni giorno in piu e una chiamata in piu al sito del club.
const GIORNI = [0, 1, 2, 3];

// La durata di una partita. Sotto a questa una finestra libera esiste ma non
// serve, e va detto invece di lasciarla sembrare un'occasione.
const PARTITA_MINUTI = 90;

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
  const [esito, setEsito] = useState<EsitoTabellone | null>(null);
  const [attesa, setAttesa] = useState(true);

  const club = WANSPORT_CLUBS.find((c) => c.slug === slug) ?? WANSPORT_CLUBS[0];

  const carica = useCallback(async () => {
    setAttesa(true);
    // Il club che tiene il tabellone dietro al login lo sappiamo gia: inutile
    // far partire una chiamata per farsi dire di no.
    if (club.richiedeLogin) {
      setEsito({ stato: "richiede-login" });
      setAttesa(false);
      return;
    }
    setEsito(await leggiTabellone(club.slug, giornoIso(scarto)));
    setAttesa(false);
  }, [club.richiedeLogin, club.slug, scarto]);

  useEffect(() => {
    let vivo = true;
    // La guardia serve a scartare la risposta di una richiesta che nel
    // frattempo non interessa piu: cambiando club in fretta, altrimenti,
    // l'ultima ad arrivare vince anche se non e quella chiesta per ultima.
    (async () => {
      await carica();
      if (!vivo) return;
    })();
    return () => {
      vivo = false;
    };
  }, [carica]);

  // Gli slot gia passati si nascondono solo oggi: domani sono tutti futuri.
  const daMinuti = scarto === 0 ? minutiDiOggi() : -1;

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
      ) : esito?.stato === "ok" ? (
        <div className="wansport-campi">
          {esito.tabellone.campi.map((campo) => {
            const fasce = fasceLibere(campo.slot, daMinuti);
            return (
              <section className="wansport-campo" key={campo.id}>
                <h3>{campo.nome}</h3>
                {fasce.length ? (
                  <ul className="wansport-fasce">
                    {fasce.map((f) => (
                      <li
                        key={f.inizio}
                        className={f.durata >= PARTITA_MINUTI ? "is-partita" : ""}
                      >
                        <b>
                          {f.inizio}–{f.fine}
                        </b>
                        <span>
                          {f.durata >= 60
                            ? `${Math.floor(f.durata / 60)}h${f.durata % 60 ? ` ${f.durata % 60}′` : ""}`
                            : `${f.durata}′`}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="wansport-pieno">Tutto occupato</p>
                )}
              </section>
            );
          })}
          <a className="wansport-link" href={club.sito} target="_blank" rel="noreferrer">
            Prenota sul sito del club
          </a>
        </div>
      ) : null}
    </div>
  );
}
