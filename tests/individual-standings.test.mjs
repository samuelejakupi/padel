import assert from "node:assert/strict";
import test from "node:test";
import { buildIndividualStandings } from "../lib/individual-standings.ts";

function standings(players, games) {
  const fixtures = games.map(([a,b,c,d], i) => ({
    player1_id:a, player2_id:b, player3_id:c, player4_id:d, match_id:String(i),
  }));
  const matches = games.map(([, , , , x,y], i) => ({
    id:String(i), winner_team:x>y?1:x<y?2:0,
    sets:[{set_number:1,team1_games:x,team2_games:y}],
  }));
  return buildIndividualStandings({participants:players.map((profile_id,sort_order)=>({profile_id,sort_order})),fixtures}, matches);
}
const yesterday = [
  ["Mattia","Manu","Samu","Dani",4,6],
  ["Mattia","Samu","Atti","Dani",6,3],
  ["Dani","Mattia","Manu","Atti",6,3],
  ["Manu","Samu","Atti","Mattia",5,7],
  ["Dani","Manu","Samu","Atti",3,6],
];
test("torneo reale: due primi, premi condivisi e terzo posto non spostato", () => {
  const rows=standings(["Atti","Samu","Mattia","Manu","Dani"],yesterday);
  assert.deepEqual(rows.map(r=>[r.profileId,r.rankPosition,r.award]),[
    ["Samu",1,25],["Mattia",1,25],["Atti",3,10],["Dani",4,0],["Manu",5,0],
  ]);
  assert.equal(rows[0].directWins,1);
  assert.equal(rows[0].directDifference,0);
});
test("l'ordine d'iscrizione non cambia posizione o premio", () => {
  const run = players => new Map(standings(players,yesterday).map(r=>[r.profileId,[r.rankPosition,r.award]]));
  assert.deepEqual(run(["Atti","Samu","Mattia","Manu","Dani"]),run(["Manu","Dani","Mattia","Samu","Atti"]));
});
test("differenza complessiva prima della differenza negli scontri diretti", () => {
  const rows=standings(["a","b","c","d","e","f"],[
    ["a","c","b","d",6,3], ["a","c","b","d",4,6],
    ["a","e","c","f",6,5], ["b","e","d","f",6,0],
  ]);
  const a=rows.find(r=>r.profileId==="a"), b=rows.find(r=>r.profileId==="b");
  assert.equal(a.wins,b.wins);
  assert.equal(a.directWins,b.directWins);
  assert.ok(a.directDifference>b.directDifference);
  assert.ok(b.gamesWon-b.gamesLost>a.gamesWon-a.gamesLost);
  assert.ok(b.rankPosition<a.rankPosition);
});
test("i compagni non sono avversari e i premi restano divisi fra tutti i pari", () => {
  const rows=standings(["a","b","c","d"],[["a","b","c","d",6,3]]);
  assert.deepEqual(rows.map(r=>[r.rankPosition,r.award,r.directWins]),[[1,25,0],[1,25,0],[3,5,0],[3,5,0]]);
});
