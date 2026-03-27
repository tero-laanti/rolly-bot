import { getDiceChargeMaxMultiplier, getDiceChargeStartMs } from "./game-rules";
import { minuteMs } from "../../../shared/time";

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

export const getPersonalDiceChargeMultiplier = (
  lastRollAtMs: number | null,
  {
    minutesPerMultiplier,
    maxMultiplier,
  }: {
    minutesPerMultiplier: number;
    maxMultiplier: number;
  },
  nowMs: number = Date.now(),
): number => {
  if (lastRollAtMs === null || minutesPerMultiplier <= 0 || maxMultiplier <= 1) {
    return 1;
  }

  const elapsedMs = Math.max(0, nowMs - lastRollAtMs);
  const steps = Math.floor(elapsedMs / (minutesPerMultiplier * minuteMs));
  return Math.min(maxMultiplier, Math.max(1, 1 + steps));
};

export const combineDiceChargeMultipliers = (
  globalMultiplier: number,
  personalMultiplier: number,
): number => {
  return Math.max(1, globalMultiplier + personalMultiplier - 1);
};
