"use client";

import { ReactNode, useCallback, useEffect, useRef } from "react";
import { pageScroller } from "./motion";

// Foglio che sale dal basso, come i pannelli di sistema di iOS. Si chiude
// trascinandolo verso il basso, toccando fuori o con Esc. Il trascinamento
// parte solo quando l'elenco dentro è già in cima: altrimenti scorrere il
// contenuto chiuderebbe il pannello.
export function BottomSheet({
  title,
  eyebrow,
  action,
  footer,
  onClose,
  children,
}: {
  title: string;
  // Riga sopra al titolo: di solito un'etichetta, ma può essere un comando.
  // Facoltativa: il foglio della classifica non ne ha più bisogno.
  eyebrow?: ReactNode;
  // Comando nell'angolo dell'intestazione, al posto della crocetta.
  action?: ReactNode;
  // Comando appoggiato in fondo al foglio, con il contenuto che gli scorre
  // sotto. Sta **fuori** dall'elenco che scorre e non dentro: un elemento
  // appiccicato al fondo di un contenitore scorrevole resta comunque un suo
  // figlio, e nei momenti in cui il browser muove il contenuto per conto suo
  // — il rimbalzo elastico di iOS, la corsa oltre il fondo — si muove con
  // lui. Qui invece non fa parte di quello che scorre, quindi non c'è niente
  // che lo possa spostare.
  footer?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ y: number; lastY: number; lastAt: number; speed: number } | null>(null);
  const closing = useRef(false);

  // Molla: arriva svelta e supera di poco il punto d'arrivo prima di
  // assestarsi. Una curva di Bézier invece di linear(), che su Safari meno
  // recenti non esiste e farebbe saltare del tutto l'animazione.
  const SPRING = "cubic-bezier(0.34, 1.32, 0.64, 1)";

  // Elastico: il foglio non segue il dito uno a uno, oppone una resistenza
  // che cresce. All'inizio si muove quasi quanto il dito, poi rallenta e si
  // ferma. È la stessa sensazione degli elenchi di iOS quando finiscono.
  function rubber(distance: number, limit = 460) {
    return (1 - 1 / (distance / limit + 1)) * limit;
  }

  // La deformazione: mentre scende si schiaccia in altezza e stringe appena,
  // come i pannelli di sistema. transform-origin sta in basso, quindi la
  // compressione avviene verso il bordo dello schermo.
  function shape(offset: number) {
    const pulled = rubber(Math.max(0, offset));
    const squash = Math.min(pulled, 420) / 420;
    return `translate3d(0, ${pulled}px, 0) scaleX(${1 - squash * 0.04}) scaleY(${1 - squash * 0.02})`;
  }

  // La fascia in cima allo schermo, quella dietro la Dynamic Island, non è
  // figlia del velo e quindi non può leggerne il valore. La stessa manopola
  // vive perciò anche sulla radice del documento, e da qui la teniamo
  // allineata al velo passo per passo: si ritirano e rientrano insieme,
  // invece di lasciare una tacca scura in cima quando il foglio se n'è andato.
  const islandAnimation = useRef<Animation | null>(null);

  const setIsland = useCallback((value: number) => {
    islandAnimation.current?.cancel();
    islandAnimation.current = null;
    document.documentElement.style.setProperty("--island", String(Math.max(0, Math.min(1, value))));
  }, []);

  const animateIsland = useCallback((to: number, duration: number, easing: string) => {
    const root = document.documentElement;
    const from = root.style.getPropertyValue("--island") || String(1 - to);
    islandAnimation.current?.cancel();
    islandAnimation.current = null;
    if (!root.animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      root.style.setProperty("--island", String(to));
      return;
    }
    const animation = root.animate(
      [{ "--island": from } as Keyframe, { "--island": String(to) } as Keyframe],
      { duration, easing, fill: "forwards" },
    );
    islandAnimation.current = animation;
    // Arrivata in fondo, il valore si fissa sullo stile e l'animazione si
    // scioglie: lasciarla appesa con fill forwards congelerebbe la proprietà
    // e il foglio dopo non riuscirebbe più a muoverla.
    animation.finished.then(
      () => {
        root.style.setProperty("--island", String(to));
        animation.cancel();
        if (islandAnimation.current === animation) islandAnimation.current = null;
      },
      () => {},
    );
  }, []);

  // La fascia si ritira mentre il foglio sale e rientra quando se ne va.
  useEffect(() => {
    animateIsland(1, 340, "ease-out");
    return () => {
      islandAnimation.current?.cancel();
      islandAnimation.current = null;
      document.documentElement.style.removeProperty("--island");
    };
  }, [animateIsland]);

  // Sfocatura e scurimento sono comandati da un solo numero, così scendono
  // insieme al foglio mentre lo trascini.
  function setVeil(value: number) {
    const clamped = Math.max(0, Math.min(1, value));
    backdropRef.current?.style.setProperty("--veil", String(clamped));
    setIsland(clamped);
  }

  const dismiss = useCallback(() => {
    const panel = panelRef.current;
    const backdrop = backdropRef.current;
    if (closing.current) return;
    closing.current = true;
    if (!panel || !panel.animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onClose();
      return;
    }
    const from = panel.style.transform || "translate3d(0, 0, 0)";
    // Esce scivolando in basso e basta. Nessuna opacità in movimento: il
    // pannello che sfumava lasciava intravedere la pagina attraverso di sé.
    panel.animate(
      [{ transform: from }, { transform: "translate3d(0, 102%, 0)" }],
      { duration: 300, easing: "cubic-bezier(0.4, 0, 0.9, 0.35)", fill: "forwards" },
    );
    // La sfocatura si spegne insieme, non di colpo alla scomparsa.
    const veilNow = backdrop?.style.getPropertyValue("--veil") || "1";
    backdrop?.animate(
      [{ "--veil": veilNow } as Keyframe, { "--veil": "0" } as Keyframe],
      { duration: 300, easing: "ease-in", fill: "forwards" },
    );
    // Stesso tempo e stessa curva per la fascia in cima: torna del colore
    // della pagina mentre la sfocatura svanisce, non un istante dopo.
    animateIsland(0, 300, "ease-in");
    window.setTimeout(onClose, 290);
  }, [onClose, animateIsland]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") dismiss();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dismiss]);

  // La pagina sotto non deve scorrere mentre il foglio è aperto. In più il
  // touchmove che non nasce dentro l'elenco va fermato a mano, altrimenti
  // Safari lo passa comunque alla pagina.
  useEffect(() => {
    function block(event: TouchEvent) {
      const list = bodyRef.current;
      const target = event.target instanceof Node ? event.target : null;
      const inside = Boolean(list && target && list.contains(target));
      const scrollable = Boolean(list && list.scrollHeight > list.clientHeight);
      // Dentro l'elenco lo scorrimento serve: si blocca solo il resto.
      if (inside && scrollable) {
        // Ma solo finché c'è elenco sopra da recuperare. Arrivati in cima e
        // col dito che scende comanda il foglio, e lo scorrimento nativo va
        // zittito: altrimenti il rimbalzo elastico di iOS si somma al
        // trascinamento e il pannello si muove a strappi invece di scendere.
        // È la differenza che si vedeva fra la classifica squadre — corta,
        // quindi mai scorrevole, e infatti già a posto — e quella singolo.
        if ((list?.scrollTop ?? 0) > 0) return;
        const touch = event.touches[0];
        const state = drag.current;
        if (!state || !touch || touch.clientY <= state.y) return;
      }
      if (event.cancelable) event.preventDefault();
    }

    // Dove scorre il contenuto in un contenitore suo — cioe su mobile —
    // fermarlo e una riga sola: gli si toglie l'overflow e resta dov'era, la
    // posizione non la perde.
    const scroller = pageScroller();
    if (scroller) {
      const previousOverflow = scroller.style.overflowY;
      scroller.style.overflowY = "hidden";
      document.addEventListener("touchmove", block, { passive: false });
      return () => {
        document.removeEventListener("touchmove", block);
        scroller.style.overflowY = previousOverflow;
      };
    }

    // Dove invece scorre la pagina intera serve la ginnastica di sempre: su
    // iOS overflow: hidden non basta, il corpo va bloccato alla posizione
    // corrente e rimesso dov'era alla chiusura.
    const top = window.scrollY;
    const { body, documentElement } = document;
    const previous = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      overflow: body.style.overflow,
      htmlOverflow: documentElement.style.overflow,
    };
    body.style.position = "fixed";
    body.style.top = `-${top}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.overflow = "hidden";
    documentElement.style.overflow = "hidden";
    document.addEventListener("touchmove", block, { passive: false });

    return () => {
      document.removeEventListener("touchmove", block);
      body.style.position = previous.position;
      body.style.top = previous.top;
      body.style.left = previous.left;
      body.style.right = previous.right;
      body.style.overflow = previous.overflow;
      documentElement.style.overflow = previous.htmlOverflow;
      window.scrollTo({ top, behavior: "instant" as ScrollBehavior });
    };
  }, []);

  function settle() {
    const panel = panelRef.current;
    const backdrop = backdropRef.current;
    if (!panel) return;
    const from = panel.style.transform || "translate3d(0, 0, 0)";
    const veilNow = backdrop?.style.getPropertyValue("--veil") || "1";
    panel.style.transform = "";
    backdrop?.style.removeProperty("--veil");
    if (!panel.animate) return;
    panel.animate(
      [{ transform: from }, { transform: "translate3d(0, 0, 0)" }],
      { duration: 520, easing: SPRING },
    );
    // Tornando su, la sfocatura si riforma con la stessa molla.
    backdrop?.animate(
      [{ "--veil": veilNow } as Keyframe, { "--veil": "1" } as Keyframe],
      { duration: 420, easing: "ease-out" },
    );
    // E con lei la fascia in cima si rifa da parte.
    animateIsland(1, 420, "ease-out");
  }

  return (
    <div
      className="sheet-backdrop"
      ref={backdropRef}
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && dismiss()}
    >
      <section
        className={`sheet ${footer ? "has-footer" : ""}`}
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onTouchStart={(event) => {
          // Il foglio si trascina solo prendendolo per l'intestazione. Prima
          // bastava che l'elenco fosse in cima, e allora un dito appoggiato
          // sul contenuto muoveva il foglio invece della lista: chi voleva
          // scorrere si trovava il pannello che scendeva, e per rimediare
          // doveva tirarlo indietro. Sono due gesti diversi e ora partono da
          // due posti diversi, che è anche il modo in cui uno riconosce quale
          // dei due sta facendo.
          // Si nomina l'intestazione invece di escludere l'elenco: fuori
          // dall'elenco c'è anche il piede, e premere un tasto non deve
          // trascinare niente.
          const perIlTitolo = event.target instanceof Element
            && Boolean(event.target.closest(".sheet-head"));
          if (!perIlTitolo || event.touches.length !== 1) {
            drag.current = null;
            return;
          }
          const touch = event.touches[0];
          panelRef.current?.getAnimations().forEach((animation) => animation.cancel());
          drag.current = { y: touch.clientY, lastY: touch.clientY, lastAt: performance.now(), speed: 0 };
        }}
        onTouchMove={(event) => {
          const state = drag.current;
          const touch = event.touches[0];
          const panel = panelRef.current;
          if (!state || !touch || !panel) return;
          const now = performance.now();
          state.speed = (touch.clientY - state.lastY) / Math.max(1, now - state.lastAt);
          state.lastY = touch.clientY;
          state.lastAt = now;
          const distance = touch.clientY - state.y;
          // Verso l'alto il foglio non sale: oppone resistenza crescente e si
          // allunga appena, come un elastico.
          if (distance < 0) {
            const stretch = Math.min(-distance, 160) / 160;
            panel.style.transform = `translate3d(0, ${-rubber(-distance, 90)}px, 0) scaleY(${1 + stretch * 0.012})`;
            return;
          }
          panel.style.transform = shape(distance);
          // La sfocatura cala man mano che il foglio scende: a metà corsa
          // la pagina sotto ricomincia a leggersi.
          setVeil(1 - Math.min(distance / 420, 1) * 0.85);
        }}
        onTouchEnd={(event) => {
          const state = drag.current;
          drag.current = null;
          const touch = event.changedTouches[0];
          if (!state || !touch) return;
          const distance = touch.clientY - state.y;
          if (distance > 110 || state.speed > 0.6) {
            dismiss();
            return;
          }
          settle();
        }}
        onTouchCancel={() => { drag.current = null; settle(); }}
      >
        {/* La maniglia non c'è più. Diceva "questo pannello si trascina", ma
            lo dicono già la forma e il fatto che si muova appena lo tocchi:
            era un'istruzione per una cosa che nessuno sbaglia. */}
        <div className="sheet-head">
          <div>
            {eyebrow ? (typeof eyebrow === "string" ? <p className="eyebrow dark">{eyebrow}</p> : eyebrow) : null}
            <h2>{title}</h2>
          </div>
          {action}
        </div>
        <div className="sheet-body" ref={bodyRef}>{children}</div>
        {footer ? <div className="sheet-footer">{footer}</div> : null}
      </section>
    </div>
  );
}
