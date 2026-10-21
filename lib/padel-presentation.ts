import type { PadelMatch } from "./supabase";

export type ResultFilter = "all" | "wins" | "losses" | "draws";
export type PeriodFilter = "all" | "30" | "90";

export function filterMatchPeriod(matches: PadelMatch[], period: PeriodFilter, now = new Date()) {
  if (period === "all") return matches;
  const start = new Date(now);
  start.setDate(start.getDate() - Number(period));
  start.setHours(0, 0, 0, 0);
  return matches.filter((match) => {
    const date = new Date(match.played_at);
    return date >= start && date <= now;
  });
}

export function filterMatchResults(matches: PadelMatch[], outcome: ResultFilter, viewerId?: string) {
  if (outcome === "all") return matches;
  return matches.filter((match) => {
    const player = match.players.find((entry) => entry.profile_id === viewerId);
    if (!player) return false;
    if (outcome === "draws") return match.winner_team === 0;
    return match.winner_team !== 0 && (outcome === "wins" ? match.winner_team === player.team : match.winner_team !== player.team);
  });
}
