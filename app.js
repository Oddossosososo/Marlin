import { Chess } from "https://esm.sh/chess.js@1.4.0";
import { findBestMove } from "./engine.js";
import { findBestMove as findV1Move } from "./engine-v1.js";

const game = new Chess();
const boardEl = document.querySelector("#board");
const statusEl = document.querySelector("#status");
const thinkingEl = document.querySelector("#thinking");
const historyEl = document.querySelector("#history");
const depthEl = document.querySelector("#depth");
const undoButton = document.querySelector("#undo");
let selected = null;
let legalTargets = [];
let thinking = false;
let arenaRunning = false;
let arenaStopRequested = false;
const arenaStats = { v2: 0, draws: 0, v1: 0 };
const playNav = document.querySelector("#play-nav");
const arenaNav = document.querySelector("#arena-nav");
const arenaPanel = document.querySelector("#arena-panel");

const symbols = {
  w: { k:"♔", q:"♕", r:"♖", b:"♗", n:"♘", p:"♙" },
  b: { k:"♚", q:"♛", r:"♜", b:"♝", n:"♞", p:"♟︎" }
};
const files = "abcdefgh";

function statusText() {
  if (game.isCheckmate()) return game.turn() === "w" ? "Checkmate — Marlin wins" : "Checkmate — You win!";
  if (game.isStalemate()) return "Draw — stalemate";
  if (game.isDraw()) return "Draw";
  if (thinking) return "Marlin is thinking…";
  return game.turn() === "w" ? "Your move — White" : "Marlin to move — Black";
}

function render() {
  const board = game.board();
  boardEl.innerHTML = "";
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const square = files[c] + (8 - r);
      const piece = board[r][c];
      const button = document.createElement("button");
      button.type = "button";
      button.className = "square " + ((r + c) % 2 === 0 ? "light" : "dark");
      button.setAttribute("role", "gridcell");
      button.setAttribute("aria-label", square + (piece ? " " + piece.color + " " + piece.type : " empty"));
      if (selected === square) button.classList.add("selected");
      if (legalTargets.includes(square)) button.classList.add(piece ? "capture" : "legal");
      button.textContent = piece ? symbols[piece.color][piece.type] : "";
      button.addEventListener("click", () => onSquareClick(square));
      boardEl.appendChild(button);
    }
  }

  statusEl.textContent = statusText();
  thinkingEl.textContent = thinking ? "MARLIN SEARCHING…" : "MARLIN READY";
  const history = game.history();
  historyEl.innerHTML = "";
  if (!history.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "Moves will appear here.";
    historyEl.appendChild(li);
  } else {
    for (let i = 0; i < history.length; i += 2) {
      const li = document.createElement("li");
      li.textContent = Math.floor(i / 2) + 1 + ". " + history[i] + (history[i + 1] ? "   " + history[i + 1] : "");
      historyEl.appendChild(li);
    }
  }
  undoButton.disabled = thinking || arenaRunning || history.length === 0;
}

function onSquareClick(square) {
  if (thinking || arenaRunning || game.isGameOver() || game.turn() !== "w") return;
  const piece = game.get(square);

  if (selected && legalTargets.includes(square)) {
    game.move({ from: selected, to: square, promotion: "q" });
    selected = null;
    legalTargets = [];
    render();
    if (!game.isGameOver()) makeEngineMove();
    return;
  }

  if (piece && piece.color === "w") {
    selected = square;
    legalTargets = game.moves({ square, verbose: true }).map(move => move.to);
  } else {
    selected = null;
    legalTargets = [];
  }
  render();
}

function makeEngineMove() {
  thinking = true;
  selected = null;
  legalTargets = [];
  render();

  // Let the browser paint the thinking state before the search begins.
  setTimeout(() => {
    try {
      const depth = Number(depthEl.value);
      const move = findBestMove(game, depth);
      if (move && !game.isGameOver()) game.move(move);
    } catch (error) {
      console.error("Marlin search error:", error);
      thinkingEl.textContent = "ENGINE ERROR — see console";
    } finally {
      thinking = false;
      render();
    }
  }, 40);
}

