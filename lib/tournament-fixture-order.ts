import type { Tournament, TournamentFixture } from "./supabase";

export function canRecordTournamentFixture(tournament: Tournament, fixture: TournamentFixture) {
  if (fixture.match_id) return false;
  if (tournament.mode !== "individual" || tournament.individual_schedule === "complete") return true;
  return !tournament.fixtures.some((other) => !other.match_id && other.match_number < fixture.match_number);
}
