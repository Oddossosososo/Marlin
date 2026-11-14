// Clock-aware search allocation. Spend more time when the position is forcing,
// but always reserve nearly all of the remaining clock for later moves.
export function moveTimeBudgetMs(state, color, game) {
  const remaining = Number(color === "w" ? state?.wtime : state?.btime);
  const increment = Math.max(0, Number(color === "w" ? state?.winc : state?.binc) || 0);
  if (!Number.isFinite(remaining) || remaining <= 0) return 100;

  const moves = game?.moves?.({ verbose: true }) || [];
  const forcingMoves = moves.filter(move => move.captured || move.promotion).length;
  const checked = Boolean(game?.isCheck?.());
  const pieces = (game?.board?.() || []).flat().filter(Boolean).length;

  let complexity = 1;
  if (checked) complexity = 1.65;
  else if (forcingMoves >= 4) complexity = 1.4;
  else if (forcingMoves > 0) complexity = 1.2;
  if (pieces <= 10) complexity *= 1.12;

  const target = (remaining / 72 + increment * 0.9) * complexity;
  const hardCap = Math.min(2500, remaining * 0.05);
  return Math.max(1, Math.floor(Math.min(target, hardCap)));
}
