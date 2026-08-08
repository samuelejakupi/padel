import type { Metadata, Viewport } from "next";
import BuildWatcher from "./build-watcher";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
// Safari tiene in cache l'icona della schermata Home per indirizzo e non la
// ricontrolla mai: senza un indirizzo nuovo a ogni build resterebbe quella
// del primo salvataggio, o peggio ricadrebbe sull'immagine di condivisione.
const iconVersion = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";

// Colora la barra di stato su iOS e Android con il blu del sito invece del
// bianco di sistema.
export const viewport: Viewport = {
  themeColor: "#0b1b2c",
  // Niente zoom accidentale su mobile: il sito e gia dimensionato per il
  // telefono e il doppio tap o la pinch finivano solo per sballare il layout.
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // La pagina arriva fino ai bordi fisici dello schermo, Dynamic Island
  // compresa. Serve perche un effetto CSS puo agire solo su quello che sta
  // dentro il viewport: con la barra di stato opaca il viewport iniziava
  // sotto l'isola e li nessuna sfocatura poteva arrivare. Da qui in poi lo
  // spazio dell'isola non lo riserva piu il sistema, lo riserviamo noi con
  // env(safe-area-inset-top).
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "TheBoyz · Group HQ",
  description:
    "Il quartier generale dei TheBoyz: padel, pizzeria ranking e tutte le nostre cose.",
  metadataBase: siteUrl ? new URL(siteUrl) : undefined,
  openGraph: {
    title: "TheBoyz · Group HQ",
    description: "Padel, Pizzeria Ranking e tutte le nostre cose.",
    type: "website",
    locale: "it_IT",
    images: siteUrl ? [{ url: "/og-theboyz.png", width: 1200, height: 630, alt: "TheBoyz Group HQ" }] : undefined,
  },
  twitter: {
    card: "summary_large_image",
    title: "TheBoyz · Group HQ",
    description: "Padel, Pizzeria Ranking e tutte le nostre cose.",
    images: siteUrl ? ["/og-theboyz.png"] : undefined,
  },
  manifest: `${basePath}/manifest.webmanifest`,
  appleWebApp: {
    capable: true,
    title: "TheBoyz",
    // Traslucida, non opaca: e la meta dello stesso interruttore di
    // viewport-fit. Con "black" iOS disegnava lui una fascia piena e il
    // contenuto partiva sotto; cosi invece la fascia la disegna la pagina
    // (.app-shell::before) e quello che ci passa sotto e sfocabile.
    //
    // "default" e non "black-translucent": con quest'ultimo l'ora e le icone
    // di sistema restano bianche per sempre, e allora sotto serve per forza
    // una fascia scura, che su una pagina chiara si vede come una tacca. Con
    // "default" le scritte le colora iOS secondo l'aspetto del telefono —
    // scure in chiaro — e la fascia puo finalmente sparire nello sfondo.
    // Il patto che ne segue vale per tutta l'app: quello che passa sotto le
    // scritte di sistema deve restare chiaro. Per questo il velo dei fogli
    // schiarisce invece di scurire (vedi .sheet-backdrop).
    // Su un telefono tenuto in modalita scura iOS le rimette bianche: li la
    // fascia chiara torna a essere il fondo sbagliato. Finche il tema scuro
    // dell'app non esiste davvero, e un caso che accettiamo.
    // PROVA DEL 8 AGOSTO: rimesso "black-translucent" perche con "default"
    // la pagina non passa sotto l'orologio, e .system-blur non ha niente da
    // sfocare — il vetro in cima c'e ma sta sotto una striscia di sistema.
    // Era gia stato provato oggi e sembrava non cambiare niente, ma quel test
    // era sporco: c'era ancora il guscio alto 100dvh a tenere la barra in
    // alto, e la bocciatura ha riguardato il sintomo sbagliato.
    // Se l'ora bianca su fondo chiaro risulta illeggibile si torna a
    // "default": e questa riga sola.
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: `${basePath}/theboyz-mark.png?v=${iconVersion}`,
    apple: [
      {
        url: `${basePath}/apple-touch-icon.png?v=${iconVersion}`,
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it">
      <head>
        <meta httpEquiv="Cache-Control" content="no-cache, must-revalidate" />
        {/* Recupero da cache mista. iOS puo conservare l'HTML di un deploy
            vecchio: quell'HTML chiama file JavaScript che non esistono piu e
            la pagina muore prima che React parta, quindi il controllo di
            versione dentro l'app non fa in tempo a intervenire. Questo pezzo
            e inline nell'head, gira subito, e se un file non si carica
            ricarica una volta sola scavalcando la cache. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var K="theboyz-recover";function r(){try{if(sessionStorage.getItem(K))return;sessionStorage.setItem(K,"1")}catch(e){}var u=new URL(location.href);u.searchParams.set("r",Date.now().toString(36));location.replace(u.toString())}window.addEventListener("error",function(e){var t=e.target;if(t&&(t.tagName==="SCRIPT"||t.tagName==="LINK"))r()},true);window.addEventListener("load",function(){try{sessionStorage.removeItem(K)}catch(e){}})})();`,
          }}
        />
        {/* Inter da Google Fonts. Caricato via link e non con next/font
            perche in export statico next/font scarica il file a build time:
            se la rete della pipeline non risponde, salta tutta la build.
            Cosi invece il peggio che puo capitare e il fallback di sistema. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,400;0,600;0,700;0,800;0,900;1,700;1,800;1,900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <BuildWatcher />
        {children}
      </body>
    </html>
  );
}
