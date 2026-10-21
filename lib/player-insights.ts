import type { PadelMatch, Profile } from "./supabase";

export type PairRecord = {
  matches: PadelMatch[];
  wins: number;
  losses: number;
  draws: number;
  setsWon: number;
  setsLost: number;
  gamesWon: number;
  gamesLost: number;
};

export const PARTNER_MIN_MATCHES = 5;

export function pairRecord(matches: PadelMatch[], playerId: string, otherId: string, together: boolean): PairRecord {
  const record: PairRecord = { matches: [], wins: 0, losses: 0, draws: 0, setsWon: 0, setsLost: 0, gamesWon: 0, gamesLost: 0 };
  if (playerId === otherId) return record;
  for (const match of matches) {
    const player = match.players.find((entry) => entry.profile_id === playerId);
    const other = match.players.find((entry) => entry.profile_id === otherId);
    if (!player || !other || (player.team === other.team) !== together) continue;
    record.matches.push(match);
    if (match.winner_team === 0) record.draws += 1;
    else if (match.winner_team === player.team) record.wins += 1;
    else record.losses += 1;
    // Come nello storico: i game interrotti contano, i set interrotti no.
    // Un terzo set giocato dopo il 2-0 resta fuori dalle statistiche.
    let team1Sets = 0;
    let team2Sets = 0;
    for (const set of [...match.sets].sort((a, b) => a.set_number - b.set_number)) {
      if (team1Sets === 2 || team2Sets === 2) break;
      const own = player.team === 1 ? set.team1_games : set.team2_games;
      const opposition = player.team === 1 ? set.team2_games : set.team1_games;
      record.gamesWon += own;
      record.gamesLost += opposition;
      if (set.incomplete) continue;
      if (own > opposition) record.setsWon += 1;
      if (own < opposition) record.setsLost += 1;
      if (set.team1_games > set.team2_games) team1Sets += 1;
      if (set.team2_games > set.team1_games) team2Sets += 1;
    }
  }
  record.matches.sort((a, b) => b.played_at.localeCompare(a.played_at)
    || (b.created_at ?? "").localeCompare(a.created_at ?? "") || b.id.localeCompare(a.id));
  return record;
}

export function recordWinRate(record: PairRecord): number | null {
  const decided = record.wins + record.losses;
  return decided ? Math.round(record.wins / decided * 100) : null;
}

export function partnerInsights(profiles: Profile[], matches: PadelMatch[], playerId: string) {
  return profiles.filter((profile) => profile.id !== playerId)
    .map((profile) => ({ profile, record: pairRecord(matches, playerId, profile.id, true) }))
    .filter(({ record }) => record.matches.length > 0)
    .sort((a, b) => {
      const established = Number(b.record.matches.length >= PARTNER_MIN_MATCHES) - Number(a.record.matches.length >= PARTNER_MIN_MATCHES);
      // Due vittorie iniziali non superano una coppia già collaudata.
      // Il confronto usa valori non arrotondati e richiede esiti decisivi.
      const aRate = a.record.wins / (a.record.wins + a.record.losses || 1);
      const bRate = b.record.wins / (b.record.wins + b.record.losses || 1);
      return established || bRate - aRate || b.record.matches.length - a.record.matches.length
        || (b.record.gamesWon - b.record.gamesLost) - (a.record.gamesWon - a.record.gamesLost)
        || a.profile.display_name.localeCompare(b.profile.display_name, "it");
    });
}
