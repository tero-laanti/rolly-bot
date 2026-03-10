import { randomUUID } from "node:crypto";
import type { ActionResult, ActionView } from "../../../../shared-kernel/application/action-view";
import type { UnitOfWork } from "../../../../shared-kernel/application/unit-of-work";
import type { DiceAnalyticsRepository } from "../../../analytics/application/ports";
import {
  getDicePvpDieLabel,
  getDuelPunishmentMs,
  getDuelRewardMs,
  getUnlockedDicePvpTierFromPrestige,
} from "../../../pvp/domain/game-rules";
import type { DiceHostileEffectsService } from "../../../progression/application/hostile-effects-service";
import type { DiceProgressionRepository } from "../../../progression/application/ports";
import {
  dicePvpOpenOpponentId,
  getDicePvpChallengeExpireMs,
  getDicePvpDieSidesForTier,
  isDicePvpChallengeExpired,
  type DicePvpChallenge,
  type DicePvpChallengeCreateResult,
} from "../../../pvp/domain/pvp";
import type { DicePvpRepository } from "../ports";

export type DicePvpAction =
  | {
      type: "pick";
      ownerId: string;
      opponentId: string | null;
      duelTier: number;
    }
  | {
      type: "accept";
      challengeId: string;
    }
  | {
      type: "decline";
      challengeId: string;
    };

export type DicePvpResult = ActionResult<DicePvpAction>;

type PublishChallenge = (view: ActionView<DicePvpAction>) => Promise<{ url: string }>;

type ManageChallengeDependencies = {
  analytics: Pick<DiceAnalyticsRepository, "updateDicePvpStats">;
  hostileEffects: Pick<DiceHostileEffectsService, "applyShieldableNegativeLockout">;
  progression: Pick<DiceProgressionRepository, "getDicePrestige">;
  pvp: Pick<
    DicePvpRepository,
    | "createDicePvpChallengeIfUsersAvailable"
    | "getActiveDiceLockout"
    | "getDicePvpChallenge"
    | "getDicePvpEffects"
    | "setDicePvpChallengeOpponentFromOpen"
    | "setDicePvpChallengeStatusFromPending"
    | "setDicePvpEffects"
  >;
  unitOfWork: UnitOfWork;
};

export const createDicePvpUseCase = ({
  analytics,
  hostileEffects,
  progression,
  pvp,
  unitOfWork,
}: ManageChallengeDependencies) => {
  const createDicePvpSetupReply = (
    challengerId: string,
    opponent: { id: string; bot: boolean } | null,
    nowMs: number = Date.now(),
  ): DicePvpResult => {
    const lockoutUntil = pvp.getActiveDiceLockout(challengerId, nowMs);
    if (lockoutUntil) {
      return replyMessage(`You can play again ${formatRelativeTime(lockoutUntil)}.`, true);
    }

    if (opponent) {
      if (opponent.id === challengerId) {
        return replyMessage("Select another user. You cannot challenge yourself.", true);
      }

      if (opponent.bot) {
        return replyMessage("You can only challenge human players.", true);
      }
    }

    const maxTier = getUnlockedDicePvpTierFromPrestige(progression.getDicePrestige(challengerId));
    return {
      kind: "reply",
      payload: {
        type: "view",
        view: buildSetupView(challengerId, opponent?.id ?? null, maxTier),
        ephemeral: true,
      },
    };
  };

  const handleDicePvpAction = async (
    actorId: string,
    action: DicePvpAction,
    publishChallenge: PublishChallenge | null,
    nowMs: number = Date.now(),
  ): Promise<DicePvpResult> => {
    if (action.type === "pick") {
      return handleTierPick({
        analytics,
        hostileEffects,
        progression,
        pvp,
        unitOfWork,
      }, actorId, action, publishChallenge, nowMs);
    }

    if (action.type === "accept") {
      return handleChallengeAccept({
        analytics,
        hostileEffects,
        progression,
        pvp,
        unitOfWork,
      }, actorId, action.challengeId, nowMs);
    }

    return handleChallengeDecline({ progression, pvp }, actorId, action.challengeId, nowMs);
  };

  return {
    createDicePvpSetupReply,
    handleDicePvpAction,
  };
};

