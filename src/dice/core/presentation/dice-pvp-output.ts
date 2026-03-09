import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import {
  dicePvpOpenOpponentId,
  type DicePvpChallenge,
  type DicePvpChallengeCreateResult,
} from "../domain/pvp";
import {
  getDicePvpDieLabel,
  getDuelPunishmentMs,
  getDuelRewardMs,
} from "../domain/game-rules";

const tierButtonsPerRow = 4;
const openChallengeButtonToken = "any";
export const dicePvpButtonPrefix = "dice-pvp:";

export const decodeDicePvpOpponentToken = (opponentToken: string): string => {
  return opponentToken === openChallengeButtonToken ? dicePvpOpenOpponentId : opponentToken;
};

export const buildSetupContent = (opponentId: string | null): string => {
  const targetLine =
    opponentId === null
      ? "Set up an open challenge (any eligible player can accept)."
      : `Set up your challenge against <@${opponentId}>.`;
  const lines = [targetLine, "Pick a duel die (higher dice require higher prestige)."];

  return lines.join("\n");
};

export const buildTierSelectionComponents = (
  ownerId: string,
  opponentId: string | null,
  maxTier: number,
): ActionRowBuilder<ButtonBuilder>[] => {
  const buttons = Array.from({ length: maxTier }, (_, index) => {
    const tier = index + 1;
    return new ButtonBuilder()
      .setCustomId(buildTierButtonId(ownerId, opponentId, tier))
      .setLabel(getDicePvpDieLabel(tier))
      .setStyle(ButtonStyle.Primary);
  });

  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < buttons.length; i += tierButtonsPerRow) {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...buttons.slice(i, i + tierButtonsPerRow),
      ),
    );
  }

  return rows;
};

const buildTierButtonId = (ownerId: string, opponentId: string | null, tier: number): string => {
  const encodedOpponentId = opponentId ?? openChallengeButtonToken;
  return `${dicePvpButtonPrefix}pick:${ownerId}:${encodedOpponentId}:${tier}`;
};

export const buildChallengeActionRow = (
  challengeId: string,
  isOpenChallenge: boolean,
): ActionRowBuilder<ButtonBuilder> => {
  const buttons: ButtonBuilder[] = [
    new ButtonBuilder()
      .setCustomId(`${dicePvpButtonPrefix}accept:${challengeId}`)
      .setLabel("Accept")
      .setStyle(ButtonStyle.Success),
  ];
  if (isOpenChallenge) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`${dicePvpButtonPrefix}decline:${challengeId}`)
        .setLabel("Cancel")
        .setStyle(ButtonStyle.Secondary),
    );
  } else {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`${dicePvpButtonPrefix}decline:${challengeId}`)
        .setLabel("Decline")
        .setStyle(ButtonStyle.Secondary),
    );
  }

  return new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons);
};

export const buildChallengeContent = (
  challengerId: string,
  opponentId: string,
  duelTier: number,
  expiresAtMs: number,
): string => {
  const openChallenge = opponentId === dicePvpOpenOpponentId;
  const duelDieLabel = getDicePvpDieLabel(duelTier);
  const title = openChallenge
    ? `<@${challengerId}> has opened a duel challenge.`
    : `<@${challengerId}> has challenged <@${opponentId}> to a duel.`;

  return [
    title,
    `Duel die: ${duelDieLabel}.`,
    "",
    openChallenge
      ? `Anyone can accept if they have ${duelDieLabel} unlocked.`
      : `<@${opponentId}> can accept if they have ${duelDieLabel} unlocked.`,
    `Challenge expires ${formatRelativeTime(expiresAtMs)}.`,
    `Loser lockout: ${formatMinutesOrHours(getDuelPunishmentMs(duelTier))}.`,
    `Winner buff: ${formatMinutesOrHours(getDuelRewardMs(duelTier))} of double buff on /dice.`,
  ].join("\n");
};

