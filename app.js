import { Chess } from "https://esm.sh/chess.js@1.4.0";
import { findBestMove } from "./engine.js";

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
  undoButton.disabled = thinking || history.length === 0;
}

function onSquareClick(square) {
  if (thinking || game.isGameOver() || game.turn() !== "w") return;
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
  game.reset();
  selected = null;
  legalTargets = [];
  thinking = false;
  render();
});

undoButton.addEventListener("click", () => {
  if (thinking) return;
  if (game.turn() === "w" && game.history().length) game.undo(); // Undo Marlin's move.
  if (game.turn() === "b" && game.history().length) game.undo(); // Undo your move.
  selected = null;
  legalTargets = [];
  render();
});

render();
