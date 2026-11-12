import { Chess } from "https://esm.sh/chess.js@1.4.0";

const loaders = {
  v1: () => import("./engine-v1.js"),
  v2: () => import("./engine-v2.js"),
  v4: () => import("./engine-v4.js"),
  v5: () => import("./engine-v5.js"),
  v6: () => import("./engine-v6.js"),
  v7: () => import("./engine-v7.js"),
  v8: () => import("./engine-v8.js"),
  v9: () => import("./marlin-v9.js")
};

export async function findChampionMove(fen, depth = 6) {
  const response = await fetch(new URL("./champion.json", import.meta.url), { cache: "no-store" });
  if (!response.ok) throw new Error("MARLIN champion configuration unavailable");
  const config = await response.json();
  const id = config.engineVersion;
  const load = loaders[id];
  if (!load) throw new Error("Unsupported MARLIN champion: " + id);
  const engine = await load();
  if (id === "v9") return engine.searchV9(fen, depth);
  const init = engine["initialise" + id.toUpperCase()];
  if (typeof init === "function") await init();
  const game = new Chess(fen);
  const move = await engine.findBestMove(game, depth);
  if (!move) throw new Error("MARLIN " + id + " found no move");
  return move;
}
