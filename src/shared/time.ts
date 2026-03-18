export const secondMs = 1_000;
export const minuteMs = 60 * secondMs;
export const hourMs = 60 * minuteMs;
export const dayMs = 24 * hourMs;
export const secondsPerMinute = 60;
export const secondsPerHour = 60 * secondsPerMinute;
export const secondsPerDay = 24 * secondsPerHour;

export const minutesToMs = (minutes: number): number => {
  return minutes * minuteMs;
};

export const secondsToMs = (seconds: number): number => {
  return seconds * secondMs;
};

export const durationMsToWholeSeconds = (durationMs: number): number => {
  return Math.max(0, Math.floor(durationMs / secondMs));
};
