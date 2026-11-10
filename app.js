import { Chess } from "https://esm.sh/chess.js@1.4.0";
import { findBestMove as findV6Move, initialiseV6 } from "./engine-v6.js";

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
const arenaStats = { v6: 0, draws: 0, v5: 0 };
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

  setTimeout(async () => {
    try {
      const depth = Number(depthEl.value);
      const nnue = await initialiseV6();
      const move = findV6Move(game, depth);
      thinkingEl.textContent = nnue.nnue ? "MARLIN V6 · NNUE ACTIVE" : "MARLIN V6 · NNUE NOT TRAINED (CLASSICAL EVAL)";
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
  if (game.turn() === "w" && game.history().length) game.undo();
  if (game.turn() === "b" && game.history().length) game.undo();
  selected = null;
  legalTargets = [];
  render();
});

// PGN branding: standard PGN headers keep Marlin attribution when shared or downloaded.
function addMarlinPgnBranding(pgn, eventName = "Marlin Chess Game") {
  const tags = [
    '[Event "' + eventName + '"]',
    '[Site "https://oddossosososo.github.io/Marlin/"]',
    '[Annotator "Marlin Chess Engine"]'
  ];
  let text = (pgn || "").trim();
  // Replace any existing Event/Site/Annotator headers, then add the Marlin tags.
  text = text.replace(/^\[(?:Event|Site|Annotator) "[^"]*"\]\s*\n/gm, "");
  const split = text.indexOf("\n\n");
  if (split >= 0) text = text.slice(split + 2);
  return tags.join("\n") + "\n\n" + text.trim();
}

// PGN maker: validates imported games and tags Marlin as GM on either side.
const pgnInput = document.querySelector("#pgn-input");
const pgnOutput = document.querySelector("#pgn-output");
const pgnStatus = document.querySelector("#pgn-status");
const marlinColor = document.querySelector("#marlin-color");

document.querySelector("#use-current-pgn").addEventListener("click", () => {
  pgnInput.value = addMarlinPgnBranding(game.pgn({ maxWidth: 80 }), "Marlin Current Game");
  pgnStatus.textContent = "Current game loaded into the PGN editor.";
});

document.querySelector("#make-pgn").addEventListener("click", () => {
  try {
    const imported = new Chess();
    const source = pgnInput.value.trim() || addMarlinPgnBranding(game.pgn({ maxWidth: 80 }), "Marlin Current Game");
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
    pgnOutput.value = addMarlinPgnBranding(headers + "\n\n" + body.replace(/^\[[^\n]*\]\s*\n/gm, "").trim(), "Marlin PGN");
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

// Arena PGN controls: copy for quick pasting or download as a file.
function getArenaPgn() {
  if (!game.history().length) {
    document.querySelector("#arena-progress").textContent = "No Arena moves yet. Start or finish a match first.";
    return "";
  }
  return addMarlinPgnBranding(game.pgn({ maxWidth: 100 }), "Marlin V6 vs V5 Arena") + "\n";
}

document.querySelector("#arena-copy-pgn").addEventListener("click", async () => {
  const pgn = getArenaPgn();
  if (!pgn) return;
  try {
    await navigator.clipboard.writeText(pgn);
    document.querySelector("#arena-progress").textContent = "Arena PGN copied — paste it into Arena, Lichess, or another chess tool.";
  } catch (error) {
    document.querySelector("#arena-progress").textContent = "Clipboard blocked by browser. Use Download Arena PGN instead.";
  }
});

document.querySelector("#arena-download-pgn").addEventListener("click", () => {
  const pgn = getArenaPgn();
  if (!pgn) return;
  const blob = new Blob([pgn], { type: "application/x-chess-pgn;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "marlin-arena-game.pgn";
  link.click();
  URL.revokeObjectURL(url);
});

let arenaWorker = null;
let arenaRequestId = 0;
let arenaAutoStarted = false;
let arenaMatchCount = 0;

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
  layout.hidden = showArena;
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
  document.querySelector("#v5-wins").textContent = arenaStats.v6;
  document.querySelector("#arena-draws").textContent = arenaStats.draws;
  document.querySelector("#v3-wins").textContent = arenaStats.v5;
}
function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

let arenaPendingResolve = null;

function stopArenaWorker() {
  if (arenaWorker) {
    arenaWorker.terminate();
    arenaWorker = null;
  }
  if (arenaPendingResolve) {
    const resolve = arenaPendingResolve;
    arenaPendingResolve = null;
    resolve(null);
  }
}

function getArenaMove(version, depth) {
  return new Promise((resolve, reject) => {
    const requestId = ++arenaRequestId;
    if (!arenaWorker) {
      arenaWorker = new Worker("./arena-worker.js", { type: "module" });
    }
    const worker = arenaWorker;
    arenaPendingResolve = resolve;

    worker.onmessage = (event) => {
      if (event.data.requestId !== requestId) return;
      arenaPendingResolve = null;
      if (event.data.error) reject(new Error(event.data.error));
      else resolve(event.data.move);
    };

    worker.onerror = (event) => {
      worker.terminate();
      if (arenaWorker === worker) arenaWorker = null;
      arenaPendingResolve = null;
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
  const v5Color = arenaMatchCount % 2 === 0 ? "b" : "w";
  document.querySelector("#arena-progress").textContent = "V6 vs V5 — " + (v5Color === "b" ? "V6 White" : "V5 White") + " — match running";
  document.querySelector("#arena-ply").textContent = "0 plies";
  render();
  try {
    while (!game.isGameOver() && !arenaStopRequested && game.history().length < 240) {
      const v5Turn = game.turn() === v5Color;
      const move = await getArenaMove(v5Turn ? "v5" : "v6", depth);
      if (arenaStopRequested) break;
      if (!move) break;
      game.move(move);
      render();
      document.querySelector("#arena-ply").textContent = game.history().length + " plies";
      const last = game.history({ verbose: true }).slice(-1)[0];
      document.querySelector("#arena-progress").textContent =
        (v5Turn ? "Marlin V5" : "Marlin V6") + " played " + (last?.san || move.from + "-" + move.to);
      await wait(speed);
    }
    if (game.isCheckmate()) {
      const winnerColor = game.turn() === "w" ? "b" : "w";
      const winner = winnerColor === v5Color ? "V5" : "V6";
      if (winner === "V6") arenaStats.v6++; else arenaStats.v5++;
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
    arenaMatchCount++;
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
