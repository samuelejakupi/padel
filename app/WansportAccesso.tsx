"use client";

// Il riquadro nel profilo da cui si mette l'account Wansport del gruppo.
//
// Perche sta nel profilo e non in un pannello di amministrazione: uno di noi
// e iscritto a Wansport e i club lo tesserano; quell'accesso serve a tutti,
// quindi si mette una volta e vale per l'app intera. Non e "il tuo account
// Wansport", ed e per questo che il testo qui dentro dice "del gruppo": chi
// legge deve capire che sta configurando una cosa comune, non un suo dato.
//
// Cosa NON fa: rileggere. Non esiste una chiamata che restituisca la
// password, nemmeno mascherata — si puo sapere se c'e e sostituirla, non
// vederla. Le due caselle partono sempre vuote apposta.
//
// Vive in un file suo per la stessa ragione di `WansportBoard`: `page.tsx` lo
// tocchiamo in due e i conflitti nascono tutti li.

import { useEffect, useState } from "react";
import { accessoConfigurato, salvaAccesso } from "../lib/wansport";

export default function WansportAccesso() {
  const [configurato, setConfigurato] = useState<boolean | null>(null);
  const [utente, setUtente] = useState("");
  const [segreto, setSegreto] = useState("");
  const [aperto, setAperto] = useState(false);
  const [nota, setNota] = useState("");
  const [invio, setInvio] = useState(false);

  useEffect(() => {
    let vivo = true;
    void accessoConfigurato().then((c) => {
      if (vivo) setConfigurato(c);
    });
    return () => {
      vivo = false;
    };
  }, []);

  async function salva() {
    if (!utente.trim() || !segreto || invio) return;
    setInvio(true);
    setNota("");
    const esito = await salvaAccesso(utente.trim(), segreto);
    setInvio(false);

    if (esito === "errore") {
      setNota("Non sono riuscito a salvarlo. Riprova.");
      return;
    }

    // La password sparisce dal campo appena e partita: da quel momento vive
    // nel Vault e in nessun altro posto, tantomeno nella memoria del telefono.
    setSegreto("");
    setUtente("");
    setAperto(false);
    setConfigurato(true);
    setNota(
      esito === "salvato"
        ? "Accesso salvato: i club dove sei tesserato ora si vedono."
        : "Salvato, ma il login non passa. Controlla utente e password.",
    );
  }

  return (
    <div className="wansport-accesso">
      <p className="eyebrow dark">CAMPI LIBERI</p>
      <p className="wansport-accesso-testo">
        {configurato === null
          ? "Sto controllando l'accesso Wansport…"
          : configurato
            ? "L'accesso Wansport del gruppo è impostato. I centri dove l'account è tesserato mostrano il tabellone a tutti."
            : "Senza un accesso Wansport si vede solo Corcuera: gli altri centri aprono il tabellone ai soli tesserati."}
      </p>

      {aperto ? (
        <>
          <label>
            Utente Wansport
            <input
              value={utente}
              onChange={(e) => setUtente(e.target.value)}
              autoComplete="off"
              placeholder="email o cellulare"
            />
          </label>
          <label>
            Password Wansport
            <input
              type="password"
              value={segreto}
              onChange={(e) => setSegreto(e.target.value)}
              autoComplete="new-password"
            />
          </label>
          <p className="wansport-accesso-nota">
            Finisce cifrata nel Vault di Supabase, che tiene la chiave fuori dal database. Non
            torna più indietro: nessuno, nemmeno tu, potrà rileggerla da qui.
          </p>
          <div className="wansport-accesso-comandi">
            <button
              type="button"
              className="button button-ghost"
              onClick={() => {
                setAperto(false);
                setSegreto("");
              }}
            >
              Annulla
            </button>
            <button
              type="button"
              className="button button-primary"
              onClick={() => void salva()}
              disabled={invio || !utente.trim() || !segreto}
            >
              {invio ? "Verifico…" : "Salva accesso"}
            </button>
          </div>
        </>
      ) : (
        <button type="button" className="button button-ghost" onClick={() => setAperto(true)}>
          {configurato ? "Cambia accesso Wansport" : "Imposta accesso Wansport"}
        </button>
      )}

      {nota ? <p className="wansport-accesso-esito">{nota}</p> : null}
    </div>
  );
}
