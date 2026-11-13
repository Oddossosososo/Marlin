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
    const error = new Error(`Lichess API ${response.status} on ${path}: ${detail.slice(0, 300)}`);
    error.status = response.status;
    error.retryAfter = response.headers.get("retry-after");
    throw error;
  }
  return response;
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function retryDelay(error, attempt) {
  const rawRetryAfter = error?.retryAfter;
  const retrySeconds = Number(rawRetryAfter);
  const retryDate = rawRetryAfter && !Number.isFinite(retrySeconds)
    ? Date.parse(rawRetryAfter)
    : NaN;
  const retryMs = Number.isFinite(retrySeconds) && retrySeconds > 0
    ? retrySeconds * 1000
    : Number.isFinite(retryDate)
      ? retryDate - Date.now()
      : NaN;

  if (Number.isFinite(retryMs) && retryMs > 0) {
    return Math.min(30000, Math.max(1000, retryMs));
  }
  return Math.min(15000, 1000 * (2 ** Math.min(attempt - 1, 4)));
}

async function readNdjson(response, onObject) {
  if (!response.body) throw new Error("Lichess returned an empty event stream.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let streamEnded = false;

  async function processLine(line) {
    if (!line.trim()) return;
    let event;
    try {
      event = JSON.parse(line);
    } catch (error) {
      console.error("Ignoring malformed Lichess stream event:", error?.message || String(error));
      return;
    }
    // Let handler failures escape so the owning stream can reconnect.
    await onObject(event);
  }

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        streamEnded = true;
        break;
      }
      pending += decoder.decode(value, { stream: true });
      const lines = pending.split("\n");
      pending = lines.pop() || "";
      for (const line of lines) await processLine(line);
    }
    pending += decoder.decode();
    if (pending.trim()) await processLine(pending);
  } finally {
    // A handler error must close the old HTTP stream before reconnecting.
    if (!streamEnded) {
      await reader.cancel().catch(() => {});
    }
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

function moveTimeBudgetMs(state, color) {\n  const remaining = Number(color === "w" ? state?.wtime : state?.btime);\n  const increment = Number(color === "w" ? state?.winc : state?.binc) || 0;\n  if (!Number.isFinite(remaining) || remaining <= 0) return 300;\n  // 3+0 target: roughly 0.45s per move, with a little extra from increment.\n  const target = remaining / 100 + increment * 0.65;\n  return Math.max(120, Math.min(450, target, remaining * 0.10));\n}\n\nasync function makeBotMove(game, gameId, clockState) {
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
    : await searchV9(game.fen(), DEPTH, moveTimeBudgetMs(clockState, botColor));

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
      `MARLIN V9 depth ${result.depth}/${DEPTH}${result.nnue ? " · NNUE" : " · HCE"}: ${result.uci} | ${result.nodes} nodes | ${result.nps} n/s | ${result.elapsedMs.toFixed(1)} ms`
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
  let finished = false;
  let failures = 0;

  while (!finished) {
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
            console.error("Could not identify MARLIN's colour; ending game stream", gameId);
            finished = true;
            return;
          }

          initialFen = event.initialFen || "startpos";
          if (event.state?.status !== "started") {
            finished = true;
            return;
          }
          await playState(event.state);
        } else if (event.type === "gameState") {
          if (event.status !== "started") {
            finished = true;
            console.log(`Game finished: ${gameId} (${event.status || "unknown status"})`);
            return;
          }
          await playState(event);
        }
      });

      if (!finished) {
        throw new Error("Lichess closed the game stream before sending a final game state.");
      }
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        throw new Error(
          `Lichess refused game access (${error.status}). Check that LICHESS_TOKEN is valid, has the bot:play scope, and belongs to the BOT account. Original error: ${error.message}`
        );
      }
      if (error.status === 404) {
        console.log(`Game ${gameId} is no longer available; stopping its stream.`);
        finished = true;
        continue;
      }

      failures += 1;
      const delay = retryDelay(error, failures);
      console.error(
        `Game stream ${gameId} disconnected; reconnecting in ${delay} ms:`,
        error?.message || String(error)
      );
      await wait(delay);
    }
  }

  console.log(`Stopped watching Lichess game ${gameId}`);

  async function playState(state) {
    if (!state || state.status !== "started" || !botColor) return;
    const movesText = state.moves || "";
    if (movesText === lastMoves) return;

    let game;
    try {
      game = parsePosition(initialFen, movesText);
    } catch (error) {
      throw new Error("Could not rebuild Lichess position: " + (error?.message || String(error)));
    }

    if (game.turn() !== botColor || game.isGameOver()) {
      lastMoves = movesText;
      return;
    }

    lastMoves = movesText;
    try {
      await makeBotMove(game, gameId, state);
    } catch (error) {
      // Force a fresh gameFull snapshot before retrying a rejected or stale move.
      lastMoves = null;
      throw error;
    }
  }
}

async function main() {
  // Verify Lichess credentials before spending time initialising WebAssembly.
  const accountResponse = await request("/account");
  const account = await accountResponse.json();
  const botId = (account.id || USERNAME).toLowerCase();
  if (!botId) throw new Error("Could not identify the Lichess account.");

  if (account.title !== "BOT") {
    throw new Error(
      `Lichess account @${account.username || botId} is not a BOT account. The Lichess Bot API only works with BOT accounts. Use a dedicated bot account, upgrade it through Lichess's Bot Account Upgrade page, and create a token with the bot:play scope. Do not upgrade a personal playing account.`
    );
  }

  console.log(`Verified Lichess BOT account: ${account.username || botId}`);
  console.log("Initialising MARLIN V9 C++ WebAssembly…");
  await initialiseV9();

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
            handleGame(gameId, botId)
              .catch(error => console.error(`Game ${gameId} failed:`, error?.message || String(error)))
              .finally(() => activeGames.delete(gameId));
          }
        }
      });
      console.log("Lichess event stream ended; reconnecting…");
    } catch (error) {
      console.error("Lichess connection error:", error?.message || String(error));
      if (error.status === 401 || error.status === 403) {
        throw new Error(
          `Lichess rejected the event stream (${error.status}). Check the LICHESS_TOKEN secret and confirm it has bot:play scope for the BOT account. Original error: ${error.message}`
        );
      }
    }
    await wait(3000);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
