"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Secondi → mm:ss, per mostrare il tempo di uno spezzone. Il verso opposto
// non serve piu: il minuto si scrive in due caselle separate, quindi non c'e
// piu niente da interpretare.
export function formatClock(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// Vero sotto i 780px, cioè dove vale l'impaginazione mobile. Serve nei punti
// in cui telefono e computer non si distinguono solo per stile ma per
// comportamento, e il CSS da solo non basta: in home la card delle partite è
// un bersaglio unico che apre il foglio sul telefono, mentre su computer ogni
// partita continua ad aprirsi in modifica.
// Parte da false e si corregge al primo effetto: durante la generazione
// statica non esiste una finestra da misurare, e la home vera compare
// comunque solo dopo che i dati sono arrivati, quindi nessuno vede lo scarto.
export function useIsPhone() {
  const [isPhone, setIsPhone] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 780px)");
    const sync = () => setIsPhone(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  return isPhone;
}

// La pastiglia della barra viene spostata scrivendo `transform` direttamente
// sullo stile, quindi la traslazione non deve essere animata dal CSS: se lo
// fosse, ogni riposizionamento verrebbe animato due volte. Resta accesa solo
// su `scale`, che e la proprieta con cui il CSS la schiaccia mentre il dito
// preme: le due cose si sommano invece di sostituirsi, e cosi la pressione si
// vede senza che il gesto perda il controllo della posizione.
export const NAV_PILL_TRANSITION = "scale 140ms cubic-bezier(0.34, 1.56, 0.64, 1)";

// Su mobile la pagina non scorre da sola: scorre il contenuto, dentro a un
// contenitore alto quanto lo schermo. Serve perche il rimbalzo elastico
// avvenga li dentro invece che su tutta la pagina — quando rimbalza la
// pagina, iOS trascina anche gli elementi fissi, e la barra in basso si
// staccava dal fondo a ogni estremo.
// Chi deve leggere o spostare lo scorrimento deve percio chiedere a lui e non
// alla finestra. Su desktop il contenitore non scorre e si torna alla
// finestra: lo si riconosce dall'overflow calcolato, non da un breakpoint
// ripetuto anche qui.
export function pageScroller(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const content = document.querySelector<HTMLElement>("main.content");
  if (!content) return null;
  const overflow = getComputedStyle(content).overflowY;
  return overflow === "auto" || overflow === "scroll" ? content : null;
}

export function scrollPageTo(top: number, behavior: ScrollBehavior) {
  (pageScroller() ?? window).scrollTo({ top, behavior });
}

export function scrollPageBy(top: number) {
  (pageScroller() ?? window).scrollBy({ top, behavior: "instant" as ScrollBehavior });
}

// Le facce dei caroselli della home, nell'ordine in cui si incontrano
// scorrendo verso sinistra — lo stesso ordine dei pallini sotto la card.
// Stanno fuori dal componente perche sono liste fisse: dentro verrebbero
// ricostruite a ogni render e farebbero ripartire gli effetti del carosello.
export const MATCHES_FACES = ["mine", "all"] as const;
// Il tasto in cima alla home e anche lui un carosello: a sinistra la partita,
// a destra il torneo.
export const CTA_FACES = ["match", "tournament"] as const;

// Una card che ha piu facce e le mostra a turno: si cambia con lo swipe o da
// sola ogni cinque secondi, e la faccia che esce da un lato lascia entrare
// dall'altro quella nuova. La usano le partite per alternare le proprie e
// tutte quelle del gruppo.
//
// Perche i gestori del tocco stanno su listener nativi e non sugli attributi
// onTouch di React: React registra touchmove come passivo, e li dentro
// preventDefault non ha alcun effetto. Senza preventDefault non c'e modo di
// impedire alla pagina di scorrere su e giu mentre si scorre di lato.
// Di quanto si sposta la faccia che esce, e da quanto lontano arriva quella
// che entra. E un numero fisso e non la larghezza della card, per due motivi.
// Il primo: le tre card della home sono larghe diverso, e misurando lo stacco
// sulla larghezza ognuna si muoveva di una quantita sua — lo stesso gesto
// sembrava diverso a seconda di dove lo si guardava. Il secondo: una faccia
// che esce di tutta la sua larghezza lascia il riquadro vuoto per un istante,
// e quell'istante si legge come un buco. Corto, la dissolvenza fa il resto.
export const CAROUSEL_TRAVEL = 96;

export function useCardCarousel<T extends string>({
  faces,
  face,
  onChange,
  enabled,
  enteringClass,
}: {
  faces: readonly T[];
  face: T;
  onChange: (next: T) => void;
  // Il cambio automatico gira solo dove ha senso guardarlo: in home, senza
  // fogli aperti. Fuori di li il timer non parte nemmeno.
  enabled: boolean;
  // Classe appesa al nastro finche la faccia nuova sta entrando, per le
  // animazioni che devono aspettare che sia arrivata.
  enteringClass?: string;
}) {
  // Il nodo della card sta in uno stato e non in un ref, perche serve a
  // riagganciare i listener. Cambiando sezione dalla barra la card viene
  // smontata, e al ritorno e un elemento nuovo: con un ref i listener
  // sarebbero rimasti appesi a quello vecchio e la card tornava muta — non
  // rispondeva piu nemmeno allo swipe fatto a mano.
  const [card, setCard] = useState<HTMLElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  // Quando la card e stata toccata l'ultima volta. Il cambio automatico non si
  // spegne per sempre: si fa da parte mentre il dito e li e riprende cinque
  // secondi dopo l'ultimo tocco, come se il conto ripartisse da capo.
  const [touchedAt, setTouchedAt] = useState(0);
  const swipe = useRef<{
    x: number;
    y: number;
    lastX: number;
    lastAt: number;
    velocityX: number;
    axis: "pending" | "horizontal" | "vertical";
  } | null>(null);
  // Vive dal touchend al click che il browser manda comunque in coda a uno
  // swipe: serve solo a non aprire il foglio quando il gesto era un cambio.
  const swipeHandled = useRef(false);
  // Da quale lato deve entrare la faccia nuova quando il cambio e andato a
  // buon fine. Null quando non c'e nessun cambio in corso.
  const enterFrom = useRef<number | null>(null);
  // Il cambio automatico fa avanti e indietro invece di ricominciare da capo:
  // arrivato all'ultima faccia torna verso la prima. Con due facce e
  // l'alternanza di sempre; con tre evita il salto dalla terza alla prima,
  // che sarebbe l'unico movimento a non corrispondere a nessuno swipe.
  const autoDirection = useRef<"left" | "right">("left");
  // Il gestore di turno letto da dentro gli effetti senza doverli riagganciare
  // a ogni render: e una funzione scritta inline nel JSX, quindi cambia
  // identita tutte le volte.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const index = faces.indexOf(face);

  // Cambiare faccia o aprire il foglio fa cambiare l'altezza della pagina, e
  // il browser rimette lo scorrimento dove puo: se eri in fondo, risali. Qui
  // teniamo fermo il bordo alto della card, spostando lo scorrimento della
  // stessa quantita di cui si e mosso lui.
  const keepScroll = useCallback((change: () => void) => {
    const before = card?.getBoundingClientRect().top ?? null;
    change();
    if (before === null) return;
    requestAnimationFrame(() => {
      const after = card?.getBoundingClientRect().top;
      if (after === undefined) return;
      scrollPageBy(after - before);
    });
  }, [card]);

  // Il cambio vero e proprio: la faccia vecchia esce da un lato e quella nuova
  // entra dall'altro. Lo chiamano sia il dito sia il timer, cosi il cambio a
  // mano e quello automatico sono esattamente lo stesso movimento.
  const slide = useCallback((next: T, direction: "left" | "right") => {
    const track = trackRef.current;
    const exit = direction === "left" ? -CAROUSEL_TRAVEL : CAROUSEL_TRAVEL;
    const finish = () => keepScroll(() => onChangeRef.current(next));
    if (!track || !track.animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      enterFrom.current = null;
      finish();
      return;
    }
    // La faccia nuova entrera dal lato opposto: il gesto portato a termine.
    enterFrom.current = -exit;
    track
      .animate(
        [
          { transform: track.style.transform || "translate3d(0, 0, 0)", opacity: track.style.opacity || "1" },
          { transform: `translate3d(${exit}px, 0, 0)`, opacity: 0 },
        ],
        // Corta: fra l'uscita e l'entrata il riquadro resta senza faccia, e
        // piu quel vuoto dura piu si vede. Prima erano 170 di uscita e 340 di
        // entrata, mezzo secondo in cui la faccia dopo non c'era ancora.
        { duration: 130, easing: "cubic-bezier(0.4, 0, 0.9, 0.35)", fill: "forwards" },
      )
      .finished.then(finish, finish);
  }, [keepScroll]);

  // Il cambio automatico: le facce si alternano da sole ogni cinque secondi,
  // cosi la home le mostra tutte senza che nessuno la tocchi. Si ferma dove
  // non avrebbe senso girare a vuoto: fuori dalla home, con un foglio aperto,
  // a scheda nascosta, o quando il telefono chiede meno animazioni. Toccando
  // la card si fa da parte e riprende cinque secondi dopo l'ultimo tocco:
  // touchedAt cambia, l'effetto riparte e il conto ricomincia da zero.
  useEffect(() => {
    if (!enabled || faces.length < 2) return;
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let timer = 0;
    function schedule() {
      timer = window.setTimeout(() => {
        // Dito ancora appoggiato sulla card: si rimanda invece di strappargli
        // la faccia di mano a meta gesto.
        if (swipe.current) {
          schedule();
          return;
        }
        // Arrivati a un estremo si torna indietro: la direzione cambia una
        // volta sola, e da li in poi si scorre nell'altro verso.
        if (autoDirection.current === "left" && index >= faces.length - 1) autoDirection.current = "right";
        if (autoDirection.current === "right" && index <= 0) autoDirection.current = "left";
        const step = autoDirection.current === "left" ? 1 : -1;
        const next = faces[index + step];
        if (next !== undefined) slide(next, autoDirection.current);
      }, 5000);
    }

    // A scheda nascosta il timer non parte nemmeno: un'animazione che gira
    // dietro le quinte consuma batteria e non la guarda nessuno. Quando la
    // pagina torna in vista il conto ricomincia da capo.
    function sync() {
      window.clearTimeout(timer);
      if (document.visibilityState === "visible") schedule();
    }

    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [touchedAt, index, faces, enabled, slide]);

  // Il gesto orizzontale sulla card. Fa tre cose: decide una volta sola su che
  // asse sta andando il dito, blocca lo scorrimento verticale appena ha deciso
  // che e orizzontale, e tiene la faccia attaccata al dito finche non la si
  // lascia.
  useEffect(() => {
    if (!card) return;
    const node = card;

    const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Dove si va scorrendo in quella direzione. Le facce sono in fila, nello
    // stesso ordine dei pallini: oltre i due estremi non c'e niente, e li il
    // dito incontra la resistenza elastica invece di trascinare via la card.
    function destination(direction: "left" | "right"): T | null {
      const next = faces[direction === "left" ? index + 1 : index - 1];
      return next ?? null;
    }

    // La stessa resistenza dei fogli che si trascinano: all'inizio segue quasi
    // il dito, poi si arrende sempre di piu e si ferma.
    function rubber(distance: number, limit = 220) {
      return (1 - 1 / (distance / limit + 1)) * limit;
    }

    function cardWidth() {
      return Math.max(node.getBoundingClientRect().width, 1);
    }

    function paint(offset: number) {
      const track = trackRef.current;
      if (!track) return;
      const progress = Math.min(1, Math.abs(offset) / cardWidth());
      track.style.transition = "none";
      track.style.transform = `translate3d(${offset}px, 0, 0)`;
      // Sbiadisce mentre esce: senza, la faccia vecchia resta squillante fino
      // al bordo e il cambio sembra uno scatto invece di una dissolvenza.
      track.style.opacity = String(1 - progress * 0.45);
    }

    function restore() {
      const track = trackRef.current;
      if (!track || !track.style.transform) return;
      const fromTransform = track.style.transform;
      const fromOpacity = track.style.opacity || "1";
      track.style.transform = "";
      track.style.opacity = "";
      if (!track.animate || reduceMotion()) return;
      track.animate(
        [
          { transform: fromTransform, opacity: fromOpacity },
          { transform: "translate3d(0, 0, 0)", opacity: 1 },
        ],
        { duration: 420, easing: "cubic-bezier(0.34, 1.32, 0.64, 1)" },
      );
    }

    function onStart(event: TouchEvent) {
      swipeHandled.current = false;
      // Il cambio automatico si fa da parte e riparte cinque secondi dopo che
      // il dito se n'e andato: mentre la card e sotto le dita comanda lei.
      setTouchedAt(Date.now());
      if (event.touches.length !== 1 || !window.matchMedia("(max-width: 780px)").matches) {
        swipe.current = null;
        return;
      }
      trackRef.current?.getAnimations().forEach((animation) => animation.cancel());
      const touch = event.touches[0];
      swipe.current = {
        x: touch.clientX,
        y: touch.clientY,
        lastX: touch.clientX,
        lastAt: performance.now(),
        velocityX: 0,
        axis: "pending",
      };
    }

    function onMove(event: TouchEvent) {
      const gesture = swipe.current;
      const touch = event.touches[0];
      if (!gesture || !touch) return;
      const distanceX = touch.clientX - gesture.x;
      const distanceY = touch.clientY - gesture.y;
      // L'asse si decide una volta sola, agli otto pixel: prima di allora il
      // gesto e ancora di tutti e due, dopo non cambia piu idea a meta strada.
      if (gesture.axis === "pending") {
        if (Math.max(Math.abs(distanceX), Math.abs(distanceY)) < 8) return;
        gesture.axis = Math.abs(distanceX) > Math.abs(distanceY) * 1.15 ? "horizontal" : "vertical";
      }
      if (gesture.axis !== "horizontal") return;
      // E per questa riga che i listener sono nativi e non passivi: da qui in
      // poi la pagina non scorre piu su e giu finche il dito non si stacca.
      if (event.cancelable) event.preventDefault();

      const now = performance.now();
      const elapsed = Math.max(1, now - gesture.lastAt);
      gesture.velocityX = (touch.clientX - gesture.lastX) / elapsed;
      gesture.lastX = touch.clientX;
      gesture.lastAt = now;

      const direction = distanceX < 0 ? "left" : "right";
      const free = Boolean(destination(direction));
      paint(free ? distanceX : Math.sign(distanceX) * rubber(Math.abs(distanceX)));
    }

    function onEnd(event: TouchEvent) {
      const gesture = swipe.current;
      swipe.current = null;
      // I cinque secondi si contano dall'ultimo tocco, che e questo.
      setTouchedAt(Date.now());
      const track = trackRef.current;
      if (!gesture || !track || gesture.axis !== "horizontal") return;
      const touch = event.changedTouches[0];
      const distanceX = touch ? touch.clientX - gesture.x : 0;
      const direction = distanceX < 0 ? "left" : "right";
      const next = destination(direction);
      const width = cardWidth();
      // Due modi di convincerlo: portarlo oltre un terzo della card, oppure un
      // colpo secco. Il secondo e per i pollici veloci, che non arrivano mai
      // lontano ma sono decisi.
      const enoughDistance = Math.abs(distanceX) >= Math.max(56, width * 0.3);
      const enoughMomentum = Math.abs(distanceX) >= 28 && Math.abs(gesture.velocityX) >= 0.4;
      if (!next || !(enoughDistance || enoughMomentum)) {
        restore();
        return;
      }
      // Il click che il browser manda dopo il gesto non deve aprire il foglio.
      swipeHandled.current = true;
      slide(next, direction);
    }

    function onCancel() {
      swipe.current = null;
      setTouchedAt(Date.now());
      restore();
    }

    node.addEventListener("touchstart", onStart, { passive: true });
    node.addEventListener("touchmove", onMove, { passive: false });
    node.addEventListener("touchend", onEnd);
    node.addEventListener("touchcancel", onCancel);
    return () => {
      node.removeEventListener("touchstart", onStart);
      node.removeEventListener("touchmove", onMove);
      node.removeEventListener("touchend", onEnd);
      node.removeEventListener("touchcancel", onCancel);
    };
  }, [card, faces, index, slide]);

  // Cambiata la faccia, quella nuova entra dal lato opposto a quello da cui e
  // uscita la vecchia: il gesto continua invece di ricominciare.
  useEffect(() => {
    const track = trackRef.current;
    const from = enterFrom.current;
    enterFrom.current = null;
    if (!track || from === null) return;
    track.getAnimations().forEach((animation) => animation.cancel());
    track.style.transform = "";
    track.style.opacity = "";
    if (!track.animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      if (enteringClass) track.classList.remove(enteringClass);
      return;
    }
    if (enteringClass) track.classList.add(enteringClass);
    const entrance = track.animate(
      [
        { transform: `translate3d(${from}px, 0, 0)`, opacity: 0 },
        { transform: "translate3d(0, 0, 0)", opacity: 1 },
      ],
      { duration: 230, easing: "cubic-bezier(0.32, 0.9, 0.28, 1)" },
    );
    // Arrivata: le animazioni che aspettavano possono ripartire da capo, in
    // tempo con la faccia nuova.
    const done = () => { if (enteringClass) track.classList.remove(enteringClass); };
    entrance.finished.then(done, done);
  }, [face, enteringClass]);

  return {
    setCard,
    trackRef,
    swipeHandled,
    // Da chiamare al click sulla card: rimanda il cambio automatico di altri
    // cinque secondi, come fa il tocco.
    touch: () => setTouchedAt(Date.now()),
  };
}

// Quanto si staccano i due tasti del nastro qui sotto: lo stesso stacco che
// separa un tasto da una card nella colonna della home (`gap: 10px` di
// `.dashboard-grid`). Non e un numero scelto per il nastro, e il passo della
// pagina: due tasti che scorrono lontani fra loro sembrerebbero due schermate,
// vicini cosi sembrano quello che sono, due facce dello stesso comando.
export const RAIL_GAP = 10;
// Quanto dura la corsa del nastro quando il dito lo lascia a meta. La stessa
// cifra sta nella transizione di `.cta-carousel-track.is-settling`: il tempo
// che il nastro impiega davvero lo decide il CSS, questo serve solo a sapere
// quando e finita per togliere di mezzo il vicino.
export const RAIL_SETTLE_MS = 210;

// Il nastro dei due tasti in cima alla home. Le card cambiano faccia — quella
// che c'e esce sfumando e quella nuova entra al suo posto; qui invece i due
// tasti stanno davvero uno accanto all'altro e quello che si vede e il nastro
// che scorre. La dissolvenza faceva sembrare che il tasto si trasformasse:
// cosi si vede che sono due, e che di la ce n'e un altro.
//
// Il vicino viene montato solo mentre il nastro si muove. A riposo starebbe
// fuori dallo schermo, e `.content` — che su mobile scorre in verticale —
// diventerebbe scorrevole anche di lato: e lo stesso inciampo per cui la
// copia spenta di fianco al nastro era stata provata e tolta.
export function useButtonRail<T extends string>({
  faces,
  face,
  onChange,
}: {
  faces: readonly T[];
  face: T;
  onChange: (next: T) => void;
}) {
  // Come per le card: il nodo sta in uno stato e non in un ref, perche
  // cambiando sezione viene smontato e al ritorno e un elemento nuovo.
  const [card, setCard] = useState<HTMLElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  // Il vicino: quale tasto e in arrivo (o in uscita) e da che lato. Null a
  // nastro fermo, ed e allora che non deve proprio esistere.
  const [preview, setPreview] = useState<{ face: T; side: "left" | "right" } | null>(null);
  const previewRef = useRef<{ face: T; side: "left" | "right" } | null>(null);
  // Di quanto e spostato il nastro. Lo tiene React e non il DOM, e non e un
  // dettaglio: e cosi che il cambio di faccia e lo spostamento del nastro
  // finiscono nello stesso disegno. Scrivendolo a mano dopo il cambio ci
  // sarebbe un fotogramma con il tasto nuovo gia in scena e il nastro ancora
  // spostato di tutta la sua larghezza — cioe il tasto fuori dallo schermo.
  const [offset, setOffset] = useState(0);
  // Acceso solo mentre il nastro finisce la corsa da solo: mentre il dito e
  // sul tasto il nastro deve stargli attaccato, non inseguirlo.
  const [settling, setSettling] = useState(false);
  const settleTimer = useRef(0);
  const settleFrame = useRef(0);
  const swipe = useRef<{
    x: number;
    y: number;
    lastX: number;
    lastAt: number;
    velocityX: number;
    axis: "pending" | "horizontal" | "vertical";
  } | null>(null);
  // Vive dal touchend al click che il browser manda comunque in coda a uno
  // swipe: serve solo a non premere il tasto quando il gesto era un cambio.
  const swipeHandled = useRef(false);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const index = faces.indexOf(face);

  // Il vicino si monta e si smonta di rado — una volta per gesto — ma il dito
  // passa di qui a ogni frame: senza questo confronto sarebbe un render al
  // millimetro percorso.
  const showPreview = useCallback((next: { face: T; side: "left" | "right" } | null) => {
    const current = previewRef.current;
    if (current?.face === next?.face && current?.side === next?.side) return;
    previewRef.current = next;
    setPreview(next);
  }, []);

  // Fine corsa: il nastro torna a zero, il vicino sparisce, i tempi in sospeso
  // si azzerano. Lo chiamano sia il traguardo sia un dito che ricomincia a
  // trascinare mentre la corsa e ancora in atto.
  const restRail = useCallback(() => {
    if (typeof window !== "undefined") {
      window.clearTimeout(settleTimer.current);
      window.cancelAnimationFrame(settleFrame.current);
    }
    settleTimer.current = 0;
    settleFrame.current = 0;
    setSettling(false);
    setOffset(0);
    showPreview(null);
  }, [showPreview]);

  useEffect(() => () => {
    window.clearTimeout(settleTimer.current);
    window.cancelAnimationFrame(settleFrame.current);
  }, []);

  useEffect(() => {
    if (!card) return;
    const node = card;

    const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function destination(direction: "left" | "right"): T | null {
      const next = faces[direction === "left" ? index + 1 : index - 1];
      return next ?? null;
    }

    // La stessa resistenza dei fogli che si trascinano: agli estremi il dito
    // trova il muro invece di portarsi via il nastro.
    function rubber(distance: number, limit = 220) {
      return (1 - 1 / (distance / limit + 1)) * limit;
    }

    // Di quanto scorre il nastro per cambiare tasto: la larghezza del tasto
    // piu lo stacco, cioe esattamente il punto dove comincia il vicino.
    function step() {
      return Math.max(node.getBoundingClientRect().width, 1) + RAIL_GAP;
    }

    // Mentre il dito e appoggiato il nastro si scrive a mano, fuori da React:
    // un render per ogni millimetro percorso sarebbe uno spreco, e lo
    // spostamento qui non deve arrivare da nessun'altra parte.
    function paint(value: number) {
      const track = trackRef.current;
      if (!track) return;
      track.style.transform = `translate3d(${value}px, 0, 0)`;
    }

    function onStart(event: TouchEvent) {
      swipeHandled.current = false;
      if (event.touches.length !== 1 || !window.matchMedia("(max-width: 780px)").matches) {
        swipe.current = null;
        return;
      }
      // Un dito che ricomincia mentre il nastro sta ancora correndo comanda
      // lui: la corsa finisce qui e si riparte da fermo.
      trackRef.current?.getAnimations().forEach((animation) => animation.cancel());
      restRail();
      const touch = event.touches[0];
      swipe.current = {
        x: touch.clientX,
        y: touch.clientY,
        lastX: touch.clientX,
        lastAt: performance.now(),
        velocityX: 0,
        axis: "pending",
      };
    }

    function onMove(event: TouchEvent) {
      const gesture = swipe.current;
      const touch = event.touches[0];
      if (!gesture || !touch) return;
      const distanceX = touch.clientX - gesture.x;
      const distanceY = touch.clientY - gesture.y;
      // L'asse si decide una volta sola, agli otto pixel: prima il gesto e
      // ancora di tutti e due, dopo non cambia piu idea a meta strada.
      if (gesture.axis === "pending") {
        if (Math.max(Math.abs(distanceX), Math.abs(distanceY)) < 8) return;
        gesture.axis = Math.abs(distanceX) > Math.abs(distanceY) * 1.15 ? "horizontal" : "vertical";
      }
      if (gesture.axis !== "horizontal") return;
      // E per questa riga che i listener sono nativi e non passivi: React
      // registra touchmove come passivo, e li preventDefault non fa nulla.
      if (event.cancelable) event.preventDefault();

      const now = performance.now();
      const elapsed = Math.max(1, now - gesture.lastAt);
      gesture.velocityX = (touch.clientX - gesture.lastX) / elapsed;
      gesture.lastX = touch.clientX;
      gesture.lastAt = now;

      const direction = distanceX < 0 ? "left" : "right";
      const target = destination(direction);
      // Il vicino entra dal lato opposto a quello verso cui va il dito: si
      // tira il nastro a sinistra e da destra arriva l'altro tasto.
      showPreview(target ? { face: target, side: direction === "left" ? "right" : "left" } : null);
      paint(target ? distanceX : Math.sign(distanceX) * rubber(Math.abs(distanceX)));
    }

    // Il gesto lasciato a meta: il nastro torna dov'era e il vicino se ne va.
    // Qui non cambia niente in React — lo spostamento e ancora quello scritto
    // a mano — quindi lo si riporta a zero a mano.
    function bounceBack() {
      const track = trackRef.current;
      if (!track) return;
      const from = track.style.transform;
      paint(0);
      if (!track.animate || reduceMotion() || !from) {
        showPreview(null);
        return;
      }
      track
        .animate(
          [{ transform: from }, { transform: "translate3d(0px, 0, 0)" }],
          { duration: 260, easing: "cubic-bezier(0.34, 1.28, 0.64, 1)" },
        )
        .finished.then(() => showPreview(null), () => showPreview(null));
    }

    function onEnd(event: TouchEvent) {
      const gesture = swipe.current;
      swipe.current = null;
      const track = trackRef.current;
      if (!gesture || !track || gesture.axis !== "horizontal") return;
      const touch = event.changedTouches[0];
      const distanceX = touch ? touch.clientX - gesture.x : 0;
      const direction = distanceX < 0 ? "left" : "right";
      const next = destination(direction);
      const width = Math.max(node.getBoundingClientRect().width, 1);
      // Due modi di convincerlo: portarlo oltre un terzo del tasto, oppure un
      // colpo secco. Il secondo e per i pollici veloci, che non arrivano mai
      // lontano ma sono decisi.
      const enoughDistance = Math.abs(distanceX) >= Math.max(56, width * 0.3);
      const enoughMomentum = Math.abs(distanceX) >= 28 && Math.abs(gesture.velocityX) >= 0.4;
      if (!next || !(enoughDistance || enoughMomentum)) {
        bounceBack();
        return;
      }
      // Il click che il browser manda dopo il gesto non deve premere il tasto.
      swipeHandled.current = true;

      const previous = faces[index];
      if (reduceMotion()) {
        paint(0);
        onChangeRef.current(next);
        restRail();
        return;
      }

      // Il cambio di faccia e lo spostamento del nastro insieme, in un solo
      // aggiornamento. Il tasto nuovo prende il posto che aveva il vicino, il
      // tasto che esce diventa lui il vicino dall'altra parte, e il nastro si
      // sposta di quel tanto che serve perche sullo schermo non si muova
      // niente: gli stessi pixel di un istante prima, con dentro cose diverse.
      // Da li in poi basta riportare il nastro a zero e la corsa si vede.
      const jump = distanceX + (direction === "left" ? step() : -step());
      onChangeRef.current(next);
      showPreview({ face: previous, side: direction === "left" ? "left" : "right" });
      setOffset(jump);

      // Due frame prima di far partire la corsa: la transizione ha bisogno di
      // vedere disegnata la posizione di partenza, se no salta direttamente
      // all'arrivo. Il disegno in mezzo non e uno sfarfallio, e proprio il
      // fotogramma di continuita.
      settleFrame.current = window.requestAnimationFrame(() => {
        settleFrame.current = window.requestAnimationFrame(() => {
          settleFrame.current = 0;
          setSettling(true);
          setOffset(0);
          settleTimer.current = window.setTimeout(() => {
            settleTimer.current = 0;
            setSettling(false);
            showPreview(null);
          }, RAIL_SETTLE_MS);
        });
      });
    }

    function onCancel() {
      swipe.current = null;
      bounceBack();
    }

    node.addEventListener("touchstart", onStart, { passive: true });
    node.addEventListener("touchmove", onMove, { passive: false });
    node.addEventListener("touchend", onEnd);
    node.addEventListener("touchcancel", onCancel);
    return () => {
      node.removeEventListener("touchstart", onStart);
      node.removeEventListener("touchmove", onMove);
      node.removeEventListener("touchend", onEnd);
      node.removeEventListener("touchcancel", onCancel);
    };
  }, [card, faces, index, showPreview, restRail]);

  return { setCard, trackRef, swipeHandled, preview, offset, settling };
}
