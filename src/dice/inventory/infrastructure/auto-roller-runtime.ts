import { randomUUID } from "node:crypto";
import type { Message } from "discord.js";
import type { SqliteDatabase } from "../../../shared/db";
import { createSqliteRollDiceUseCase } from "../../progression/infrastructure/sqlite/services";

const progressBarWidth = 20;
const maxHighlights = 8;

type AutoRollSession = {
  reservation: AutoRollSessionReservation;
  db: SqliteDatabase;
  message: Message;
  userMention: string;
  completedRolls: number;
  blockedRolls: number;
  interestingRolls: number;
  highlights: string[];
  timer: ReturnType<typeof setTimeout> | null;
};

export type AutoRollSessionReservation = {
  id: string;
  userId: string;
  itemName: string;
  durationSeconds: number;
  intervalSeconds: number;
  totalRolls: number;
};

const reservedSessionIdsByUserId = new Map<string, string>();
const reservationsById = new Map<string, AutoRollSessionReservation>();
const activeSessionsByUserId = new Map<string, AutoRollSession>();

export const reserveAutoRollSession = ({
  userId,
  itemName,
  durationSeconds,
  intervalSeconds,
}: {
  userId: string;
  itemName: string;
  durationSeconds: number;
  intervalSeconds: number;
}): AutoRollSessionReservation | null => {
  if (reservedSessionIdsByUserId.has(userId) || activeSessionsByUserId.has(userId)) {
    return null;
  }

  const totalRolls = Math.max(1, Math.floor(durationSeconds / intervalSeconds));
  const reservation: AutoRollSessionReservation = {
    id: `auto-roll:${randomUUID()}`,
    userId,
    itemName,
    durationSeconds,
    intervalSeconds,
    totalRolls,
  };

  reservationsById.set(reservation.id, reservation);
  reservedSessionIdsByUserId.set(userId, reservation.id);
  return reservation;
};

export const releaseAutoRollSessionReservation = (
  reservation: AutoRollSessionReservation,
): void => {
  reservationsById.delete(reservation.id);
  if (reservedSessionIdsByUserId.get(reservation.userId) === reservation.id) {
    reservedSessionIdsByUserId.delete(reservation.userId);
  }
};

export const buildAutoRollSessionStartingContent = (
  reservation: AutoRollSessionReservation,
): string => {
  return buildAutoRollContent({
    userId: reservation.userId,
    itemName: reservation.itemName,
    completedRolls: 0,
    totalRolls: reservation.totalRolls,
    durationSeconds: reservation.durationSeconds,
    blockedRolls: 0,
    interestingRolls: 0,
    highlights: [],
    isFinished: false,
  });
};

export const startReservedAutoRollSession = async (
  reservation: AutoRollSessionReservation,
  {
    db,
    message,
    userMention,
  }: {
    db: SqliteDatabase;
    message: Message;
    userMention: string;
  },
): Promise<boolean> => {
  const storedReservation = reservationsById.get(reservation.id);
  if (!storedReservation || storedReservation.userId !== reservation.userId) {
    return false;
  }

  releaseAutoRollSessionReservation(storedReservation);

  const session: AutoRollSession = {
    reservation: storedReservation,
    db,
    message,
    userMention,
    completedRolls: 0,
    blockedRolls: 0,
    interestingRolls: 0,
    highlights: [],
    timer: null,
  };

  activeSessionsByUserId.set(storedReservation.userId, session);
  scheduleNextTick(session);
  return true;
};

const scheduleNextTick = (session: AutoRollSession): void => {
  session.timer = setTimeout(() => {
    void runAutoRollTick(session);
  }, session.reservation.intervalSeconds * 1_000);
};

