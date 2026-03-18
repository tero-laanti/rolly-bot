import { durationMsToWholeSeconds, secondsPerDay, secondsPerHour, secondsPerMinute } from "./time";

export const formatUnit = (value: number, unit: string): string => {
  return `${value} ${unit}${value === 1 ? "" : "s"}`;
};

export const formatDurationWords = (
  durationMs: number,
  { includeDays = false }: { includeDays?: boolean } = {},
): string => {
  const totalSeconds = durationMsToWholeSeconds(durationMs);
  const days = Math.floor(totalSeconds / secondsPerDay);
  const hours = Math.floor((totalSeconds % secondsPerDay) / secondsPerHour);
  const minutes = Math.floor((totalSeconds % secondsPerHour) / secondsPerMinute);
  const seconds = totalSeconds % 60;

  if (includeDays && days > 0) {
    return `${formatUnit(days, "day")} ${formatUnit(hours, "hour")} ${formatUnit(minutes, "minute")}`;
  }

  const totalHours = includeDays ? hours : Math.floor(totalSeconds / secondsPerHour);
  if (totalHours > 0) {
    return `${formatUnit(totalHours, "hour")} ${formatUnit(minutes, "minute")} ${formatUnit(seconds, "second")}`;
  }

  if (minutes > 0) {
    return `${formatUnit(minutes, "minute")} ${formatUnit(seconds, "second")}`;
  }

  return formatUnit(seconds, "second");
};

export const formatClockDuration = (totalSeconds: number): string => {
  const normalizedSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(normalizedSeconds / 60);
  const seconds = normalizedSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

export const truncateWithSuffix = (value: string, maxLength: number, suffix: string): string => {
  if (maxLength < 1) {
    return "";
  }

  if (value.length <= maxLength) {
    return value;
  }

  if (suffix.length >= maxLength) {
    return suffix.slice(0, maxLength);
  }

  return `${value.slice(0, maxLength - suffix.length)}${suffix}`;
};
