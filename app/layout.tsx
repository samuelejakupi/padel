import type { Metadata } from "next";
import BuildWatcher from "./build-watcher";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

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
