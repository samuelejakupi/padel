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
// mezz'ora. E il modo in cui il tabellone si legge al club — si scende lungo
// l'ora e si guarda quale campo e libero — e provare a riassumerlo in un
// elenco di fasce faceva perdere proprio quel confronto fra un campo e
// l'altro.
//
// I club sono raccoglitori, non pastiglie (10 ago 2026). Con cinque centri le
// pastiglie andavano a capo e non si capiva piu quale fosse quello aperto:
// cinque nomi in fila, uno nero, e il tabellone sotto senza intestazione. Il
// raccoglitore invece ha il nome attaccato al suo contenuto. E la stessa
// forma dei mesi nel foglio delle partite — stesso componente, non una copia
// — quindi si apre uno per volta e il primo e gia aperto quando il foglio
// sale: chi entra vuole vedere un tabellone, non un elenco da aprire.

import { useEffect, useState } from "react";
import MonthGroup from "./MonthGroup";
import {
  WANSPORT_CLUBS,
  giornoIso,
  leggiTabellone,
  minutiDa,
  minutiDiOggi,
  type EsitoTabellone,
  type WansportCampo,
  type WansportClub,
} from "../lib/wansport";

// Quattro giorni: oggi piu tre. Piu in la il tabellone e quasi tutto libero e
// non dice niente, e ogni giorno in piu e una chiamata in piu al sito del club.
const GIORNI = [0, 1, 2, 3];

// Dove si taglia la giornata (10 ago 2026). Dalle otto alle undici di sera
// sono trenta mezz'ore: in una riga sola stanno solo scorrendo di lato, e una
// casella larga tre millimetri non la legge nessuno — men che meno quella e
// solo quella che ti interessa. Spezzata in due, ogni meta ci sta quasi
// intera e le caselle raddoppiano.
//
// Le 14 e non le 12: a mezzogiorno si gioca ancora, e "mattino" che finisce
// mentre il campo e pieno non descrive niente. Dopo pranzo invece la giornata
// cambia davvero — e chi cerca un campo di solito sa gia in quale delle due
// meta guardare.
const TAGLIO_POMERIGGIO = 14 * 60;

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
  // Quale raccoglitore e aperto. Uno solo, e il primo lo e gia in partenza.
  // Puo essere `null` — richiudendo quello aperto non se ne apre un altro
  // d'ufficio: e la stessa liberta che hanno i mesi.
  const [apertoSlug, setApertoSlug] = useState<string | null>(WANSPORT_CLUBS[0].slug);
  // Il giorno sta qui e non dentro il singolo club apposta: cambiando centro
  // si continua a guardare lo stesso giorno, che e quello che si sta
  // cercando. Ricominciare da "Oggi" a ogni apertura farebbe rifare la strada.
  const [scarto, setScarto] = useState(0);

  return (
    <div className="wansport">
      <div className="month-groups">
        {WANSPORT_CLUBS.map((club) => (
          <MonthGroup
            key={club.slug}
            // Nell'etichetta il paese viene dopo il trattino: nel
            // raccoglitore ci sta, ed e quello che distingue i due centri di
            // San Lorenzo da quelli di Imperia.
            label={club.etichetta}
            open={club.slug === apertoSlug}
            onToggle={() => setApertoSlug((corrente) => (corrente === club.slug ? null : club.slug))}
          >
            <CorpoClub
              club={club}
              aperto={club.slug === apertoSlug}
              scarto={scarto}
              onGiorno={setScarto}
            />
          </MonthGroup>
        ))}
      </div>
    </div>
  );
}

