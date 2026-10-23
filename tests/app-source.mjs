import { readFile } from "node:fs/promises";

// Il codice che prima stava tutto in app/page.tsx, ora diviso per sezione.
// I test che cercano testi nel sorgente leggono l'insieme, cosi non dipendono
// da in quale file sta un componente.
export const APP_SOURCE_FILES = [
  "app/page.tsx",
  "app/core.tsx",
  "app/ui.tsx",
  "app/motion.tsx",
  "app/BottomSheet.tsx",
  "app/padel/emblems.tsx",
  "app/padel/matches.tsx",
  "app/padel/ranking.tsx",
  "app/padel/match-form.tsx",
  "app/padel/plays.tsx",
  "app/padel/tournaments.tsx",
  "app/pizza/modals.tsx",
];

export async function readAppSource() {
  const root = new URL("../", import.meta.url);
  const parts = await Promise.all(APP_SOURCE_FILES.map((file) => readFile(new URL(file, root), "utf8")));
  return parts.join("\n");
}
