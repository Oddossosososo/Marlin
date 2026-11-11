import { Chess } from "https://esm.sh/chess.js@1.4.0";

const game = new Chess();
const boardEl = document.querySelector("#board");
const statusEl = document.querySelector("#status");
const thinkingEl = document.querySelector("#thinking");
const historyEl = document.querySelector("#history");
const depthEl = document.querySelector("#depth");
const stopSearchButton = document.querySelector("#stop-search");
const undoButton = document.querySelector("#undo");
let selected = null;
let legalTargets = [];
let thinking = false;
let engineStatus = "MARLIN READY";
let positionRevision = 0;
let engineWorker = null;
let engineRequestId = 0;
let pendingEngineRequest = null;
let arenaRunning = false;
let arenaStopRequested = false;
const arenaStats = { v9: 0, draws: 0, v8: 0 };
const playNav = document.querySelector("#play-nav");
const arenaNav = document.querySelector("#arena-nav");
const arenaPanel = document.querySelector("#arena-panel");

const pieceNames = { k:"king", q:"queen", r:"rook", b:"bishop", n:"knight", p:"pawn" };
const files = "abcdefgh";
const MARLIN_LOGO = new URL("./Screenshot%202026-11-10%206.36.32%20PM.png", import.meta.url).href;

function updatePlayerIdentity() {
  const blackPlayer = document.querySelector("#black-player");
  const whitePlayer = document.querySelector("#white-player");
  const inArena = !arenaPanel.hidden;
  const v9IsBlack = lastArenaV9Color === "b";
  const blackName = inArena ? (v9IsBlack ? "MARLIN V9" : "MARLIN V8") : (engineStatus.includes("MARLIN V7") ? "MARLIN V7" : "MARLIN V9");
  const whiteName = inArena ? (v9IsBlack ? "MARLIN V8" : "MARLIN V9") : "YOU";
  const whiteIsHuman = !inArena;

  const setEngine = (element, name) => {
    element.classList.remove("human-player");
    element.classList.add("engine-player");
    element.innerHTML =
      '<img class="player-logo" src="' + MARLIN_LOGO + '" alt="MARLIN engine logo">' +
      '<span class="player-copy"><small>MARLIN ENGINE</small><strong>' + name + '</strong><em>CHESS ENGINE</em></span>' +
      '<span class="player-badge">BOT</span>';
  };
  const setHuman = (element) => {
    element.classList.remove("engine-player");
    element.classList.add("human-player");
    element.innerHTML =
      '<span class="human-avatar" aria-hidden="true">YOU</span>' +
      '<span class="player-copy"><small>PLAYER</small><strong>YOU</strong><em>HUMAN PLAYER</em></span>' +
      '<span class="player-badge">YOU</span>';
  };

  setEngine(blackPlayer, blackName);
  if (whiteIsHuman) setHuman(whitePlayer);
  else setEngine(whitePlayer, whiteName);
}

function statusText() {
  if (game.isCheckmate()) return game.turn() === "w" ? "Checkmate — Marlin wins" : "Checkmate — You win!";
  if (game.isStalemate()) return "Draw — stalemate";
  if (game.isDraw()) return "Draw";
  if (thinking) return "Marlin is thinking…";
  return game.turn() === "w" ? "Your move — White" : "Marlin to move — Black";
}

function render() {
  updatePlayerIdentity();
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
      if (piece) {
        const pieceImage = document.createElement("img");
        pieceImage.className = "piece-image";
        pieceImage.src = "./pieces/cburnett/" + piece.color + piece.type.toUpperCase() + ".svg";
        pieceImage.alt = (piece.color === "w" ? "White " : "Black ") + pieceNames[piece.type];
        pieceImage.draggable = false;
        button.appendChild(pieceImage);
      }
      button.addEventListener("click", () => onSquareClick(square));
      boardEl.appendChild(button);
    }
  }

  statusEl.textContent = statusText();
  thinkingEl.textContent = thinking ? "MARLIN SEARCHING…" : engineStatus;
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
  stopSearchButton.disabled = !thinking;
}

