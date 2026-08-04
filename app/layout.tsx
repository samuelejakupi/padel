import type { Metadata, Viewport } from "next";
import BuildWatcher from "./build-watcher";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

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
    statusBarStyle: "black",
  },
  icons: {
    icon: `${basePath}/theBOYZ.png`,
    apple: `${basePath}/apple-touch-icon.png`,
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
      </head>
      <body>
        <BuildWatcher />
        {children}
      </body>
    </html>
  );
}
