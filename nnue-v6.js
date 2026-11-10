// MARLIN V6 NNUE loader. Loads the V6-trained weights once per page/worker.
let network = null;
let loading = null;

export async function loadNnueWeights(url = "./nnue/marlin-v6.nnue.json") {
  if (network) return network.training || {};
  if (!loading) {
    loading = (async () => {
      const response = await fetch(url, { cache: "no-cache" });
      if (!response.ok) throw new Error("V6 NNUE weights unavailable: " + response.status);
      const candidate = await response.json();
      if (candidate.format !== "MARLIN_NNUE_V1" ||
          candidate.feature_encoding !== "stm-relative-piece-square-v1" ||
          candidate.architecture !== "768x128x32x1") {
        throw new Error("Incompatible MARLIN V6 NNUE weights");
      }
      const w = candidate.weights;
      if (!w || w.fc1_w?.length !== 768 || w.fc1_w.some(row => row.length !== 128) ||
          w.fc2_w?.length !== 128 || w.fc2_w.some(row => row.length !== 32) ||
          w.out_w?.length !== 32) throw new Error("Malformed MARLIN V6 NNUE weights");
      network = candidate;
      return candidate.training || {};
    })().catch(error => { loading = null; throw error; });
  }
  return loading;
}
export function hasNnueWeights() { return network !== null; }
export function evaluateNnue(game) {
  if (!network) return null;
  const board = game.board(), side = game.turn(), active = [];
  const typeIndex = { p:0, n:1, b:2, r:3, q:4, k:5 };
  for (let r=0; r<8; r++) for (let c=0; c<8; c++) {
    const p=board[r][c]; if (!p) continue;
    const colour=p.color===side?0:1, square=(7-r)*8+c;
    active.push(colour*384+typeIndex[p.type]*64+square);
  }
  const w=network.weights, h1=w.fc1_b.slice();
  for (const f of active) { const row=w.fc1_w[f]; for(let j=0;j<h1.length;j++)h1[j]+=row[j]; }
  for(let j=0;j<h1.length;j++)h1[j]=Math.max(0,h1[j]);
  const h2=w.fc2_b.slice();
  for(let i=0;i<h1.length;i++){const v=h1[i];if(!v)continue;const row=w.fc2_w[i];for(let j=0;j<h2.length;j++)h2[j]+=v*row[j];}
  let out=w.out_b;
  for(let i=0;i<h2.length;i++)out+=Math.max(0,h2[i])*w.out_w[i];
  return Math.round(out*800);
}