// Il contenuto di un raccoglitore: i giorni e la griglia di quel centro.
//
// Resta montato anche da chiuso, e non e una svista. Se sparisse alla
// chiusura, il raccoglitore si richiuderebbe su una scatola gia vuota invece
// di veder scendere quello che c'era; e riaprendolo si ricomincerebbe da
// "sto guardando" ogni volta. Quello che non fa da chiuso e chiedere: la
// chiamata al club parte solo se il raccoglitore e aperto, se no aprire il
// foglio ne farebbe cinque in un colpo, una per centro, per mostrarne una.
function CorpoClub({
  club,
  aperto,
  scarto,
  onGiorno,
}: {
  club: WansportClub;
  aperto: boolean;
  scarto: number;
  onGiorno: (scarto: number) => void;
}) {
  // La risposta si porta dietro la domanda a cui rispondeva. Cosi non serve
  // uno stato "sto caricando" da accendere e spegnere a mano: se la risposta
  // in mano e di un'altra domanda, stiamo aspettando. Ed e anche il rimedio
  // alla corsa fra due chiamate — cambi giorno due volte di fila e la prima
  // risposta arriva per ultima — perche una risposta vecchia non combacia con
  // la domanda di adesso e resta dov'e.
  const [risposta, setRisposta] = useState<{ chiave: string; esito: EsitoTabellone } | null>(null);

  const chiave = `${club.slug}|${scarto}`;

  useEffect(() => {
    if (!aperto) return;
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
  }, [aperto, club.slug, scarto]);

  const esito: EsitoTabellone | null = risposta?.chiave === chiave ? risposta.esito : null;
  const attesa = risposta?.chiave !== chiave;

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

  // Una fascia vuota non si disegna: un centro che apre alle 15 non ha un
  // mattino da mostrare, e un'intestazione sopra il nulla e peggio del nulla.
  const fasce = [
    { nome: "Mattino", orari: orari.filter((o) => minutiDa(o) < TAGLIO_POMERIGGIO) },
    { nome: "Pomeriggio", orari: orari.filter((o) => minutiDa(o) >= TAGLIO_POMERIGGIO) },
  ].filter((fascia) => fascia.orari.length > 0);

  return (
    <>
      <div className="wansport-filtri">
        <div className="wansport-chips" role="group" aria-label="Giorno">
          {GIORNI.map((g) => (
            <button
              key={g}
              className={`wansport-chip${g === scarto ? " is-current" : ""}`}
              onClick={() => onGiorno(g)}
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
            {club.etichetta.split(" - ")[0]} in questo momento non ci fa leggere gli orari. Il
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
          {fasce.length ? (
            fasce.map((fascia) => (
              <div className="wansport-fascia" key={fascia.nome}>
                <h4 className="wansport-fascia-nome">{fascia.nome}</h4>
                <Griglia campi={tabellone.campi} orari={fascia.orari} adesso={adesso} />
              </div>
            ))
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
    </>
  );
}

// Mezza giornata di tabellone. I campi sono sempre tutti: una fascia mostra
// meno ore, non meno campi, se no il confronto fra un campo e l'altro — che e
// tutto il motivo per cui questa e una tabella — si perderebbe a meta pagina.
function Griglia({
  campi,
  orari,
  adesso,
}: {
  campi: WansportCampo[];
  orari: string[];
  adesso: number;
}) {
  return (
    <div className="wansport-tabellone">
      <table>
        <thead>
          <tr>
            {/* L'angolo resta vuoto: sopra ai nomi dei campi non c'e niente
                da intitolare, e la parola "campo" ripeterebbe quello che si
                legge nella colonna sotto. */}
            <th className="wansport-angolo" scope="col">
              <span className="wansport-muto">Campo</span>
            </th>
            {orari.map((o) => (
              // Solo le ore piene portano l'etichetta: con una scritta ogni
              // mezz'ora la riga diventa un muro di numeri e non si legge piu
              // niente. Le caselle restano tutte della stessa misura — l'ora
              // e la mezza valgono uguale — e a dire dove comincia l'ora e
              // una riga sottile nello stacco fra le due, non una casella
              // piu larga.
              <th key={o} scope="col" className={o.endsWith(":00") ? "is-ora" : ""}>
                {o.endsWith(":00") ? o.slice(0, 2) : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {campi.map((campo) => {
            const stato = new Map(campo.slot.map((s) => [s.inizio, s.libero]));
            return (
              <tr key={campo.id}>
                <th scope="row">{campo.nome}</th>
                {orari.map((o) => {
                  const libero = stato.get(o);
                  // L'ora passata copre il libero e l'occupato: un campo
                  // libero alle nove, se sono le undici, non e un campo
                  // libero, e il verde sarebbe una promessa che non si puo
                  // mantenere. Non copre pero il chiuso, che resta chiuso a
                  // qualsiasi ora: li il centro non ha mai avuto niente da
                  // vendere.
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
  );
}
