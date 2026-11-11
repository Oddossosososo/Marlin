// MARLIN V9's conservative opening repertoire.
// Classical mainlines only: develop minor pieces, contest the centre and castle.
// The GM-trained local book takes priority; this is the fallback until it exists.
const OPENING_LINES = [
  {
    name: "Italian Game",
    weight: 45,
    moves: ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "c3", "Nf6", "d3", "d6", "O-O", "O-O"]
  },
  {
    name: "Ruy Lopez",
    weight: 35,
    moves: ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Ba4", "Nf6", "O-O", "Be7", "Re1", "b5", "Bb3", "d6", "c3", "O-O"]
  },
  {
    name: "Queen's Gambit Declined",
    weight: 25,
    moves: ["d4", "d5", "c4", "e6", "Nc3", "Nf6", "Nf3", "Be7", "Bg5", "O-O", "e3"]
  },
  {
    name: "Caro-Kann Defence",
    weight: 65,
    moves: ["e4", "c6", "d4", "d5", "Nc3", "dxe4", "Nxe4", "Bf5", "Ng3", "Bg6"]
  },
  {
    name: "Sicilian Defence",
    weight: 35,
    moves: ["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "a6"]
  },
  {
    name: "Queen's Gambit Declined (Black)",
    weight: 50,
    moves: ["d4", "d5", "c4", "e6", "Nc3", "Nf6", "Nf3", "Be7", "Bg5", "O-O"]
  }
];

export function selectV9CuratedOpeningMove(game, random = Math.random) {
  const history = game.history();
  const legal = game.moves({ verbose: true });
  if (!legal.length) return null;

  const choices = new Map();
  for (const line of OPENING_LINES) {
    if (history.length >= line.moves.length) continue;
    if (!history.every((san, index) => san === line.moves[index])) continue;
    const san = line.moves[history.length];
    choices.set(san, (choices.get(san) || 0) + line.weight);
  }
  if (!choices.size) return null;

  const candidates = [...choices.entries()]
    .map(([san, weight]) => ({ san, weight, move: legal.find(move => move.san === san) }))
    .filter(candidate => candidate.move);
  if (!candidates.length) return null;

  const total = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
  let cursor = Math.max(0, Math.min(0.999999999, Number(random()) || 0)) * total;
  for (const candidate of candidates) {
    cursor -= candidate.weight;
    if (cursor < 0) {
      return { ...candidate.move, source: "curated-v9-opening-book", opening: OPENING_LINES.find(line => line.moves[history.length] === candidate.san)?.name || "Classical repertoire" };
    }
  }
  const last = candidates[candidates.length - 1];
  return { ...last.move, source: "curated-v9-opening-book" };
}

export function v9CuratedOpeningLines() {
  return OPENING_LINES.map(line => ({ name: line.name, weight: line.weight, moves: [...line.moves] }));
}
