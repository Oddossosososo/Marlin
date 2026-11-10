// MARLIN V6 opening repertoire. Lines are SAN and are always checked against
// the current legal move list before being played. If the opponent leaves theory,
// the engine immediately returns to normal search.
const BOOK_LINES = [
  // White: sound 1.e4 / Ruy Lopez mainline.
  ["e4", "e5", "Nf3", "Nc6", "Bb5", "Nf6", "O-O", "Nxe4", "d4", "Nd6"],
  ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Ba4", "Nf6", "O-O", "Be7", "Re1", "b5", "Bb3", "O-O", "c3", "d5"],
  // White: Queen's Gambit / classical d4 structures.
  ["d4", "d5", "c4", "e6", "Nc3", "Nf6", "Nf3", "Be7", "Bg5", "O-O", "e3"],
  ["d4", "d5", "c4", "e6", "Nc3", "Nf6", "Nf3", "Be7", "Bg5", "O-O", "e3", "h6", "Bh4"],
  // Black: Berlin and Marshall move orders after 1.e4 e5.
  ["e4", "e5", "Nf3", "Nc6", "Bb5", "Nf6"],
  ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Ba4", "Nf6", "O-O", "Be7", "Re1", "b5", "Bb3", "O-O", "c3", "d5"],
  // Black: QGD after 1.d4 d5; Nimzo-Indian when the move order allows it.
  ["d4", "d5", "c4", "e6", "Nc3", "Nf6", "Nf3", "Be7", "Bg5", "O-O"],
  ["d4", "Nf6", "c4", "e6", "Nc3", "Bb4"],
  ["d4", "Nf6", "c4", "e6", "Nf3", "d5", "Nc3", "Bb4"]
];

export function selectOpeningMove(game) {
  const history = game.history();
  const legal = game.moves({ verbose: true });
  if (!legal.length) return null;

  // Exact-prefix matching means a deviation cannot trigger an illegal or
  // unrelated book move. Prefer the longest matching continuation.
  let selectedSan = null;
  let selectedLength = -1;
  for (const line of BOOK_LINES) {
    if (history.length >= line.length || history.length < selectedLength) continue;
    let matches = true;
    for (let i = 0; i < history.length; i++) {
      if (history[i] !== line[i]) { matches = false; break; }
    }
    if (matches && line.length > history.length && history.length >= selectedLength) {
      selectedSan = line[history.length];
      selectedLength = history.length;
    }
  }
  if (!selectedSan) return null;
  return legal.find(move => move.san === selectedSan) || null;
}

export function openingBookSize() { return BOOK_LINES.length; }