function onSquareClick(square) {
  if (thinking || arenaRunning || game.isGameOver() || game.turn() !== "w") return;
  const piece = game.get(square);

  if (selected && legalTargets.includes(square)) {
    game.move({ from: selected, to: square, promotion: "q" });
    positionRevision++;
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

function cancelEngineRequest() {
  if (engineWorker) {
    engineWorker.terminate();
    engineWorker = null;
  }
  if (pendingEngineRequest) {
    const pending = pendingEngineRequest;
    pendingEngineRequest = null;
    pending.reject(new Error("Search cancelled"));
  }
}

function getEngineMove(depth) {
  return new Promise((resolve, reject) => {
    if (!engineWorker) {
      engineWorker = new Worker("./engine-worker.js", { type: "module" });
      engineWorker.onmessage = (event) => {
        if (!pendingEngineRequest || event.data.requestId !== pendingEngineRequest.requestId) return;
        if (event.data.type === "progress") {
          const depth = Number(event.data.depth || 0);
          const nodes = Number(event.data.nodes || 0).toLocaleString();
          const nps = Number(event.data.nps || 0).toLocaleString();
          thinkingEl.textContent = (event.data.engine === "v7" ? "MARLIN V7" : "MARLIN C++") + " · DEPTH " + depth + " · " + nodes + " NODES · " + nps + " NPS";
          return;
        }
        const pending = pendingEngineRequest;
        pendingEngineRequest = null;
        if (event.data.error) reject(new Error(event.data.error));
        else resolve(event.data);
      };
      engineWorker.onerror = (event) => {
        const pending = pendingEngineRequest;
        pendingEngineRequest = null;
        if (engineWorker) engineWorker.terminate();
        engineWorker = null;
        if (pending) pending.reject(new Error(event.message || "MARLIN worker failed"));
      };
    }

    const requestId = ++engineRequestId;
    pendingEngineRequest = { requestId, resolve, reject };
    engineWorker.postMessage({
      requestId,
      pgn: game.pgn({ maxWidth: 1000 }),
      depth
    });
  });
}

async function makeEngineMove() {
  if (thinking || game.isGameOver() || game.turn() !== "b") return;
  thinking = true;
  render();
  const requestedRevision = positionRevision;

  try {
    const selectedDepth = Number(depthEl.value);
    const result = await getEngineMove(selectedDepth);
    if (requestedRevision !== positionRevision || game.turn() !== "b" || game.isGameOver()) return;

    const candidate = result.move;
    const legalMove = game.moves({ verbose: true }).find(move =>
      move.from === candidate.from &&
      move.to === candidate.to &&
      (move.promotion || "q") === (candidate.promotion || "q")
    );
    if (!legalMove) throw new Error("MARLIN returned a move that is not legal in this position.");

    if (candidate.source === "cpp-wasm") engineStatus = "MARLIN C++ · WEBASSEMBLY · " + Number(result.nodes || 0).toLocaleString() + " NODES · " + Number(result.nps || 0).toLocaleString() + " NPS";
    else if (candidate.source === "syzygy-7-man") engineStatus = "MARLIN V7 · SYZYGY 6/7-MAN";
    else if (candidate.source === "master-book") engineStatus = "MARLIN V7 · MASTER OPENING BOOK";
    else if (candidate.source === "curated-book" || candidate.source === "opening-book") engineStatus = "MARLIN V7 · CURATED OPENING BOOK";
    else if (candidate.source === "search-fallback") engineStatus = "MARLIN V7 · SEARCH FALLBACK";
    else engineStatus = (result.nnue ? "MARLIN V7 · NNUE ACTIVE" : "MARLIN V7 · HANDCRAFTED EVAL") +
      " · " + Number(result.nodes || 0).toLocaleString() + " NODES · " +
      Number(result.nps || 0).toLocaleString() + " NPS";

    game.move({
      from: legalMove.from,
      to: legalMove.to,
      promotion: legalMove.promotion || "q"
    });
    positionRevision++;
  } catch (error) {
    if (requestedRevision === positionRevision && error.message !== "Search cancelled") {
      console.error("Marlin search error:", error);
      engineStatus = "ENGINE ERROR — " + error.message;
    }
  } finally {
    thinking = false;
    render();
  }
}

document.querySelector("#new-game").addEventListener("click", () => {
  if (arenaRunning) return;
  positionRevision++;
  cancelEngineRequest();
  game.reset();
  engineStatus = "MARLIN READY";
  selected = null;
  legalTargets = [];
  thinking = false;
  render();
});

stopSearchButton.addEventListener("click", () => {
  if (!thinking) return;
  cancelEngineRequest();
  thinking = false;
  engineStatus = "SEARCH STOPPED";
  render();
});

undoButton.addEventListener("click", () => {
  if (thinking || arenaRunning) return;
  if (game.turn() === "w" && game.history().length) game.undo();
  if (game.turn() === "b" && game.history().length) game.undo();
  positionRevision++;
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

// PGN analyser: calculate the best next move for the side to move.
const analysisInput = document.querySelector("#analysis-pgn");
const analysisButton = document.querySelector("#analyse-pgn");
const analysisDepth = document.querySelector("#analysis-depth");
const analysisResult = document.querySelector("#analysis-result");
const analysisStopButton = document.querySelector("#stop-analysis");
let activeAnalysisWorker = null;
let analysisRequestId = 0;

analysisButton.addEventListener("click", () => {
  const source = analysisInput.value.trim();
  if (!source) {
    analysisResult.textContent = "Paste a PGN first.";
    return;
  }

  const validationGame = new Chess();
  try {
    validationGame.loadPgn(source);
  } catch (error) {
    analysisResult.textContent = "Invalid PGN: " + error.message;
    return;
  }

  if (validationGame.isGameOver()) {
    analysisResult.textContent = "This PGN is already over. There is no next move.";
    return;
  }

  const side = validationGame.turn() === "w" ? "White" : "Black";
  const worker = new Worker("./engine-worker.js", { type: "module" });
  const requestId = ++analysisRequestId;
  activeAnalysisWorker = worker;
  analysisButton.disabled = true;
  analysisStopButton.disabled = false;
  analysisResult.textContent = "Marlin is analysing the position…";

  const finish = (message) => {
    analysisButton.disabled = false;
    analysisStopButton.disabled = true;
    analysisResult.textContent = message;
    worker.terminate();
    if (activeAnalysisWorker === worker) activeAnalysisWorker = null;
  };

  worker.onmessage = (event) => {
    if (event.data.requestId !== requestId) return;
    if (event.data.type === "progress") {
      const depth = Number(event.data.depth || event.data.completedDepth || 0);
      const nodes = Number(event.data.nodes || 0).toLocaleString();
      const nps = Number(event.data.nps || 0).toLocaleString();
      analysisResult.textContent = "MARLIN searching · depth " + depth + " · " + nodes + " nodes · " + nps + " NPS";
      return;
    }
    if (event.data.error) {
      finish("Analysis failed: " + event.data.error);
      return;
    }
    const move = event.data.move;
    const sourceLabel = move.source === "master-book" ? "Lichess master-game opening database" :
      move.source === "curated-book" || move.source === "opening-book" ? "curated opening book" :
      move.source === "syzygy-7-man" ? "Syzygy tablebase" :
      move.source === "search-fallback" ? "search fallback" : "V7 engine search";
    finish("Best next move for " + side + ": " + move.san +
      " (" + move.from + "–" + move.to + "). Source: " + sourceLabel + ".");
  };

  worker.onerror = (event) => finish("Analysis worker failed: " + (event.message || "unknown error"));
  worker.postMessage({
    requestId,
    pgn: source,
    depth: Number(analysisDepth.value)
  });
});

analysisStopButton.addEventListener("click", () => {
  if (!activeAnalysisWorker) return;
  activeAnalysisWorker.terminate();
  activeAnalysisWorker = null;
  analysisButton.disabled = false;
  analysisStopButton.disabled = true;
  analysisResult.textContent = "Analysis stopped.";
});

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
  const raw = game.pgn({ maxWidth: 100 });
  const v9IsWhite = lastArenaV9Color === "w";
  const whiteName = v9IsWhite ? "Marlin V9" : "Marlin V8";
  const blackName = v9IsWhite ? "Marlin V8" : "Marlin V9";
  const result = game.isCheckmate()
    ? (game.turn() === "w" ? "0-1" : "1-0")
    : (game.isDraw() || game.isStalemate() || game.history().length >= 240 ? "1/2-1/2" : "*");
  let body = raw.replace(/^\[[^\n]*\]\s*\n/gm, "").trim();
  const headers = [
    '[Event "Marlin V9 vs V8 Arena"]',
    '[Site "https://oddossosososo.github.io/Marlin/"]',
    '[Annotator "Marlin Chess Engine"]',
    '[White "' + whiteName + '"]',
    '[WhiteTitle "GM"]',
    '[Black "' + blackName + '"]',
    '[BlackTitle "GM"]',
    '[Result "' + result + '"]'
  ].join("\n");
  return headers + "\n\n" + body + "\n";
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
let lastArenaV9Color = "b";

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
  document.querySelector("#v9-wins").textContent = arenaStats.v9;
  document.querySelector("#arena-draws").textContent = arenaStats.draws;
  document.querySelector("#v8-wins").textContent = arenaStats.v8;
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

      // Progress messages keep the Arena visibly active while depth-6 search
      // is working. Only a final move or error settles this Promise.
      if (event.data.type === "progress") {
        const engineName = event.data.version === "v9" ? "MARLIN V9" : "MARLIN V8";
        const nodes = Number(event.data.nodes || 0).toLocaleString();
        const nps = Number(event.data.nps || 0).toLocaleString();
        const stage = event.data.stage || "searching";
        const progressEl = document.querySelector("#arena-progress");
        const nodesEl = document.querySelector("#arena-nodes");
        const liveEl = document.querySelector("#arena-live");

        if (liveEl) liveEl.textContent = engineName + " THINKING";
        if (progressEl) {
          if (stage === "initialising") {
            progressEl.textContent = engineName + " initialising…";
          } else if (stage === "checking-book") {
            progressEl.textContent = engineName + " checking opening book / tablebase…";
          } else if (stage === "depth-complete") {
            progressEl.textContent = engineName + " completed depth " +
              event.data.completedDepth + " / " + depth + " · " + nodes + " nodes · " + nps + " NPS";
          } else if (stage === "complete") {
            progressEl.textContent = engineName + " finished depth " +
              event.data.completedDepth + " · " + nodes + " nodes · " + nps + " NPS";
          } else {
            progressEl.textContent = engineName + " searching depth " +
              (event.data.depth || 1) + " / " + depth + " · " + nodes + " nodes · " + nps + " NPS";
          }
        }
        if (nodesEl) nodesEl.textContent = nodes + " nodes · " + nps + " NPS";
        return;
      }

      arenaPendingResolve = null;
      if (event.data.error) reject(new Error(event.data.error));
      else resolve(event.data);
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
  const v9Color = arenaMatchCount % 2 === 0 ? "b" : "w";
  lastArenaV9Color = v9Color;
  document.querySelector("#arena-progress").textContent = "V9 vs V8 — " + (v9Color === "b" ? "V9 White" : "V8 White") + " — match running";
  document.querySelector("#arena-ply").textContent = "0 plies";
  render();
  try {
    while (!game.isGameOver() && !arenaStopRequested && game.history().length < 240) {
      const v9Turn = game.turn() === v9Color;
      const result = await getArenaMove(v9Turn ? "v9" : "v8", depth);
      if (arenaStopRequested) break;
      const move = result?.move;
      if (!move) break;
      const nodesEl = document.querySelector("#arena-nodes");
      if (nodesEl) {
        if (move.source === "master-book" || move.source === "curated-book" || move.source === "opening-book") {
          nodesEl.textContent = "Opening book · 0 search nodes";
        } else if (move.source === "syzygy-7-man") {
          nodesEl.textContent = "Syzygy · tablebase move";
        } else {
          nodesEl.textContent = Number(result.nodes || 0).toLocaleString() +
            " nodes · " + Number(result.nps || 0).toLocaleString() + " NPS · " +
            Number(result.elapsedMs || 0).toLocaleString() + " ms";
        }
      }
      game.move(move);
      document.querySelector("#arena-live").textContent = "LIVE";
      render();
      document.querySelector("#arena-ply").textContent = game.history().length + " plies";
      const last = game.history({ verbose: true }).slice(-1)[0];
      document.querySelector("#arena-progress").textContent =
        (v9Turn ? "Marlin V9" : "Marlin V8") + " played " + (last?.san || move.from + "-" + move.to);
      await wait(speed);
    }
    if (game.isCheckmate()) {
      const winnerColor = game.turn() === "w" ? "b" : "w";
      const winner = winnerColor === v9Color ? "V9" : "V8";
      if (winner === "V9") arenaStats.v9++; else arenaStats.v8++;
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
