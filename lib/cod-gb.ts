export const codModes = {
  hardpoint: { label: "Hardpoint", stats: ["Tempo zona (s)", "Uccisioni obiettivo"] },
  search_destroy: { label: "Cerca e distruggi", stats: ["Bombe piazzate", "Bombe disinnescate", "Prime uccisioni"] },
  overload: { label: "Overload", stats: ["Sovraccarichi", "Trasporti", "Uccisioni obiettivo"] },
} as const;
export type CodMode = keyof typeof codModes;
export const codModeStatKeys = {
  hardpoint: ["hill_seconds", "objective_kills"],
  search_destroy: ["plants", "defuses", "first_bloods"],
  overload: ["overloads", "carries", "objective_kills"],
} as const;
// deaths e null quando lo scoreboard non le mostra (questo COD non le mostra
// per tutti): il K/D si calcola solo sulle GB che le hanno.
export type CodStats = { kills: number; deaths: number | null; score?: number | null } & Record<"damage" | "hill_seconds" | "objective_kills" | "plants" | "defuses" | "first_bloods" | "overloads" | "carries", number | null>;
export type CodPlayerResult = CodStats & { profile_id: string | null; nickname: string; team: number };
export type CodGb = {
  id: string; created_by: string; mode: CodMode; map_name: string; played_at: string;
  status: "pending" | "processing" | "needs_review" | "processed";
  review_note: string | null; image_count: number;
  photos_deleted_at: string | null;
  team1_score: number | null; team2_score: number | null; players: CodPlayerResult[];
};
// Il K/D come testo: solo sulle GB con le morti; "—" se non ce n'e nessuna.
export function codKd(kdKills: number, deaths: number, deathGames: number) {
  if (!deathGames) return "—";
  return deaths ? (kdKills / deaths).toFixed(2) : kdKills ? "∞" : "—";
}

// Somma uccisioni e morti di un elenco di risultati: le morti e le uccisioni
// che servono al K/D contano solo nelle GB in cui le morti ci sono.
export function codKillDeathTotals(results: { kills: number; deaths: number | null }[]) {
  let kills = 0, deaths = 0, kdKills = 0, deathGames = 0;
  for (const r of results) {
    kills += r.kills;
    if (r.deaths != null) { deaths += r.deaths; kdKills += r.kills; deathGames++; }
  }
  return { kills, deaths, kdKills, deathGames };
}

export function codRanking(gbs: CodGb[], mode: CodMode) {
  const totals = new Map<string, Omit<CodStats, "deaths"> & { deaths: number; kdKills: number; deathGames: number; profileId: string; games: number; wins: number }>();
  for (const gb of gbs.filter(g => g.mode === mode && g.status === "processed")) {
    for (const p of gb.players) {
      if (!p.profile_id) continue;
      const row = totals.get(p.profile_id) ?? { profileId: p.profile_id, games: 0, wins: 0, kills: 0, deaths: 0, kdKills: 0, deathGames: 0, score: null, damage: null, hill_seconds: null, objective_kills: null, plants: null, defuses: null, first_bloods: null, overloads: null, carries: null };
      row.games++; row.kills += p.kills;
      if (p.deaths != null) { row.deaths += p.deaths; row.kdKills += p.kills; row.deathGames++; }
      if (gb.team1_score !== null && gb.team2_score !== null && ((p.team === 1 && gb.team1_score > gb.team2_score) || (p.team === 2 && gb.team2_score > gb.team1_score))) row.wins++;
      for (const key of ["score", "damage", "hill_seconds", "objective_kills", "plants", "defuses", "first_bloods", "overloads", "carries"] as const) {
        row[key] = row.games === 1 ? p[key] ?? null : row[key] == null || p[key] == null ? null : row[key]! + p[key]!;
      }
      totals.set(p.profile_id, row);
    }
  }
  const kdOf = (r: { kdKills: number; deaths: number; deathGames: number }) => r.deathGames ? r.kdKills / Math.max(1, r.deaths) : 0;
  return [...totals.values()].sort((a, b) => b.wins - a.wins || kdOf(b) - kdOf(a) || a.profileId.localeCompare(b.profileId));
}

export async function compressScoreboard(file: File): Promise<{ data: string; bytes: number }> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 25 * 1024 * 1024) throw new Error("Usa foto JPG, PNG o WebP fino a 25 MB.");
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Compressione immagini non disponibile.");
    ctx.fillStyle = "white"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.9, 0.8, 0.7, 0.6]) {
      const data = canvas.toDataURL("image/jpeg", quality).split(",")[1];
      const bytes = Math.floor(data.length * 3 / 4);
      if (bytes <= 1024 * 1024) return { data, bytes };
    }
    throw new Error("Foto troppo complessa: ritaglia lo scoreboard e riprova.");
  } finally { bitmap.close(); }
}
