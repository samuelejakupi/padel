import type { PadelMatch, Tournament } from "./supabase";

export const INDIVIDUAL_TOURNAMENT_AWARDS = [30, 20, 10];

export function buildIndividualStandings(tournament: Tournament, matches: PadelMatch[]) {
  const matchMap = new Map(matches.map((match) => [match.id, match]));
  const rows = (tournament.participants ?? []).map((participant) => ({
    profileId: participant.profile_id, sortOrder: participant.sort_order,
    played: 0, wins: 0, gamesWon: 0, gamesLost: 0,
    directWins: 0, directDifference: 0, rankPosition: 0, award: 0,
  }));
  const scores = tournament.fixtures.flatMap((fixture) => {
    const match = fixture.match_id ? matchMap.get(fixture.match_id) : null;
    const set = match?.sets.find((set) => set.set_number === 1);
    if (!match || !set) return [];
    return [{ team1: [fixture.player1_id, fixture.player2_id],
      team2: [fixture.player3_id, fixture.player4_id], winner: match.winner_team,
      games1: set.team1_games, games2: set.team2_games }];
  });
  for (const row of rows) {
    for (const score of scores) {
      const side = score.team1.includes(row.profileId) ? 1 : score.team2.includes(row.profileId) ? 2 : 0;
      if (!side) continue;
      row.played += 1;
      if (score.winner === side) row.wins += 1;
      row.gamesWon += side === 1 ? score.games1 : score.games2;
      row.gamesLost += side === 1 ? score.games2 : score.games1;
    }
  }
  // Mini-classifica fra i giocatori con lo stesso numero di vittorie.
  // Conta una volta ogni confronto con un avversario del gruppo a pari punti;
  // quando i giocatori sono compagni, la partita non è uno scontro diretto.
  for (const row of rows) {
    const rivals = rows.filter((other) => other.profileId !== row.profileId && other.wins === row.wins);
    for (const score of scores) {
      const side = score.team1.includes(row.profileId) ? 1 : score.team2.includes(row.profileId) ? 2 : 0;
      if (!side) continue;
      const opposition = side === 1 ? score.team2 : score.team1;
      const rivalCount = rivals.filter((rival) => opposition.includes(rival.profileId)).length;
      if (score.winner === side) row.directWins += rivalCount;
      row.directDifference += rivalCount * (side === 1 ? score.games1 - score.games2 : score.games2 - score.games1);
    }
  }
  const compare = (a: typeof rows[number], b: typeof rows[number]) => b.wins - a.wins
    || b.directWins - a.directWins
    || (b.gamesWon - b.gamesLost) - (a.gamesWon - a.gamesLost)
    || b.directDifference - a.directDifference
    || b.gamesWon - a.gamesWon;
  rows.sort((a, b) => compare(a, b) || a.sortOrder - b.sortOrder);
  for (let index = 0; index < rows.length;) {
    let end = index + 1;
    while (end < rows.length && compare(rows[index], rows[end]) === 0) end += 1;
    const points = INDIVIDUAL_TOURNAMENT_AWARDS.slice(index, end).reduce((sum, prize) => sum + prize, 0);
    const award = Math.round(points / (end - index) * 10000) / 10000;
    for (let tied = index; tied < end; tied += 1) {
      rows[tied].rankPosition = index + 1;
      rows[tied].award = award;
    }
    index = end;
  }
  return rows;
}