export const buildDrawResultContent = (
  challenge: DicePvpChallenge,
  challengerRoll: number,
  opponentRoll: number,
  duelDieSides: number,
): string => {
  return [
    "Duel ended in a draw.",
    `Duel die: D${duelDieSides}.`,
    `<@${challenge.challengerId}> rolled ${challengerRoll}.`,
    `<@${challenge.opponentId}> rolled ${opponentRoll}.`,
    "No effects were applied.",
  ].join("\n");
};

export const buildWinResultContent = (
  challenge: DicePvpChallenge,
  challengerRoll: number,
  opponentRoll: number,
  duelDieSides: number,
  winnerId: string,
  loserId: string,
  winnerDoubleRollUntilMs: number,
  loserLockoutUntilMs: number,
): string => {
  return [
    "Duel complete.",
    `Duel die: D${duelDieSides}.`,
    `<@${challenge.challengerId}> rolled ${challengerRoll}.`,
    `<@${challenge.opponentId}> rolled ${opponentRoll}.`,
    `<@${winnerId}> is the winner.`,
    `<@${loserId}> can play again ${formatRelativeTime(loserLockoutUntilMs)}.`,
    `<@${winnerId}> has double buff on /dice. Their dice rolls are now doubled until ${formatRelativeTime(winnerDoubleRollUntilMs)}.`,
  ].join("\n");
};

export const buildLockoutCancellationContent = (
  lockedUserId: string,
  lockoutUntil: number,
): string => {
  return `Challenge cancelled because <@${lockedUserId}> is currently locked out and can play again ${formatRelativeTime(lockoutUntil)}.`;
};

export const buildPendingConflictContent = (
  createResult: Exclude<DicePvpChallengeCreateResult, { created: true }>,
  challengerId: string,
  opponentId: string,
): string => {
  const expiresAt = formatChallengeExpiry(createResult.challenge.expiresAt);

  if (createResult.conflict === "challenger-has-pending") {
    const otherId = getOtherParticipantId(createResult.challenge, challengerId);
    return `You already have a pending challenge involving ${formatChallengeUserLabel(otherId)} that expires ${expiresAt}.`;
  }

  if (opponentId === dicePvpOpenOpponentId) {
    return `You cannot create an open challenge because another player already has a pending challenge that expires ${expiresAt}.`;
  }

  const otherId = getOtherParticipantId(createResult.challenge, opponentId);
  return `<@${opponentId}> already has a pending challenge involving ${formatChallengeUserLabel(otherId)} that expires ${expiresAt}.`;
};

const getOtherParticipantId = (challenge: DicePvpChallenge, userId: string): string => {
  return challenge.challengerId === userId ? challenge.opponentId : challenge.challengerId;
};

const formatChallengeExpiry = (expiresAt: string): string => {
  const expiresAtMs = Date.parse(expiresAt);
  if (Number.isNaN(expiresAtMs)) {
    return "soon";
  }

  return formatRelativeTime(expiresAtMs);
};

export const buildExpiredChallengeContent = (challenge: DicePvpChallenge): string => {
  if (challenge.opponentId === dicePvpOpenOpponentId) {
    return `The open challenge from <@${challenge.challengerId}> has expired.`;
  }

  return `The challenge between <@${challenge.challengerId}> and <@${challenge.opponentId}> has expired.`;
};

export const buildDeclinedChallengeContent = (challenge: DicePvpChallenge): string => {
  return challenge.opponentId === dicePvpOpenOpponentId
    ? `<@${challenge.challengerId}> cancelled their open challenge.`
    : `<@${challenge.opponentId}> declined <@${challenge.challengerId}>'s challenge.`;
};

const formatChallengeUserLabel = (userId: string): string => {
  if (userId === dicePvpOpenOpponentId) {
    return "anyone";
  }

  return `<@${userId}>`;
};

export const formatRelativeTime = (timestampMs: number): string => {
  return `<t:${Math.floor(timestampMs / 1000)}:R>`;
};

const formatMinutesOrHours = (durationMs: number): string => {
  const minutes = Math.floor(durationMs / 60_000);
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours}h`;
  }

  return `${minutes}m`;
};