const handleTierPick = async (
  {
    progression,
    pvp,
  }: Pick<ManageChallengeDependencies, "progression" | "pvp">,
  actorId: string,
  action: Extract<DicePvpAction, { type: "pick" }>,
  publishChallenge: PublishChallenge | null,
  nowMs: number,
): Promise<DicePvpResult> => {
  if (actorId !== action.ownerId) {
    return replyMessage("This PvP setup is not assigned to you.", true);
  }

  if (!Number.isInteger(action.duelTier)) {
    return replyMessage("Invalid duel die.", true);
  }

  const opponentId = action.opponentId ?? dicePvpOpenOpponentId;
  const lockoutUntil = pvp.getActiveDiceLockout(action.ownerId, nowMs);
  if (lockoutUntil) {
    return updateMessage(`You can play again ${formatRelativeTime(lockoutUntil)}.`, true);
  }

  if (opponentId !== dicePvpOpenOpponentId) {
    const opponentLockoutUntil = pvp.getActiveDiceLockout(opponentId, nowMs);
    if (opponentLockoutUntil) {
      return updateMessage(
        `<@${opponentId}> can play again ${formatRelativeTime(opponentLockoutUntil)}.`,
        true,
      );
    }
  }

  const maxTier = getUnlockedDicePvpTierFromPrestige(progression.getDicePrestige(action.ownerId));
  if (action.duelTier < 1 || action.duelTier > maxTier) {
    return replyMessage("That duel die is not unlocked yet.", true);
  }

  if (!publishChallenge) {
    return updateMessage("Cannot create a public challenge in this channel.", true);
  }

  const challengeId = randomUUID();
  const expiresAtMs = nowMs + getDicePvpChallengeExpireMs();
  const expiresAtIso = new Date(expiresAtMs).toISOString();

  const createResult = pvp.createDicePvpChallengeIfUsersAvailable({
    id: challengeId,
    challengerId: action.ownerId,
    opponentId,
    duelTier: action.duelTier,
    expiresAt: expiresAtIso,
    nowMs,
  });
  if (!createResult.created) {
    return updateMessage(
      buildPendingConflictContent(createResult, action.ownerId, opponentId),
      true,
    );
  }

  try {
    const challengeMessage = await publishChallenge(
      buildChallengeView(challengeId, action.ownerId, opponentId, action.duelTier, expiresAtMs),
    );

    return updateMessage(`Challenge created: ${challengeMessage.url}`, true);
  } catch {
    pvp.setDicePvpChallengeStatusFromPending(challengeId, "cancelled");
    return updateMessage("Failed to post the challenge in this channel.", true);
  }
};

