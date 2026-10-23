"use client";

import { Fragment, type ReactNode, useEffect, useRef, useState } from "react";

// Quanto camminano i nastri di emblemi e trofei, in pixel al secondo. Lenti:
// sono vetrine, non tabelloni da rincorrere.
const CABINET_MARQUEE_SPEED = 22;
// Lo stacco fra un oggetto e l'altro, e anche fra la fine di una fila e
// l'inizio della sua copia: se fosse diverso il giro si vedrebbe.
const CABINET_MARQUEE_GAP = 8;

// Il nastro comune a emblemi e trofei. Sul telefono la fila cammina da sola e
// resta anche trascinabile col dito.
// Il giro si chiude perche la fila e scritta due volte: quando l'animazione
// torna a zero la seconda copia sta esattamente dove stava la prima, quindi il
// salto cade su pixel identici e non si vede. Se gli emblemi ci stanno tutti il
// nastro resta fermo e la copia non viene nemmeno scritta.
export default function CabinetMarquee<T>({
  items,
  rowClassName,
  keyOf,
  renderItem,
}: {
  items: T[];
  rowClassName: string;
  keyOf: (item: T) => string;
  renderItem: (item: T, ghost: boolean) => ReactNode;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const laneRef = useRef<HTMLDivElement | null>(null);
  // La prima fila sta in uno stato e non in un ref perche serve a far ripartire
  // la misura quando compare: con un ref l'effetto girerebbe prima che il nodo
  // esista.
  const [row, setRow] = useState<HTMLDivElement | null>(null);
  const [shift, setShift] = useState(0);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!row || !viewport) return;
    if (typeof window === "undefined") return;

    function measure() {
      if (!row || !viewport) return;
      const fila = row.getBoundingClientRect().width;
      const finestra = viewport.getBoundingClientRect().width;
      // Il pixel di margine e per gli arrotondamenti: senza, una fila larga
      // quanto la finestra partiva a camminare per un decimo di pixel.
      setShift(fila > finestra + 1 ? fila + CABINET_MARQUEE_GAP : 0);
    }

    measure();
    // Gli oggetti possono contenere immagini: la fila e piu corta finche non sono arrivate, e
    // una misura sola presa troppo presto direbbe che ci stanno.
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [row, items.length]);

  // Il nastro cammina spostando lo scorrimento della finestra invece di
  // traslare la fila. E la stessa striscia, ma cosi la si puo prendere e
  // trascinare col dito: con una trasformazione le due cose si sarebbero
  // pestate i piedi, e chi scorreva a mano si vedeva la fila scappare via.
  // Chi chiede meno animazioni la trova ferma, e la scorre col dito.
  useEffect(() => {
    const viewport = viewportRef.current;
    const lane = laneRef.current;
    if (!viewport || !lane || shift <= 0) return;
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    let last = 0;
    let paused = false;
    let position = viewport.scrollLeft;
    // L'ultimo valore scritto da noi. Serve a distinguere il nostro passo dal
    // dito di chi scorre: senza, a ogni fotogramma riporteremmo la striscia
    // dove l'avevamo lasciata noi.
    let written = position;

    const step = (now: number) => {
      if (last && !paused) {
        position += (CABINET_MARQUEE_SPEED * (now - last)) / 1000;
        // La copia sta esattamente una fila piu in la: tornando indietro di
        // una fila si ricomincia sugli stessi pixel e il giro non si vede.
        if (position >= shift) position -= shift;
        // Lo scorrimento va a pixel interi: scritto un valore con la
        // virgola, il browser lo arrotonda, e a ventidue pixel al secondo si
        // vedrebbe avanzare a scatti di un pixel ogni due fotogrammi. La
        // parte intera la porta lo scorrimento, il resto — sempre meno di un
        // pixel — lo porta una traslazione, che invece i decimali li tiene.
        const intero = Math.floor(position);
        viewport.scrollLeft = intero;
        written = viewport.scrollLeft;
        lane.style.transform = `translate3d(${-(position - intero)}px, 0, 0)`;
      }
      last = now;
      frame = window.requestAnimationFrame(step);
    };

    const onScroll = () => {
      if (Math.abs(viewport.scrollLeft - written) > 2) position = viewport.scrollLeft;
    };

    const pause = () => {
      paused = true;
    };

    // `last` azzerato: senza, al primo fotogramma dopo la pausa il nastro
    // salterebbe avanti di tutto il tempo passato fermo.
    const resume = () => {
      paused = false;
      last = 0;
    };

    frame = window.requestAnimationFrame(step);
    viewport.addEventListener("scroll", onScroll, { passive: true });
    viewport.addEventListener("pointerenter", pause);
    viewport.addEventListener("pointerleave", resume);
    viewport.addEventListener("pointerdown", pause);
    window.addEventListener("pointerup", resume);
    window.addEventListener("pointercancel", resume);

    return () => {
      window.cancelAnimationFrame(frame);
      viewport.removeEventListener("scroll", onScroll);
      viewport.removeEventListener("pointerenter", pause);
      viewport.removeEventListener("pointerleave", resume);
      viewport.removeEventListener("pointerdown", pause);
      window.removeEventListener("pointerup", resume);
      window.removeEventListener("pointercancel", resume);
    };
  }, [shift]);

  const running = shift > 0;
  return (
    <div className="cabinet-marquee" ref={viewportRef}>
      <div className="cabinet-marquee-lane" ref={laneRef}>
        <div className={rowClassName} ref={setRow}>
          {items.map((item) => <Fragment key={keyOf(item)}>{renderItem(item, false)}</Fragment>)}
        </div>
        {running ? (
          <div className={rowClassName}>
            {items.map((item) => <Fragment key={keyOf(item)}>{renderItem(item, true)}</Fragment>)}
          </div>
        ) : null}
      </div>
    </div>
  );
}

