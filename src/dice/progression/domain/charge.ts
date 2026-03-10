import { getDiceChargeMaxMultiplier, getDiceChargeStartMs } from "./game-rules";

const minuteMs = 60_000;

export const getDiceChargeMultiplier = (
  lastRollAtMs: number | null,
  nowMs: number = Date.now(),
): number => {
  if (lastRollAtMs === null) {
    return 1;
  }

  const elapsedMs = Math.max(0, nowMs - lastRollAtMs);
  const diceChargeStartMs = getDiceChargeStartMs();
  if (elapsedMs < diceChargeStartMs + minuteMs) {
    return 1;
  }

  const elapsedChargeMinutes = Math.floor((elapsedMs - diceChargeStartMs) / minuteMs);
  return Math.min(getDiceChargeMaxMultiplier(), Math.max(1, elapsedChargeMinutes));
};