const handleChallengeAccept = (
  {
    analytics,
    hostileEffects,
    progression,
    pvp,
    unitOfWork,
  }: ManageChallengeDependencies,
  actorId: string,
  challengeId: string,
  nowMs: number,
): DicePvpResult => {
  const challenge = pvp.getDicePvpChallenge(challengeId);
  if (!challenge) {
    return replyMessage("Challenge not found.", true);
  }

  if (challenge.status !== "pending") {
    return replyMessage(`This challenge is already ${challenge.status}.`, true);
  }

  if (isDicePvpChallengeExpired(challenge, nowMs)) {
    const markedExpired = pvp.setDicePvpChallengeStatusFromPending(challenge.id, "expired");
    if (!markedExpired) {
      return alreadyHandledReply();
    }

    return updateMessage(buildExpiredChallengeContent(challenge), true);
  }

  const isOpenChallenge = challenge.opponentId === dicePvpOpenOpponentId;
  let opponentIdForDuel = challenge.opponentId;

  if (isOpenChallenge) {
    if (actorId === challenge.challengerId) {
      return replyMessage("You cannot accept your own open challenge.", true);
    }
    opponentIdForDuel = actorId;
  } else if (actorId !== challenge.opponentId) {
    return replyMessage("Only the challenged user can accept.", true);
  }

  const challengerLockoutUntil = pvp.getActiveDiceLockout(challenge.challengerId, nowMs);
  if (challengerLockoutUntil) {
    return cancelChallengeForLockout(pvp, challenge, challenge.challengerId, challengerLockoutUntil);
  }

  const opponentLockoutUntil = pvp.getActiveDiceLockout(opponentIdForDuel, nowMs);
  if (opponentLockoutUntil) {
    if (isOpenChallenge) {
      return replyMessage(`You can play again ${formatRelativeTime(opponentLockoutUntil)}.`, true);
    }

    return cancelChallengeForLockout(pvp, challenge, opponentIdForDuel, opponentLockoutUntil);
  }

  const challengerTier = getUnlockedDicePvpTierFromPrestige(
    progression.getDicePrestige(challenge.challengerId),
  );
  if (challengerTier < challenge.duelTier) {
    const cancelled = pvp.setDicePvpChallengeStatusFromPending(challenge.id, "cancelled");
    if (!cancelled) {
      return alreadyHandledReply();
    }

    return cancelledByTierUpdate();
  }

  const opponentTier = getUnlockedDicePvpTierFromPrestige(
    progression.getDicePrestige(opponentIdForDuel),
  );
  if (opponentTier < challenge.duelTier) {
    if (isOpenChallenge) {
      return replyMessage("You do not have this duel die unlocked yet.", true);
    }

    const cancelled = pvp.setDicePvpChallengeStatusFromPending(challenge.id, "cancelled");
    if (!cancelled) {
      return alreadyHandledReply();
    }

    return cancelledByTierUpdate();
  }

  if (isOpenChallenge) {
    const claimed = pvp.setDicePvpChallengeOpponentFromOpen(challenge.id, opponentIdForDuel);
    if (!claimed) {
      return alreadyHandledReply();
    }
  }

  const resolvedChallenge = isOpenChallenge
    ? { ...challenge, opponentId: opponentIdForDuel }
    : challenge;

  const duelDieSides = getDicePvpDieSidesForTier(challenge.duelTier);
  const challengerRoll = rollDie(duelDieSides);
  const opponentRoll = rollDie(duelDieSides);

  const outcome = unitOfWork.runInTransaction(() => {
    if (!pvp.setDicePvpChallengeStatusFromPending(challenge.id, "resolved")) {
      return { resolved: false as const };
    }

    if (challengerRoll === opponentRoll) {
      analytics.updateDicePvpStats({ userId: resolvedChallenge.challengerId, draws: 1 });
      analytics.updateDicePvpStats({ userId: resolvedChallenge.opponentId, draws: 1 });
      return {
        resolved: true as const,
        type: "draw" as const,
      };
    }

    const winnerId =
      challengerRoll > opponentRoll ? resolvedChallenge.challengerId : resolvedChallenge.opponentId;
    const loserId =
      winnerId === resolvedChallenge.challengerId
        ? resolvedChallenge.opponentId
        : resolvedChallenge.challengerId;

    const punishmentMs = getDuelPunishmentMs(challenge.duelTier);
    const rewardMs = getDuelRewardMs(challenge.duelTier);
    const winnerEffects = pvp.getDicePvpEffects(winnerId);
    const winnerDoubleRollUntilMs = extendEffect(winnerEffects.doubleRollUntil, rewardMs, nowMs);
    const loserLockoutResult = hostileEffects.applyShieldableNegativeLockout({
      userId: loserId,
      durationMs: punishmentMs,
      nowMs,
    });

    pvp.setDicePvpEffects({
      userId: winnerId,
      doubleRollUntil: new Date(winnerDoubleRollUntilMs).toISOString(),
    });
    analytics.updateDicePvpStats({ userId: winnerId, wins: 1 });
    analytics.updateDicePvpStats({ userId: loserId, losses: 1 });

    return {
      resolved: true as const,
      type: "win" as const,
      winnerId,
      loserId,
      winnerDoubleRollUntilMs,
      loserLockoutUntilMs: loserLockoutResult.lockoutUntilMs,
      loserBlockedByShield: loserLockoutResult.blockedByShield,
    };
  })();

  if (!outcome.resolved) {
    return alreadyHandledReply();
  }

  if (outcome.type === "draw") {
    return updateMessage(
      buildDrawResultContent(resolvedChallenge, challengerRoll, opponentRoll, duelDieSides),
      true,
    );
  }

  return updateMessage(
    buildWinResultContent(
      resolvedChallenge,
      challengerRoll,
      opponentRoll,
      duelDieSides,
      outcome.winnerId,
      outcome.loserId,
      outcome.winnerDoubleRollUntilMs,
      outcome.loserLockoutUntilMs,
      outcome.loserBlockedByShield,
    ),
    true,
  );
};

