"use client";

// Un raccoglitore che si apre e si chiude.
//
// Stava dentro `page.tsx`, dove era nato per i mesi del foglio delle partite.
// Il 10 ago 2026 e passato di qui perche serviva anche al foglio dei campi
// liberi, e le due strade erano copiarlo o spostarlo. Copiarlo voleva dire
// due animazioni da tenere uguali a mano, che e esattamente il modo in cui
// diventano diverse — la stessa ragione per cui il carosello e uno solo.
//
// Il nome resta `MonthGroup` anche se ora raccoglie pure i club: le classi
// CSS si chiamano `month-*` e rinominare le une senza le altre farebbe piu
// danno che chiarezza. Se un giorno si rinomina, si rinomina tutto insieme.
//
// L'altezza si anima a mano perche da "0" a "auto" il browser non sa
// interpolare: si misura il contenuto, si va da una misura all'altra, e
// appena arrivati si torna ad "auto" — se restasse un numero fisso, un elenco
// che cambia resterebbe tagliato.

import { useEffect, useRef, type ReactNode } from "react";

export default function MonthGroup({
  label,
  count,
  open,
  onToggle,
  children,
}: {
  label: string;
  // Facoltativo: i mesi dicono quante partite contengono, i club non hanno
  // niente da contare prima di essere aperti. Senza, la freccia perderebbe la
  // spinta che la tiene a destra, e ci pensa `is-senza-conteggio`.
  count?: number;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const mounted = useRef(false);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    // Al primo disegno nessuna animazione: il foglio si apre già con tutti i
    // raccoglitori chiusi, e vederli richiudersi sarebbe un movimento di
    // troppo.
    if (!mounted.current) {
      mounted.current = true;
      body.style.height = open ? "auto" : "0px";
      return;
    }
    const from = body.getBoundingClientRect().height;
    const to = open ? body.scrollHeight : 0;
    body.style.height = `${to}px`;
    if (!body.animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      if (open) body.style.height = "auto";
      return;
    }
    const animation = body.animate(
      [
        { height: `${from}px`, opacity: open ? 0.4 : 1 },
        { height: `${to}px`, opacity: open ? 1 : 0.4 },
      ],
      {
        // Aperture più lente delle chiusure: entrando c'è qualcosa da
        // guardare arrivare, uscendo si toglie di mezzo e basta. È il passo
        // dei pannelli di sistema.
        duration: open ? 420 : 280,
        easing: open ? "cubic-bezier(0.32, 0.9, 0.28, 1)" : "cubic-bezier(0.4, 0, 0.9, 0.35)",
      },
    );
    animation.finished.then(
      () => { if (open) body.style.height = "auto"; },
      () => {},
    );
  }, [open]);

  return (
    <div className={`month-group${open ? " is-open" : ""}`}>
      <button
        type="button"
        className={`month-head${count === undefined ? " is-senza-conteggio" : ""}`}
        onClick={onToggle}
        aria-expanded={open}
      >
        <b>{label}</b>
        {count === undefined ? null : <span className="month-count">{count}</span>}
        <i className="month-chevron" aria-hidden="true" />
      </button>
      <div className="month-body" ref={bodyRef}>
        <div className="month-body-inner">{children}</div>
      </div>
    </div>
  );
}
