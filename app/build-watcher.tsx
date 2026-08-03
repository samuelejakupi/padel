"use client";

import { useEffect } from "react";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const buildId = process.env.NEXT_PUBLIC_BUILD_ID ?? "";

// GitHub Pages serve l'HTML con una cache che non possiamo configurare: il
// browser può quindi continuare a mostrare una versione vecchia dopo un
// deploy. Qui confrontiamo la versione compilata nella pagina con quella
// pubblicata e, se differiscono, ricarichiamo una volta sola.
export default function BuildWatcher() {
  useEffect(() => {
    if (!buildId || buildId === "dev") return;

    let stopped = false;

    async function check() {
      try {
        const response = await fetch(`${basePath}/version.json?t=${Date.now()}`, {
          cache: "no-store",
        });
        if (!response.ok || stopped) return;

        const published = (await response.json())?.version;
        if (!published || published === buildId) return;

        // Un solo reload per versione: se il deploy è a metà strada evitiamo
        // di mandare la pagina in un ciclo di ricariche.
        if (window.sessionStorage.getItem("theboyz-build") === published) return;
        window.sessionStorage.setItem("theboyz-build", published);

        // replace() con la versione in query forza il browser a scaricare
        // davvero l'HTML nuovo, cosa che un reload normale non garantisce.
        const url = new URL(window.location.href);
        url.searchParams.set("v", published.slice(0, 8));
        window.location.replace(url.toString());
      } catch {
        // Rete assente o file non ancora pubblicato: riproviamo al giro dopo.
      }
    }

    void check();
    const timer = window.setInterval(check, 60_000);
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);

    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return null;
}