const handleChallengeDecline = (
  {
    progression,
    pvp,
  }: Pick<ManageChallengeDependencies, "progression" | "pvp">,
  actorId: string,
  challengeId: string,
  nowMs: number,
): DicePvpResult => {
  const challenge = pvp.getDicePvpChallenge(challengeId);
  if (!challenge) {
    return replyMessage("Challenge not found.", true);
  }

  if (challenge.status !== "pending") {
    return replyMessage(`This challenge is already ${challenge.status}.`, true);
  }

  if (isDicePvpChallengeExpired(challenge, nowMs)) {
    const markedExpired = pvp.setDicePvpChallengeStatusFromPending(challenge.id, "expired");
    if (!markedExpired) {
      return alreadyHandledReply();
    }

    return updateMessage(buildExpiredChallengeContent(challenge), true);
  }

  if (challenge.opponentId === dicePvpOpenOpponentId) {
    if (actorId !== challenge.challengerId) {
      return replyMessage("Only the challenger can cancel an open challenge.", true);
    }
  } else if (actorId !== challenge.opponentId) {
    return replyMessage("Only the challenged user can decline.", true);
  }

  const challengerLockoutUntil = pvp.getActiveDiceLockout(challenge.challengerId, nowMs);
  if (challengerLockoutUntil) {
    return cancelChallengeForLockout(pvp, challenge, challenge.challengerId, challengerLockoutUntil);
  }

  if (challenge.opponentId !== dicePvpOpenOpponentId) {
    const opponentLockoutUntil = pvp.getActiveDiceLockout(challenge.opponentId, nowMs);
    if (opponentLockoutUntil) {
      return cancelChallengeForLockout(pvp, challenge, challenge.opponentId, opponentLockoutUntil);
    }
  }

  const declined = pvp.setDicePvpChallengeStatusFromPending(challenge.id, "declined");
  if (!declined) {
    return alreadyHandledReply();
  }

  return updateMessage(buildDeclinedChallengeContent(challenge), true);
};

const buildSetupView = (
  ownerId: string,
  opponentId: string | null,
  maxTier: number,
): ActionView<DicePvpAction> => {
  const tierButtons = Array.from({ length: maxTier }, (_, index) => {
    const duelTier = index + 1;
    return {
      action: {
        type: "pick",
        ownerId,
        opponentId,
        duelTier,
      } as const,
      label: getDicePvpDieLabel(duelTier),
      style: "primary" as const,
    };
  });

  const rows: ActionView<DicePvpAction>["components"] = [];
  for (let index = 0; index < tierButtons.length; index += 4) {
    rows.push(tierButtons.slice(index, index + 4));
  }

  return {
    content: buildSetupContent(opponentId),
    components: rows,
  };
};

const buildChallengeView = (
  challengeId: string,
  challengerId: string,
  opponentId: string,
  duelTier: number,
  expiresAtMs: number,
): ActionView<DicePvpAction> => {
  return {
    content: buildChallengeContent(challengerId, opponentId, duelTier, expiresAtMs),
    components: [
      [
        {
          action: { type: "accept", challengeId },
          label: "Accept",
          style: "success",
        },
        {
          action: { type: "decline", challengeId },
          label: opponentId === dicePvpOpenOpponentId ? "Cancel" : "Decline",
          style: "secondary",
        },
      ],
    ],
  };
};

const buildSetupContent = (opponentId: string | null): string => {
  const targetLine =
    opponentId === null
      ? "Set up an open challenge (any eligible player can accept)."
      : `Set up your challenge against <@${opponentId}>.`;
  return [targetLine, "Pick a duel die (higher dice require higher prestige)."].join("\n");
};

