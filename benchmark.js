const runButton = document.querySelector("#bench-run");
const resetButton = document.querySelector("#bench-reset");
const statusEl = document.querySelector("#bench-status");
const resultsEl = document.querySelector("#bench-results");
const winnerEl = document.querySelector("#bench-winner");
const ratioEl = document.querySelector("#bench-ratio");
const depthResultEl = document.querySelector("#bench-tested-depth");
let worker = null;

function setBusy(busy) {
  runButton.disabled = busy;
  resetButton.disabled = busy;
  runButton.textContent = busy ? "Benchmark running…" : "Run benchmark";
}
function clearResults() {
  resultsEl.innerHTML = '<tr><td colspan="6" class="bench-muted">No benchmark run yet.</td></tr>';
  winnerEl.textContent = "—";
  ratioEl.textContent = "—";
  depthResultEl.textContent = "—";
}
runButton.addEventListener("click", () => {
  if (worker) worker.terminate();
  const depth = Number(document.querySelector("#bench-depth").value);
  worker = new Worker("./benchmark-worker.js", { type: "module" });
  setBusy(true);
  statusEl.textContent = "Loading engines and warming up…";
  clearResults();
  worker.onmessage = ({ data }) => {
    if (data.type === "status") {
      statusEl.textContent = data.message;
      return;
    }
    if (data.type === "error") {
      statusEl.textContent = "Benchmark failed: " + data.message;
      setBusy(false);
      worker.terminate();
      worker = null;
      return;
    }
    if (data.type === "complete") {
      const rows = data.results;
      resultsEl.innerHTML = rows.map(row => '<tr><td>' + row.position + '</td><td>' + row.v8.ms.toFixed(1) + ' ms</td><td>' + row.v9.ms.toFixed(1) + ' ms</td><td>' + row.v8.nps.toLocaleString() + '</td><td>' + row.v9.nps.toLocaleString() + '</td><td>' + row.faster + '</td></tr>').join("");
      winnerEl.textContent = data.summary.winner;
      ratioEl.textContent = data.summary.ratio + "×";
      depthResultEl.textContent = "Depth " + depth;
      statusEl.textContent = "Finished " + rows.length + " positions. Run again to check consistency.";
      setBusy(false);
      worker.terminate();
      worker = null;
    }
  };
  worker.onerror = event => {
    statusEl.textContent = "Worker error: " + (event.message || "Unknown error");
    setBusy(false);
    worker?.terminate();
    worker = null;
  };
  worker.postMessage({ depth });
});
resetButton.addEventListener("click", clearResults);