const runAutoRollTick = async (session: AutoRollSession): Promise<void> => {
  if (!activeSessionsByUserId.has(session.reservation.userId)) {
    return;
  }

  const rollIndex = session.completedRolls + 1;
  const runRollDiceUseCase = createSqliteRollDiceUseCase(session.db);
  const result = runRollDiceUseCase({
    userId: session.reservation.userId,
    userMention: session.userMention,
  });
  const classification = result.autoRollClassification;

  session.completedRolls = rollIndex;
  if (classification.kind === "blocked") {
    session.blockedRolls += 1;
    pushHighlight(session.highlights, `Roll ${rollIndex}: ${classification.summary}`);
  } else if (classification.kind === "interesting") {
    session.interestingRolls += 1;
    pushHighlight(session.highlights, `Roll ${rollIndex}: ${classification.summary}`);
  }

  if (session.completedRolls >= session.reservation.totalRolls) {
    await finishSession(session);
    return;
  }

  const didUpdate = await updateSessionMessage(session, false);
  if (!didUpdate) {
    stopSession(session);
    return;
  }

  scheduleNextTick(session);
};

const finishSession = async (session: AutoRollSession): Promise<void> => {
  await updateSessionMessage(session, true);
  stopSession(session);
};

const stopSession = (session: AutoRollSession): void => {
  if (session.timer) {
    clearTimeout(session.timer);
    session.timer = null;
  }

  activeSessionsByUserId.delete(session.reservation.userId);
};

const updateSessionMessage = async (
  session: AutoRollSession,
  isFinished: boolean,
): Promise<boolean> => {
  try {
    await session.message.edit({
      content: buildAutoRollContent({
        userId: session.reservation.userId,
        itemName: session.reservation.itemName,
        completedRolls: session.completedRolls,
        totalRolls: session.reservation.totalRolls,
        durationSeconds: session.reservation.durationSeconds,
        blockedRolls: session.blockedRolls,
        interestingRolls: session.interestingRolls,
        highlights: session.highlights,
        isFinished,
      }),
      components: [],
    });

    return true;
  } catch {
    return false;
  }
};

const buildAutoRollContent = ({
  userId,
  itemName,
  completedRolls,
  totalRolls,
  durationSeconds,
  blockedRolls,
  interestingRolls,
  highlights,
  isFinished,
}: {
  userId: string;
  itemName: string;
  completedRolls: number;
  totalRolls: number;
  durationSeconds: number;
  blockedRolls: number;
  interestingRolls: number;
  highlights: string[];
  isFinished: boolean;
}): string => {
  const elapsedSeconds =
    totalRolls > 0 ? Math.floor((completedRolls / totalRolls) * durationSeconds) : 0;
  const lines = [
    `${itemName} ${isFinished ? "finished" : "running"} for <@${userId}>.`,
    buildProgressBar(completedRolls, totalRolls),
    `Rolls: ${completedRolls}/${totalRolls}.`,
    `Elapsed: ${formatDuration(elapsedSeconds)} / ${formatDuration(durationSeconds)}.`,
    `Interesting rolls: ${interestingRolls}.`,
    `Blocked rolls: ${blockedRolls}.`,
    "",
    highlights.length > 0 ? "Highlights:" : "No notable rolls yet.",
  ];

  if (highlights.length > 0) {
    lines.push(...highlights.map((highlight) => `- ${highlight}`));
  }

  if (isFinished) {
    lines.push("", "Use /dice-inventory to start another item.");
  }

  return lines.join("\n");
};

const buildProgressBar = (completed: number, total: number): string => {
  const clampedTotal = Math.max(1, total);
  const filledWidth = Math.round((Math.max(0, completed) / clampedTotal) * progressBarWidth);
  const emptyWidth = Math.max(0, progressBarWidth - filledWidth);
  return `[${"#".repeat(filledWidth)}${"-".repeat(emptyWidth)}]`;
};

const formatDuration = (totalSeconds: number): string => {
  const normalizedSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(normalizedSeconds / 60);
  const seconds = normalizedSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

const pushHighlight = (highlights: string[], line: string): void => {
  highlights.push(line);
  if (highlights.length > maxHighlights) {
    highlights.splice(0, highlights.length - maxHighlights);
  }
};
