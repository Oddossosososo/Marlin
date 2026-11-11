import { Chess } from "chess.js";
import { searchV9, initialiseV9, v9NnueStatus } from "./marlin-v9.js";
import { initialiseV9OpeningBook, selectV9OpeningMove } from "./opening-book-v9.js";

const TOKEN = process.env.LICHESS_TOKEN;
const USERNAME = (process.env.LICHESS_USERNAME || "").toLowerCase();
const DEPTH = Math.max(1, Math.min(12, Number(process.env.MARLIN_DEPTH) || 4));
const API = "https://lichess.org/api";
const headers = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: "application/json"
};

if (!TOKEN) {
  console.error("Missing LICHESS_TOKEN. Add it as a GitHub Actions secret.");
  process.exit(1);
}

async function request(path, options = {}) {
  const response = await fetch(API + path, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) }
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Lichess API ${response.status} on ${path}: ${detail.slice(0, 300)}`);
  }
  return response;
}

async function readNdjson(response, onObject) {
  if (!response.body) throw new Error("Lichess returned an empty event stream.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      const lines = pending.split("\n");
      pending = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          await onObject(JSON.parse(line));
        } catch (error) {
          console.error("Lichess stream event error:", error?.message || String(error));
        }
      }
    }
    pending += decoder.decode();
    if (pending.trim()) {
      try {
        await onObject(JSON.parse(pending));
      } catch (error) {
        console.error("Final Lichess event error:", error?.message || String(error));
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function parsePosition(initialFen, uciMoves) {
  const game = initialFen && initialFen !== "startpos"
    ? new Chess(initialFen)
    : new Chess();

  for (const uci of (uciMoves || "").trim().split(/\s+/).filter(Boolean)) {
    const match = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(uci);
    if (!match) throw new Error("Unsupported UCI move from Lichess: " + uci);

    const move = game.move({
      from: match[1],
      to: match[2],
      ...(match[3] ? { promotion: match[3] } : {})
    });
    if (!move) throw new Error("Lichess supplied an illegal move: " + uci);
  }
  return game;
}

async function makeBotMove(game, gameId) {
  if (game.isGameOver()) return;

  const bookMove = selectV9OpeningMove(game);
  const result = bookMove
    ? {
        from: bookMove.from,
        to: bookMove.to,
        promotion: bookMove.promotion || null,
        uci: bookMove.from + bookMove.to + (bookMove.promotion || ""),
        source: bookMove.source,
        bookGames: bookMove.bookGames || 0,
        depth: 0,
        nodes: 0,
        nps: 0,
        elapsedMs: 0
      }
    : await searchV9(game.fen(), DEPTH);

  const legalMove = game.moves({ verbose: true }).find(move =>
    move.from === result.from &&
    move.to === result.to &&
    (move.promotion || null) === (result.promotion || null)
  );

  if (!legalMove) {
    throw new Error("V9 returned a move that is not legal in the current Lichess position: " + result.uci);
  }

  if (result.source === "gm-opening-book" || result.source === "curated-opening-book") {
    console.log(`MARLIN V9 ${result.source}: ${result.uci} | ${result.bookGames || 0} master games`);
  } else {
    console.log(
      `MARLIN V9 depth ${result.depth}${result.nnue ? " · NNUE" : " · HCE"}: ${result.uci} | ${result.nodes} nodes | ${result.nps} n/s | ${result.elapsedMs.toFixed(1)} ms`
    );
  }

  await request(`/bot/game/${encodeURIComponent(gameId)}/move/${encodeURIComponent(result.uci)}`, {
    method: "POST",
    headers: { Accept: "application/json" }
  });
}

async function handleGame(gameId, botId) {
  console.log(`Watching Lichess game ${gameId} with MARLIN V9`);
  let lastMoves = null;
  let initialFen = "startpos";
  let botColor = null;

  try {
    const response = await request(`/bot/game/stream/${encodeURIComponent(gameId)}`, {
      headers: { Accept: "application/x-ndjson" }
    });

    await readNdjson(response, async event => {
      if (event.type === "gameFull") {
        const whiteId = (event.white?.id || "").toLowerCase();
        const blackId = (event.black?.id || "").toLowerCase();
        botColor = whiteId === botId ? "w" : blackId === botId ? "b" : null;

        if (!botColor && USERNAME) {
          botColor = whiteId === USERNAME ? "w" : blackId === USERNAME ? "b" : null;
        }
        if (!botColor) {
          console.error("Could not identify MARLIN's colour; skipping game", gameId);
          return;
        }

        initialFen = event.initialFen || "startpos";
        await playState(event.state);
      } else if (event.type === "gameState") {
        await playState(event);
      }
    });

    console.log(`Game stream ended: ${gameId}`);
  } catch (error) {
    console.error(`Game ${gameId} stopped:`, error?.message || String(error));
  }

  async function playState(state) {
    if (!state || state.status !== "started" || !botColor) return;
    const movesText = state.moves || "";
    if (movesText === lastMoves) return;

    let game;
    try {
      game = parsePosition(initialFen, movesText);
    } catch (error) {
      console.error("Could not rebuild Lichess position:", error?.message || String(error));
      return;
    }

    if (game.turn() !== botColor || game.isGameOver()) {
      lastMoves = movesText;
      return;
    }

    lastMoves = movesText;
    try {
      await makeBotMove(game, gameId);
    } catch (error) {
      // Rebuild and retry from the next gameState if the opponent moved while
      // V9 was searching, or if Lichess rejected a stale move.
      lastMoves = null;
      console.error("V9 move was not accepted; waiting for the next game state:", error?.message || String(error));
    }
  }
}

async function main() {
  console.log("Initialising MARLIN V9 C++ WebAssembly…");
  await initialiseV9();

  const accountResponse = await request("/account");
  const account = await accountResponse.json();
  const botId = (account.id || USERNAME).toLowerCase();
  if (!botId) throw new Error("Could not identify the Lichess account.");

  console.log(`Connected to Lichess as ${account.username || botId}`);
  const bookInfo = await initialiseV9OpeningBook();
  const nnueInfo = v9NnueStatus();
  console.log(`MARLIN V9 ready at depth ${DEPTH}. NNUE: ${nnueInfo.enabled ? "enabled" : "handcrafted fallback"}. GM book positions: ${bookInfo.positions || 0}.`);
  console.log("Accepting standard-chess challenges.");

  const activeGames = new Set();
  while (true) {
    try {
      const response = await request("/stream/event", {
        headers: { Accept: "application/x-ndjson" }
      });

      await readNdjson(response, async event => {
        if (event.type === "challenge" && event.challenge) {
          const challenge = event.challenge;
          // V9 currently handles standard chess only.
          const valid = challenge.variant?.key === "standard";

          if (valid) {
            console.log(
              `Accepting standard challenge (${challenge.rated ? "rated" : "casual"}, ${challenge.timeControl?.type || "unknown"}):`,
              challenge.id
            );
            await request(`/challenge/${encodeURIComponent(challenge.id)}/accept`, { method: "POST" });
          } else {
            console.log("Declining unsupported variant:", challenge.variant?.key || "unknown", challenge.id);
            await request(`/challenge/${encodeURIComponent(challenge.id)}/decline`, { method: "POST" })
              .catch(error => console.error("Could not decline challenge:", error?.message || String(error)));
          }
        }

        if (event.type === "gameStart" && event.game?.id) {
          const gameId = event.game.id;
          if (!activeGames.has(gameId)) {
            activeGames.add(gameId);
            handleGame(gameId, botId).finally(() => activeGames.delete(gameId));
          }
        }
      });
      console.log("Lichess event stream ended; reconnecting…");
    } catch (error) {
      console.error("Lichess connection error:", error?.message || String(error));
    }
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
