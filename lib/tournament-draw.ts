export type TournamentDraftTeam = { playerA: string; playerB: string; name: string };

export function drawTournamentTeams(participantIds: string[], random = Math.random): TournamentDraftTeam[] {
  if (![6, 8].includes(participantIds.length) || new Set(participantIds).size !== participantIds.length) {
    throw new Error("Seleziona 6 o 8 partecipanti diversi.");
  }

  const shuffled = [...participantIds];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return Array.from({ length: shuffled.length / 2 }, (_, index) => ({
    playerA: shuffled[index * 2],
    playerB: shuffled[index * 2 + 1],
    name: "",
  }));
}
