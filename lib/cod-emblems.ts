import type { CodGb, CodMode } from "./cod-gb.ts";

export const codEmblemDefinitions = [
  { id: "kd-king", title: "IL CECCHINO", criterion: "K/D complessivo più alto", metric: "kd", direction: "max" },
  { id: "goat", title: "GOAT", criterion: "Media punti più alta, tutte le modalità", metric: "score", direction: "max" },
  { id: "kd-last", title: "BERSAGLIO MOBILE", criterion: "K/D complessivo più basso", metric: "kd", direction: "min" },
  { id: "score-last", title: "PESO MORTO", criterion: "Media punti più bassa, tutte le modalità", metric: "score", direction: "min" },
  { id: "hardpoint", title: "RE DELLA ZONA", criterion: "Media punti più alta in Hardpoint", metric: "score", direction: "max", mode: "hardpoint" },
  { id: "search-destroy", title: "SPECIALISTA", criterion: "Media punti più alta in Search & Destroy", metric: "score", direction: "max", mode: "search_destroy" },
  { id: "overload", title: "CORRIERE ESPRESSO", criterion: "Media punti più alta in Overload", metric: "score", direction: "max", mode: "overload" },
] as const;

type Totals = { profileId: string; games: number; kills: number; deaths: number; kdKills: number; deathGames: number; score: number; scoredGames: number };
function totals(gbs: CodGb[], mode?: CodMode) {
  const rows = new Map<string, Totals>();
  for (const gb of gbs) {
    if (gb.status !== "processed" || (mode && gb.mode !== mode)) continue;
    for (const p of gb.players) {
      if (!p.profile_id) continue;
      const row = rows.get(p.profile_id) ?? { profileId: p.profile_id, games: 0, kills: 0, deaths: 0, kdKills: 0, deathGames: 0, score: 0, scoredGames: 0 };
      row.games++; row.kills += p.kills;
      // Il K/D conta solo le GB con le morti: senza, non c'e un rapporto da fare.
      if (p.deaths != null) { row.deaths += p.deaths; row.kdKills += p.kills; row.deathGames++; }
      if (p.score != null) { row.score += p.score; row.scoredGames++; }
      rows.set(p.profile_id, row);
    }
  }
  return [...rows.values()];
}

export function codEmblems(gbs: CodGb[]) {
  return codEmblemDefinitions.map(def => {
    const rows = totals(gbs, "mode" in def ? def.mode : undefined);
    const eligible = rows.filter(r => def.metric === "kd" ? r.deathGames > 0 && r.kdKills + r.deaths > 0 : r.scoredGames === r.games && r.games > 0);
    const valueOf = (r: Totals) => def.metric === "kd" ? r.deaths ? r.kdKills / r.deaths : Infinity : r.score / r.games;
    const values = eligible.map(valueOf);
    const target = values.length ? (def.direction === "max" ? Math.max(...values) : Math.min(...values)) : null;
    // Il premio negativo richiede un confronto reale: niente ultimo posto da soli o a pari merito con tutti.
    const assign = target !== null && (def.direction === "max" || (eligible.length >= 2 && Math.max(...values) > target));
    return { ...def, holders: assign ? eligible.filter(r => valueOf(r) === target).map(r => r.profileId) : [], value: assign ? target : null };
  });
}
