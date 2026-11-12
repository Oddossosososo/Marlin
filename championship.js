import { Chess } from "chess.js";
import { writeFile } from "node:fs/promises";

const engines = [
  ["v1", await import("./engine-v1.js")],
  ["v2", await import("./engine-v2.js")],
  ["v4", await import("./engine-v4.js")],
  ["v5", await import("./engine-v5.js")],
  ["v6", await import("./engine-v6.js")],
  ["v7", await import("./engine-v7.js")],
  ["v8", await import("./engine-v8.js")],
  ["v9", await import("./marlin-v9.js")]
];
const DEPTH = Number(process.env.MARLIN_TOURNAMENT_DEPTH || 3);
const GAMES_PER_PAIR = 10;
const MAX_PLIES = 160;
const standings = Object.fromEntries(engines.map(([id]) => [id, { id, points: 0, wins: 0, draws: 0, losses: 0, games: 0 }]));
const pairResults = [];
const pgns = [];

async function moveFor(id, mod, game) {
  let result;
  if (id === "v9") result = await mod.searchV9(game.fen(), DEPTH);
  else {
    const init = mod["initialise" + id.toUpperCase()];
    if (typeof init === "function") await init();
    result = await mod.findBestMove(game, DEPTH);
  }
  if (!result?.from || !result?.to) throw new Error(id + " returned no move");
  const legal = game.moves({ verbose: true }).find(m =>
    m.from === result.from && m.to === result.to &&
    (m.promotion || "q") === (result.promotion || "q")
  );
  if (!legal) throw new Error(id + " returned illegal move " + result.from + result.to);
  return legal;
}

async function playGame(white, black, gameNo) {
  const game = new Chess();
  let plies = 0;
  while (!game.isGameOver() && plies < MAX_PLIES) {
    const id = game.turn() === "w" ? white[0] : black[0];
    const mod = game.turn() === "w" ? white[1] : black[1];
    game.move(await moveFor(id, mod, game));
    plies++;
  }
  const result = game.isCheckmate()
    ? (game.turn() === "w" ? "0-1" : "1-0")
    : "1/2-1/2";
  const whiteScore = result === "1-0" ? 1 : result === "0-1" ? 0 : 0.5;
  const blackScore = 1 - whiteScore;
  const w = standings[white[0]], b = standings[black[0]];
  w.games++; b.games++;
  w.points += whiteScore; b.points += blackScore;
  if (whiteScore === 1) { w.wins++; b.losses++; }
  else if (blackScore === 1) { b.wins++; w.losses++; }
  else { w.draws++; b.draws++; }
  pgns.push(game.pgn({ headers: true }) + "\n");
  return { game: gameNo, white: white[0], black: black[0], result, plies };
}

let gameNo = 0;
for (let i = 0; i < engines.length; i++) {
  for (let j = i + 1; j < engines.length; j++) {
    const results = [];
    for (let n = 0; n < GAMES_PER_PAIR; n++) {
      const white = n % 2 === 0 ? engines[i] : engines[j];
      const black = n % 2 === 0 ? engines[j] : engines[i];
      results.push(await playGame(white, black, ++gameNo));
    }
    pairResults.push({ engines: [engines[i][0], engines[j][0]], games: results });
    console.log("MATCH", engines[i][0], "vs", engines[j][0],
      results.reduce((s, g) => s + (g.result === "1-0" ? (g.white === engines[i][0] ? 1 : 0) : g.result === "0-1" ? (g.black === engines[i][0] ? 1 : 0) : 0.5), 0), "/", GAMES_PER_PAIR);
  }
}

const table = Object.values(standings).sort((a, b) => b.points - a.points || b.wins - a.wins);
const report = { generatedAt: new Date().toISOString(), depth: DEPTH, gamesPerPair: GAMES_PER_PAIR, maxPlies: MAX_PLIES, totalGames: gameNo, standings: table, pairResults };
await writeFile("championship-results.json", JSON.stringify(report, null, 2) + "\n");
await writeFile("championship-games.pgn", pgns.join("\n"));
const current = JSON.parse(await (await import("node:fs/promises")).readFile("champion.json", "utf8"));
const incumbent = standings[current.engineVersion];
const winner = table[0];
if (winner && incumbent && winner.id !== incumbent.id && winner.points > incumbent.points) {
  current.engineVersion = winner.id;
  current.updatedAt = new Date().toISOString();
  current.lastTournament = { winner: winner.id, previousChampion: incumbent.id, winnerPoints: winner.points, incumbentPoints: incumbent.points, games: gameNo };
  await writeFile("champion.json", JSON.stringify(current, null, 2) + "\n");
  console.log("CHAMPION PROMOTED:", winner.id);
} else {
  console.log("CHAMPION RETAINED:", current.engineVersion);
}
console.log("FINAL", JSON.stringify(table));