const buildChallengeContent = (
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

const buildDrawResultContent = (
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

const buildWinResultContent = (
  challenge: DicePvpChallenge,
  challengerRoll: number,
  opponentRoll: number,
  duelDieSides: number,
  winnerId: string,
  loserId: string,
  winnerDoubleRollUntilMs: number,
  loserLockoutUntilMs: number | null,
  loserBlockedByShield: boolean,
): string => {
  return [
    "Duel complete.",
    `Duel die: D${duelDieSides}.`,
    `<@${challenge.challengerId}> rolled ${challengerRoll}.`,
    `<@${challenge.opponentId}> rolled ${opponentRoll}.`,
    `<@${winnerId}> is the winner.`,
    loserBlockedByShield
      ? `<@${loserId}> blocked the lockout with Bad Luck Umbrella.`
      : `<@${loserId}> can play again ${formatRelativeTime(loserLockoutUntilMs ?? Date.now())}.`,
    `<@${winnerId}> has double buff on /dice. Their dice rolls are now doubled until ${formatRelativeTime(winnerDoubleRollUntilMs)}.`,
  ].join("\n");
};

const buildLockoutCancellationContent = (lockedUserId: string, lockoutUntil: number): string => {
  return `Challenge cancelled because <@${lockedUserId}> is currently locked out and can play again ${formatRelativeTime(lockoutUntil)}.`;
};

const buildPendingConflictContent = (
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

const buildExpiredChallengeContent = (challenge: DicePvpChallenge): string => {
  if (challenge.opponentId === dicePvpOpenOpponentId) {
    return `The open challenge from <@${challenge.challengerId}> has expired.`;
  }

  return `The challenge between <@${challenge.challengerId}> and <@${challenge.opponentId}> has expired.`;
};

const buildDeclinedChallengeContent = (challenge: DicePvpChallenge): string => {
  return challenge.opponentId === dicePvpOpenOpponentId
    ? `<@${challenge.challengerId}> cancelled their open challenge.`
    : `<@${challenge.opponentId}> declined <@${challenge.challengerId}>'s challenge.`;
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

const formatChallengeUserLabel = (userId: string): string => {
  return userId === dicePvpOpenOpponentId ? "anyone" : `<@${userId}>`;
};

const formatRelativeTime = (timestampMs: number): string => {
  return `<t:${Math.floor(timestampMs / 1000)}:R>`;
};

const formatMinutesOrHours = (durationMs: number): string => {
  const minutes = Math.floor(durationMs / 60_000);
  if (minutes % 60 === 0) {
    return `${minutes / 60}h`;
  }

  return `${minutes}m`;
};

const replyMessage = (content: string, ephemeral: boolean): DicePvpResult => {
  return {
    kind: "reply",
    payload: {
      type: "message",
      content,
      ephemeral,
    },
  };
};

const updateMessage = (content: string, clearComponents: boolean): DicePvpResult => {
  return {
    kind: "update",
    payload: {
      type: "message",
      content,
      clearComponents,
    },
  };
};

const alreadyHandledReply = (): DicePvpResult => {
  return replyMessage("This challenge was already handled.", true);
};

const cancelledByTierUpdate = (): DicePvpResult => {
  return updateMessage(
    "Challenge cancelled. Both players must have the selected duel die unlocked at acceptance time.",
    true,
  );
};

const cancelChallengeForLockout = (
  pvp: Pick<DicePvpRepository, "setDicePvpChallengeStatusFromPending">,
  challenge: DicePvpChallenge,
  lockedUserId: string,
  lockoutUntil: number,
): DicePvpResult => {
  const cancelled = pvp.setDicePvpChallengeStatusFromPending(challenge.id, "cancelled");
  if (!cancelled) {
    return alreadyHandledReply();
  }

  return updateMessage(buildLockoutCancellationContent(lockedUserId, lockoutUntil), true);
};

const extendEffect = (currentUntil: string | null, durationMs: number, nowMs: number): number => {
  const currentMs = currentUntil ? Date.parse(currentUntil) : Number.NaN;
  const base = Number.isNaN(currentMs) ? nowMs : Math.max(nowMs, currentMs);
  return base + durationMs;
};

const rollDie = (dieSides: number): number => {
  return Math.floor(Math.random() * dieSides) + 1;
};