document.querySelector("#new-game").addEventListener("click", () => {
  if (arenaRunning) return;
  game.reset();
  selected = null;
  legalTargets = [];
  thinking = false;
  render();
});

undoButton.addEventListener("click", () => {
  if (thinking || arenaRunning) return;
  if (game.turn() === "w" && game.history().length) game.undo(); // Undo Marlin's move.
  if (game.turn() === "b" && game.history().length) game.undo(); // Undo your move.
  selected = null;
  legalTargets = [];
  render();
});


// PGN maker: validates imported games and tags Marlin as GM on either side.
const pgnInput = document.querySelector("#pgn-input");
const pgnOutput = document.querySelector("#pgn-output");
const pgnStatus = document.querySelector("#pgn-status");
const marlinColor = document.querySelector("#marlin-color");

document.querySelector("#use-current-pgn").addEventListener("click", () => {
  pgnInput.value = game.pgn({ maxWidth: 80 });
  pgnStatus.textContent = "Current game loaded into the PGN editor.";
});

document.querySelector("#make-pgn").addEventListener("click", () => {
  try {
    const imported = new Chess();
    const source = pgnInput.value.trim() || game.pgn({ maxWidth: 80 });
    imported.loadPgn(source);
    const marlinIsWhite = marlinColor.value === "w";
    const whiteName = marlinIsWhite ? "Marlin" : "Player";
    const blackName = marlinIsWhite ? "Player" : "Marlin";
    const whiteTitle = marlinIsWhite ? '[WhiteTitle "GM"]' : "";
    const blackTitle = marlinIsWhite ? "" : '[BlackTitle "GM"]';
    let body = imported.pgn({ maxWidth: 80 });
    body = body
      .replace(/^\[(?:White|Black|WhiteTitle|BlackTitle)\s+"[^"]*"\]\s*\n/gm, "")
      .replace(/^\[Event\s+"[^"]*"\]\s*\n/gm, "");
    const headers = [
      '[Event "Marlin PGN"]',
      '[Site "Marlin Chess"]',
      '[White "' + whiteName + '"]',
      whiteTitle,
      '[Black "' + blackName + '"]',
      blackTitle,
      '[Result "' + (imported.isCheckmate() ? (imported.turn() === "w" ? "0-1" : "1-0") : (imported.isDraw() ? "1/2-1/2" : "*")) + '"]'
    ].filter(Boolean).join("\n");
    pgnOutput.value = headers + "\n\n" + body.replace(/^\[[^\n]*\]\s*\n/gm, "").trim();
    pgnStatus.textContent = "PGN created and validated. Marlin is " + (marlinIsWhite ? "White" : "Black") + " with the GM title tag.";
  } catch (error) {
    pgnOutput.value = "";
    pgnStatus.textContent = "Invalid PGN: " + error.message;
  }
});

document.querySelector("#download-pgn").addEventListener("click", () => {
  if (!pgnOutput.value.trim()) {
    pgnStatus.textContent = "Create the PGN first.";
    return;
  }
  const blob = new Blob([pgnOutput.value], { type: "application/x-chess-pgn;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "marlin-game.pgn";
  link.click();
  URL.revokeObjectURL(url);
});


let arenaWorker = null;
let arenaRequestId = 0;
let arenaAutoStarted = false;

function setSection(section) {
  const showArena = section === "arena";
  const layout = document.querySelector(".layout");
  const boardWrap = document.querySelector(".board-wrap");
  const arenaBoardSlot = document.querySelector("#arena-board-slot");
  const sidePanel = document.querySelector(".panel");
  arenaPanel.hidden = !showArena;
  document.querySelector(".pgn-panel").hidden = showArena;
  if (showArena) {
    arenaBoardSlot.appendChild(boardWrap);
  } else {
    layout.insertBefore(boardWrap, sidePanel);
  }
  layout.hidden = false;
  playNav.classList.toggle("active", !showArena);
  arenaNav.classList.toggle("active", showArena);
  if (!showArena) arenaAutoStarted = false;
  if (showArena && !arenaAutoStarted && !arenaRunning) {
    arenaAutoStarted = true;
    startArenaMatch();
  }
}
playNav.addEventListener("click", () => setSection("play"));
arenaNav.addEventListener("click", () => setSection("arena"));

function updateArenaStats() {
  document.querySelector("#v2-wins").textContent = arenaStats.v2;
  document.querySelector("#arena-draws").textContent = arenaStats.draws;
  document.querySelector("#v1-wins").textContent = arenaStats.v1;
}
function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function stopArenaWorker() {
  if (arenaWorker) {
    arenaWorker.terminate();
    arenaWorker = null;
  }
}

function getArenaMove(version, depth) {
  return new Promise((resolve, reject) => {
    stopArenaWorker();
    const requestId = ++arenaRequestId;
    const worker = new Worker("./arena-worker.js", { type: "module" });
    arenaWorker = worker;
    worker.onmessage = (event) => {
      if (event.data.requestId !== requestId) return;
      stopArenaWorker();
      if (event.data.error) reject(new Error(event.data.error));
      else resolve(event.data.move);
    };
    worker.onerror = (event) => {
      stopArenaWorker();
      reject(new Error(event.message || "Arena worker failed to load"));
    };
    worker.postMessage({
      requestId,
      pgn: game.pgn({ maxWidth: 1000 }),
      depth,
      version
    });
  });
}

async function startArenaMatch() {
  if (arenaRunning) return;
  arenaRunning = true;
  arenaStopRequested = false;
  game.reset();
  selected = null;
  legalTargets = [];
  const depth = Number(document.querySelector("#arena-depth").value);
  const speed = Number(document.querySelector("#arena-speed").value);
  const startButton = document.querySelector("#arena-start");
  startButton.disabled = true;
  document.querySelector("#arena-live").textContent = "LIVE";
  document.querySelector("#arena-progress").textContent = "V2 (White) vs V1 (Black) — match running";
  document.querySelector("#arena-ply").textContent = "0 plies";
  render();
  try {
    while (!game.isGameOver() && !arenaStopRequested && game.history().length < 240) {
      const v2Turn = game.turn() === "w";
      const move = await getArenaMove(v2Turn ? "v2" : "v1", depth);
      if (arenaStopRequested) break;
      if (!move) break;
      game.move(move);
      render();
      document.querySelector("#arena-ply").textContent = game.history().length + " plies";
      const last = game.history({ verbose: true }).slice(-1)[0];
      document.querySelector("#arena-progress").textContent =
        (v2Turn ? "Marlin V2" : "Marlin V1") + " played " + (last?.san || move.from + "-" + move.to);
      await wait(speed);
    }
    if (game.isCheckmate()) {
      const winner = game.turn() === "w" ? "V1" : "V2";
      if (winner === "V2") arenaStats.v2++; else arenaStats.v1++;
      document.querySelector("#arena-live").textContent = winner + " WINS";
      document.querySelector("#arena-progress").textContent = "Checkmate — Marlin " + winner + " wins.";
    } else if (game.isDraw() || game.isStalemate() || game.isThreefoldRepetition() || game.history().length >= 240) {
      arenaStats.draws++;
      document.querySelector("#arena-live").textContent = "DRAW";
      document.querySelector("#arena-progress").textContent = "Draw — no winner.";
    } else {
      document.querySelector("#arena-live").textContent = "STOPPED";
      document.querySelector("#arena-progress").textContent = "Match stopped. Result not counted.";
    }
    updateArenaStats();
  } catch (error) {
    console.error("Arena match failed:", error);
    document.querySelector("#arena-live").textContent = "ERROR";
    document.querySelector("#arena-progress").textContent = "Match error: " + error.message;
  } finally {
    stopArenaWorker();
    arenaRunning = false;
    startButton.disabled = false;
    render();
  }
}

document.querySelector("#arena-start").addEventListener("click", () => {
  arenaAutoStarted = true;
  startArenaMatch();
});
document.querySelector("#arena-stop").addEventListener("click", () => {
  arenaStopRequested = true;
  stopArenaWorker();
  document.querySelector("#arena-live").textContent = "STOPPING";
});

render();
