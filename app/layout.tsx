import type { Metadata } from "next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

export const metadata: Metadata = {
  title: "Padel House · La classifica del tuo gruppo",
  description:
    "Partite, statistiche e ranking del tuo gruppo di padel, in un unico posto.",
  metadataBase: siteUrl ? new URL(siteUrl) : undefined,
  openGraph: {
    title: "Padel House",
    description: "Ogni partita lascia il segno.",
    type: "website",
    locale: "it_IT",
    images: siteUrl ? [{ url: "/og.png", width: 1200, height: 630, alt: "Padel House" }] : undefined,
  },
  twitter: {
    card: "summary_large_image",
    title: "Padel House",
    description: "Ogni partita lascia il segno.",
    images: siteUrl ? ["/og.png"] : undefined,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
