import { Chess } from "chess.js";
import { findBestMove, initialiseV8 } from "./engine-v8.js";

const TOKEN = process.env.LICHESS_TOKEN;
const USERNAME = (process.env.LICHESS_USERNAME || "").toLowerCase();
const DEPTH = Math.max(1, Math.min(10, Number(process.env.MARLIN_DEPTH) || 4));
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
  if (!response.body) throw new Error("Lichess returned an empty stream.");
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
        try { await onObject(JSON.parse(line)); }
        catch (error) { console.error("Stream event error:", error.message); }
      }
    }
    pending += decoder.decode();
    if (pending.trim()) {
      try { await onObject(JSON.parse(pending)); }
      catch (error) { console.error("Final stream event error:", error.message); }
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
    game.move({
      from: match[1],
      to: match[2],
      ...(match[3] ? { promotion: match[3] } : {})
    });
  }
  return game;
}

async function handleGame(gameId, botId) {
  console.log(`Watching Lichess game ${gameId}`);
  let lastMoves = null;
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
        await playState(event.state, event.initialFen || "startpos");
      } else if (event.type === "gameState") {
        await playState(event, null);
      }
    });

    console.log(`Game stream ended: ${gameId}`);
  } catch (error) {
    console.error(`Game ${gameId} stopped:`, error.message);
  }

  async function playState(state, initialFen) {
    if (!state || state.status !== "started" || !botColor) return;
    const movesText = state.moves || "";
    if (movesText === lastMoves) return;

    // The first gameFull event supplies the initial position. Later states
    // use the same starting position, cached below.
    if (initialFen) playState.initialFen = initialFen;
    const startFen = playState.initialFen || "startpos";
    let game;
    try {
      game = parsePosition(startFen, movesText);
    } catch (error) {
      console.error("Could not rebuild game position:", error.message);
      return;
    }

    if (game.turn() !== botColor || game.isGameOver()) {
      lastMoves = movesText;
      return;
    }

    lastMoves = movesText;
    const result = findBestMove(game, DEPTH);
    if (!result) return;

    const uci = result.from + result.to + (result.promotion || "");
    console.log(`MARLIN V8 depth ${result.depth}: ${uci} | ${result.nodes} nodes | ${result.nps} n/s`);

    try {
      await request(`/bot/game/${encodeURIComponent(gameId)}/move/${encodeURIComponent(uci)}`, {
        method: "POST",
        headers: { Accept: "application/json" }
      });
    } catch (error) {
      // A stale state can occur if the opponent moves while the engine thinks.
      // The next gameState event will rebuild the current position and retry.
      lastMoves = null;
      console.error("Move was not accepted; waiting for next state:", error.message);
    }
  }
}

async function main() {
  const accountResponse = await request("/account");
  const account = await accountResponse.json();
  const botId = (account.id || USERNAME).toLowerCase();
  if (!botId) throw new Error("Could not identify the Lichess account.");

  console.log(`Connected to Lichess as ${account.username || botId}`);
  console.log(`MARLIN V8 ready at depth ${DEPTH}. Accepting all standard-chess challenges (rated/casual, clock/correspondence/unlimited).`);
  await initialiseV8();

  const activeGames = new Set();
  while (true) {
    try {
      const response = await request("/stream/event", {
        headers: { Accept: "application/x-ndjson" }
      });

      await readNdjson(response, async event => {
        if (event.type === "challenge" && event.challenge) {
          const challenge = event.challenge;
          // chess.js and MARLIN's current move logic support standard chess only.
          // Accept rated and casual games, with any standard time control.
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
              .catch(error => console.error("Could not decline challenge:", error.message));
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
      console.log("Lichess event stream ended; reconnecting...");
    } catch (error) {
      console.error("Lichess connection error:", error.message);
    }
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
