import { randomUUID } from "node:crypto";
import {
  chunkActionButtons,
  type ActionResult,
  type ActionView,
} from "../../../../shared-kernel/application/action-view";
import { formatDiscordRelativeTime } from "../../../../shared/discord";
import { minuteMs } from "../../../../shared/time";
import type { UnitOfWork } from "../../../../shared-kernel/application/unit-of-work";
import type { DiceAnalyticsRepository } from "../../../analytics/application/ports";
import type { DiceEconomyRepository } from "../../../economy/application/ports";
import type { DiceInventoryRepository } from "../../../inventory/application/ports";
import { awardManualDiceAchievements } from "../../../progression/application/achievement-awards";
import { formatAchievementUnlockText } from "../../../progression/application/achievement-text";
import {
  getDicePvpDieLabel,
  getDuelPunishmentMs,
  getDuelRewardMs,
  getUnlockedDicePvpTierFromPrestige,
} from "../../../pvp/domain/game-rules";
import { getDicePvpAchievementIds } from "../achievement-rules";
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
import { applyPvpLoserLockoutReduction } from "../../../inventory/domain/passive-items";

export type DicePvpAction =
  | {
      type: "pick";
      ownerId: string;
      opponentId: string | null;
      duelTier: number;
      wagerPips: number;
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
  analytics: Pick<DiceAnalyticsRepository, "getDiceAnalytics" | "updateDicePvpStats">;
  economy: Pick<DiceEconomyRepository, "applyPipsDelta" | "getPips">;
  hostileEffects: Pick<DiceHostileEffectsService, "applyShieldableNegativeLockout">;
  inventory: Pick<DiceInventoryRepository, "getInventoryQuantities">;
  progression: Pick<DiceProgressionRepository, "awardAchievements" | "getDicePrestige">;
  pvp: Pick<
    DicePvpRepository,
    | "createDicePvpChallengeIfUsersAvailable"
    | "expireExpiredPendingDicePvpChallengesForUser"
    | "recordResolvedDuel"
    | "getActiveDiceLockout"
    | "getDicePvpAchievementStats"
    | "getDicePvpChallenge"
    | "getDicePvpEffects"
    | "setDicePvpChallengeOpponentFromOpen"
    | "setDicePvpChallengeStatusFromPending"
    | "setDicePvpEffects"
  >;
  random?: () => number;
  unitOfWork: UnitOfWork;
};

export const createDicePvpUseCase = ({
  analytics,
  economy,
  hostileEffects,
  inventory,
  progression,
  pvp,
  random = Math.random,
  unitOfWork,
}: ManageChallengeDependencies) => {
  const createDicePvpSetupReply = (
    challengerId: string,
    opponent: { id: string; bot: boolean } | null,
    wagerPips: number = 0,
    nowMs: number = Date.now(),
  ): DicePvpResult => {
    unitOfWork.runInTransaction(() => {
      expireExpiredPendingChallengesForUsers({
        economy,
        pvp,
        userIds: [challengerId],
        nowMs,
      });
    });

    const lockoutUntil = pvp.getActiveDiceLockout(challengerId, nowMs);
    if (lockoutUntil) {
      return replyMessage(`You can play again ${formatDiscordRelativeTime(lockoutUntil)}.`, true);
    }

    if (opponent) {
      if (opponent.id === challengerId) {
        return replyMessage("Select another user. You cannot challenge yourself.", true);
      }

      if (opponent.bot) {
        return replyMessage("You can only challenge human players.", true);
      }
    }

    if (!Number.isInteger(wagerPips) || wagerPips < 0 || wagerPips > 100) {
      return replyMessage("Wager must be an integer between 0 and 100.", true);
    }

    if (economy.getPips(challengerId) < wagerPips) {
      return replyMessage(
        `You need ${wagerPips} pips to post that wager. Current balance: ${economy.getPips(challengerId)} pips.`,
        true,
      );
    }

    const maxTier = getUnlockedDicePvpTierFromPrestige(progression.getDicePrestige(challengerId));
    return {
      kind: "reply",
      payload: {
        type: "view",
        view: buildSetupView(challengerId, opponent?.id ?? null, maxTier, wagerPips),
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
      return handleTierPick(
        {
          economy,
          progression,
          pvp,
          unitOfWork,
        },
        actorId,
        action,
        publishChallenge,
        nowMs,
      );
    }

    if (action.type === "accept") {
      return handleChallengeAccept(
        {
          analytics,
          economy,
          hostileEffects,
          inventory,
          progression,
          pvp,
          unitOfWork,
          random,
        },
        actorId,
        action.challengeId,
        nowMs,
      );
    }

    return handleChallengeDecline({ economy, pvp, unitOfWork }, actorId, action.challengeId, nowMs);
  };

  return {
    createDicePvpSetupReply,
    handleDicePvpAction,
  };
};

const handleTierPick = async (
  {
    economy,
    progression,
    pvp,
    unitOfWork,
  }: Pick<ManageChallengeDependencies, "economy" | "progression" | "pvp" | "unitOfWork">,
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

  if (!Number.isInteger(action.wagerPips) || action.wagerPips < 0 || action.wagerPips > 100) {
    return replyMessage("Invalid wager.", true);
  }

  const opponentId = action.opponentId ?? dicePvpOpenOpponentId;
  const lockoutUntil = pvp.getActiveDiceLockout(action.ownerId, nowMs);
  if (lockoutUntil) {
    return updateMessage(`You can play again ${formatDiscordRelativeTime(lockoutUntil)}.`, true);
  }

  if (opponentId !== dicePvpOpenOpponentId) {
    const opponentLockoutUntil = pvp.getActiveDiceLockout(opponentId, nowMs);
    if (opponentLockoutUntil) {
      return updateMessage(
        `<@${opponentId}> can play again ${formatDiscordRelativeTime(opponentLockoutUntil)}.`,
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

  const createResult = unitOfWork.runInTransaction(() => {
    expireExpiredPendingChallengesForUsers({
      economy,
      pvp,
      userIds:
        opponentId === dicePvpOpenOpponentId ? [action.ownerId] : [action.ownerId, opponentId],
      nowMs,
    });

    const currentPips = economy.getPips(action.ownerId);
    if (currentPips < action.wagerPips) {
      return {
        created: false as const,
        reason: "insufficient-pips" as const,
        currentPips,
      };
    }

    const result = pvp.createDicePvpChallengeIfUsersAvailable({
      id: challengeId,
      challengerId: action.ownerId,
      opponentId,
      duelTier: action.duelTier,
      wagerPips: action.wagerPips,
      expiresAt: expiresAtIso,
      nowMs,
    });
    if (!result.created) {
      return result;
    }

    if (action.wagerPips > 0) {
      economy.applyPipsDelta({
        userId: action.ownerId,
        amount: -action.wagerPips,
      });
    }

    return result;
  });

  if ("reason" in createResult) {
    return updateMessage(
      `You need ${action.wagerPips} pips to post that wager. Current balance: ${createResult.currentPips} pips.`,
      true,
    );
  }

  if (!createResult.created) {
    return updateMessage(
      buildPendingConflictContent(createResult, action.ownerId, opponentId),
      true,
    );
  }

  try {
    const challengeMessage = await publishChallenge(
      buildChallengeView(
        challengeId,
        action.ownerId,
        opponentId,
        action.duelTier,
        action.wagerPips,
        expiresAtMs,
      ),
    );

    return updateMessage(`Challenge created: ${challengeMessage.url}`, true);
  } catch {
    unitOfWork.runInTransaction(() => {
      if (!pvp.setDicePvpChallengeStatusFromPending(challengeId, "cancelled")) {
        return;
      }

      if (action.wagerPips > 0) {
        economy.applyPipsDelta({
          userId: action.ownerId,
          amount: action.wagerPips,
        });
      }
    });
    return updateMessage(
      buildFailedPublishChallengeContent(action.ownerId, action.wagerPips),
      true,
    );
  }
};

const handleChallengeAccept = (
  {
    analytics,
    economy,
    hostileEffects,
    inventory,
    progression,
    pvp,
    random = Math.random,
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
    const expired = expireChallenge({
      challenge,
      economy,
      pvp,
      unitOfWork,
    });
    if (!expired) {
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
    return cancelChallengeForLockout(
      economy,
      pvp,
      challenge,
      challenge.challengerId,
      challengerLockoutUntil,
      unitOfWork,
    );
  }

  const opponentLockoutUntil = pvp.getActiveDiceLockout(opponentIdForDuel, nowMs);
  if (opponentLockoutUntil) {
    if (isOpenChallenge) {
      return replyMessage(
        `You can play again ${formatDiscordRelativeTime(opponentLockoutUntil)}.`,
        true,
      );
    }

    return cancelChallengeForLockout(
      economy,
      pvp,
      challenge,
      opponentIdForDuel,
      opponentLockoutUntil,
      unitOfWork,
    );
  }

  const challengerTier = getUnlockedDicePvpTierFromPrestige(
    progression.getDicePrestige(challenge.challengerId),
  );
  if (challengerTier < challenge.duelTier) {
    const cancelled = cancelPendingChallenge({
      challenge,
      economy,
      pvp,
      status: "cancelled",
      unitOfWork,
    });
    if (!cancelled) {
      return alreadyHandledReply();
    }

    return cancelledByTierUpdate(challenge);
  }

  const opponentTier = getUnlockedDicePvpTierFromPrestige(
    progression.getDicePrestige(opponentIdForDuel),
  );
  if (opponentTier < challenge.duelTier) {
    if (isOpenChallenge) {
      return replyMessage("You do not have this duel die unlocked yet.", true);
    }

    const cancelled = cancelPendingChallenge({
      challenge,
      economy,
      pvp,
      status: "cancelled",
      unitOfWork,
    });
    if (!cancelled) {
      return alreadyHandledReply();
    }

    return cancelledByTierUpdate(challenge);
  }

  const resolvedChallenge = isOpenChallenge
    ? { ...challenge, opponentId: opponentIdForDuel }
    : challenge;

  const duelDieSides = getDicePvpDieSidesForTier(challenge.duelTier);
  const challengerRoll = rollDie(duelDieSides, random);
  const opponentRoll = rollDie(duelDieSides, random);

  const outcome = unitOfWork.runInTransaction(() => {
    if (challenge.wagerPips > 0 && economy.getPips(opponentIdForDuel) < challenge.wagerPips) {
      return {
        resolved: false as const,
        reason: "insufficient-pips" as const,
        currentPips: economy.getPips(opponentIdForDuel),
      };
    }

    if (isOpenChallenge) {
      const claimed = pvp.setDicePvpChallengeOpponentFromOpen(challenge.id, opponentIdForDuel);
      if (!claimed) {
        return { resolved: false as const, reason: "already-handled" as const };
      }
    }

    if (challenge.wagerPips > 0) {
      economy.applyPipsDelta({
        userId: opponentIdForDuel,
        amount: -challenge.wagerPips,
      });
    }

    if (!pvp.setDicePvpChallengeStatusFromPending(challenge.id, "resolved")) {
      if (challenge.wagerPips > 0) {
        economy.applyPipsDelta({
          userId: opponentIdForDuel,
          amount: challenge.wagerPips,
        });
      }
      return { resolved: false as const, reason: "already-handled" as const };
    }

    if (challengerRoll === opponentRoll) {
      if (challenge.wagerPips > 0) {
        economy.applyPipsDelta({
          userId: resolvedChallenge.challengerId,
          amount: challenge.wagerPips,
        });
        economy.applyPipsDelta({
          userId: resolvedChallenge.opponentId,
          amount: challenge.wagerPips,
        });
      }
      analytics.updateDicePvpStats({ userId: resolvedChallenge.challengerId, draws: 1 });
      analytics.updateDicePvpStats({ userId: resolvedChallenge.opponentId, draws: 1 });
      const challengerPvpStats = pvp.recordResolvedDuel({
        userId: resolvedChallenge.challengerId,
        duelTier: challenge.duelTier,
        result: "draw",
      });
      const opponentPvpStats = pvp.recordResolvedDuel({
        userId: resolvedChallenge.opponentId,
        duelTier: challenge.duelTier,
        result: "draw",
      });
      const challengerNewlyEarned = awardManualDiceAchievements(
        progression,
        resolvedChallenge.challengerId,
        getDicePvpAchievementIds(
          analytics.getDiceAnalytics(resolvedChallenge.challengerId),
          challengerPvpStats,
        ),
      );
      const opponentNewlyEarned = awardManualDiceAchievements(
        progression,
        resolvedChallenge.opponentId,
        getDicePvpAchievementIds(
          analytics.getDiceAnalytics(resolvedChallenge.opponentId),
          opponentPvpStats,
        ),
      );
      return {
        resolved: true as const,
        type: "draw" as const,
        challengerNewlyEarned,
        opponentNewlyEarned,
      };
    }

    const winnerId =
      challengerRoll > opponentRoll ? resolvedChallenge.challengerId : resolvedChallenge.opponentId;
    const loserId =
      winnerId === resolvedChallenge.challengerId
        ? resolvedChallenge.opponentId
        : resolvedChallenge.challengerId;
    const burnPips = getWagerBurnPips(challenge.wagerPips);
    const payoutPips = getWagerWinnerPayoutPips(challenge.wagerPips);

    if (payoutPips > 0) {
      economy.applyPipsDelta({
        userId: winnerId,
        amount: payoutPips,
      });
    }

    const punishmentMs = getDuelPunishmentMs(challenge.duelTier);
    const reducedPunishmentMs = applyPvpLoserLockoutReduction(
      punishmentMs,
      inventory.getInventoryQuantities(loserId),
    );
    const rewardMs = getDuelRewardMs(challenge.duelTier);
    const winnerEffects = pvp.getDicePvpEffects(winnerId);
    const winnerDoubleRollUntilMs = extendEffect(winnerEffects.doubleRollUntil, rewardMs, nowMs);
    const loserLockoutResult = hostileEffects.applyShieldableNegativeLockout({
      userId: loserId,
      durationMs: reducedPunishmentMs,
      nowMs,
    });

    pvp.setDicePvpEffects({
      userId: winnerId,
      doubleRollUntil: new Date(winnerDoubleRollUntilMs).toISOString(),
    });
    analytics.updateDicePvpStats({ userId: winnerId, wins: 1 });
    analytics.updateDicePvpStats({ userId: loserId, losses: 1 });
    const winnerPvpStats = pvp.recordResolvedDuel({
      userId: winnerId,
      duelTier: challenge.duelTier,
      result: "win",
    });
    const loserPvpStats = pvp.recordResolvedDuel({
      userId: loserId,
      duelTier: challenge.duelTier,
      result: "loss",
    });
    const winnerNewlyEarned = awardManualDiceAchievements(
      progression,
      winnerId,
      getDicePvpAchievementIds(analytics.getDiceAnalytics(winnerId), winnerPvpStats),
    );
    const loserNewlyEarned = awardManualDiceAchievements(
      progression,
      loserId,
      getDicePvpAchievementIds(analytics.getDiceAnalytics(loserId), loserPvpStats),
    );

    return {
      resolved: true as const,
      type: "win" as const,
      winnerId,
      loserId,
      burnPips,
      payoutPips,
      winnerDoubleRollUntilMs,
      loserLockoutUntilMs: loserLockoutResult.lockoutUntilMs,
      loserBlockedByShield: loserLockoutResult.blockedByShield,
      winnerNewlyEarned,
      loserNewlyEarned,
    };
  });

  if (!outcome.resolved) {
    if (outcome.reason === "insufficient-pips") {
      return replyMessage(
        `<@${opponentIdForDuel}> needs ${challenge.wagerPips} pips to accept this wager. Current balance: ${outcome.currentPips} pips.`,
        true,
      );
    }

    return alreadyHandledReply();
  }

  if (outcome.type === "draw") {
    return updateMessage(
      buildDrawResultContent(
        resolvedChallenge,
        challengerRoll,
        opponentRoll,
        duelDieSides,
        challenge.wagerPips,
        outcome.challengerNewlyEarned,
        outcome.opponentNewlyEarned,
      ),
      true,
    );
  }

  return updateMessage(
    buildWinResultContent(
      resolvedChallenge,
      challengerRoll,
      opponentRoll,
      duelDieSides,
      challenge.wagerPips,
      outcome.burnPips,
      outcome.payoutPips,
      outcome.winnerId,
      outcome.loserId,
      outcome.winnerDoubleRollUntilMs,
      outcome.loserLockoutUntilMs,
      outcome.loserBlockedByShield,
      outcome.winnerNewlyEarned,
      outcome.loserNewlyEarned,
    ),
    true,
  );
};

const handleChallengeDecline = (
  { economy, pvp, unitOfWork }: Pick<ManageChallengeDependencies, "economy" | "pvp" | "unitOfWork">,
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
    const expired = expireChallenge({
      challenge,
      economy,
      pvp,
      unitOfWork,
    });
    if (!expired) {
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
    return cancelChallengeForLockout(
      economy,
      pvp,
      challenge,
      challenge.challengerId,
      challengerLockoutUntil,
      unitOfWork,
    );
  }

  if (challenge.opponentId !== dicePvpOpenOpponentId) {
    const opponentLockoutUntil = pvp.getActiveDiceLockout(challenge.opponentId, nowMs);
    if (opponentLockoutUntil) {
      return cancelChallengeForLockout(
        economy,
        pvp,
        challenge,
        challenge.opponentId,
        opponentLockoutUntil,
        unitOfWork,
      );
    }
  }

  const declined = cancelPendingChallenge({
    challenge,
    economy,
    pvp,
    status: "declined",
    unitOfWork,
  });
  if (!declined) {
    return alreadyHandledReply();
  }

  return updateMessage(buildDeclinedChallengeContent(challenge), true);
};

const buildSetupView = (
  ownerId: string,
  opponentId: string | null,
  maxTier: number,
  wagerPips: number,
): ActionView<DicePvpAction> => {
  const tierButtons = Array.from({ length: maxTier }, (_, index) => {
    const duelTier = index + 1;
    return {
      action: {
        type: "pick",
        ownerId,
        opponentId,
        duelTier,
        wagerPips,
      } as const,
      label: getDicePvpDieLabel(duelTier),
      style: "primary" as const,
    };
  });

  return {
    content: buildSetupContent(opponentId, wagerPips),
    components: chunkActionButtons(tierButtons, 4),
  };
};

const buildChallengeView = (
  challengeId: string,
  challengerId: string,
  opponentId: string,
  duelTier: number,
  wagerPips: number,
  expiresAtMs: number,
): ActionView<DicePvpAction> => {
  return {
    content: buildChallengeContent(challengerId, opponentId, duelTier, wagerPips, expiresAtMs),
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

const buildSetupContent = (opponentId: string | null, wagerPips: number): string => {
  const targetLine =
    opponentId === null
      ? "Set up an open challenge (any eligible player can accept)."
      : `Set up your challenge against <@${opponentId}>.`;
  return [
    targetLine,
    `Wager: ${formatChallengeWagerText(wagerPips)}.`,
    "Pick a duel die (higher dice require higher prestige).",
  ].join("\n");
};

const buildChallengeContent = (
  challengerId: string,
  opponentId: string,
  duelTier: number,
  wagerPips: number,
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
    buildChallengeStakeLine(wagerPips),
    buildChallengeBurnLine(wagerPips),
    "",
    openChallenge
      ? `Anyone can accept if they have ${duelDieLabel} unlocked.`
      : `<@${opponentId}> can accept if they have ${duelDieLabel} unlocked.`,
    `Challenge expires ${formatDiscordRelativeTime(expiresAtMs)}.`,
    `Loser lockout: ${formatMinutesOrHours(getDuelPunishmentMs(duelTier))}.`,
    `Winner buff: ${formatMinutesOrHours(getDuelRewardMs(duelTier))} of double buff on /dice.`,
  ].join("\n");
};

const buildDrawResultContent = (
  challenge: DicePvpChallenge,
  challengerRoll: number,
  opponentRoll: number,
  duelDieSides: number,
  wagerPips: number,
  challengerNewlyEarned: string[],
  opponentNewlyEarned: string[],
): string => {
  return [
    "Duel ended in a draw.",
    `Duel die: D${duelDieSides}.`,
    `Wager: ${formatChallengeWagerText(wagerPips)}.`,
    `<@${challenge.challengerId}> rolled ${challengerRoll}.`,
    `<@${challenge.opponentId}> rolled ${opponentRoll}.`,
    wagerPips > 0
      ? `Draw refund: both players get ${wagerPips} pip${wagerPips === 1 ? "" : "s"} back.`
      : "No effects were applied.",
    formatUserAchievementUnlockLine(challenge.challengerId, challengerNewlyEarned),
    formatUserAchievementUnlockLine(challenge.opponentId, opponentNewlyEarned),
  ]
    .filter((line) => line.length > 0)
    .join("\n");
};

const buildWinResultContent = (
  challenge: DicePvpChallenge,
  challengerRoll: number,
  opponentRoll: number,
  duelDieSides: number,
  wagerPips: number,
  burnPips: number,
  payoutPips: number,
  winnerId: string,
  loserId: string,
  winnerDoubleRollUntilMs: number,
  loserLockoutUntilMs: number | null,
  loserBlockedByShield: boolean,
  winnerNewlyEarned: string[],
  loserNewlyEarned: string[],
): string => {
  return [
    "Duel complete.",
    `Duel die: D${duelDieSides}.`,
    `Wager: ${formatChallengeWagerText(wagerPips)}.`,
    `<@${challenge.challengerId}> rolled ${challengerRoll}.`,
    `<@${challenge.opponentId}> rolled ${opponentRoll}.`,
    `<@${winnerId}> is the winner.`,
    ...(wagerPips > 0
      ? [
          `<@${winnerId}> receives ${payoutPips} pip${payoutPips === 1 ? "" : "s"}.`,
          `${burnPips} pip${burnPips === 1 ? "" : "s"} burned from the pot.`,
        ]
      : []),
    loserBlockedByShield
      ? `<@${loserId}> blocked the lockout with Bad Luck Umbrella.`
      : `<@${loserId}> can play again ${formatDiscordRelativeTime(loserLockoutUntilMs ?? Date.now())}.`,
    `<@${winnerId}> has double buff on /dice. Their dice rolls are now doubled until ${formatDiscordRelativeTime(winnerDoubleRollUntilMs)}.`,
    formatUserAchievementUnlockLine(winnerId, winnerNewlyEarned),
    formatUserAchievementUnlockLine(loserId, loserNewlyEarned),
  ]
    .filter((line) => line.length > 0)
    .join("\n");
};

const buildLockoutCancellationContent = (lockedUserId: string, lockoutUntil: number): string => {
  return `Challenge cancelled because <@${lockedUserId}> is currently locked out and can play again ${formatDiscordRelativeTime(lockoutUntil)}.`;
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
    return [
      `The open challenge from <@${challenge.challengerId}> has expired.`,
      formatChallengeRefundLine(challenge),
    ]
      .filter((line) => line.length > 0)
      .join("\n");
  }

  return [
    `The challenge between <@${challenge.challengerId}> and <@${challenge.opponentId}> has expired.`,
    formatChallengeRefundLine(challenge),
  ]
    .filter((line) => line.length > 0)
    .join("\n");
};

const buildDeclinedChallengeContent = (challenge: DicePvpChallenge): string => {
  const message =
    challenge.opponentId === dicePvpOpenOpponentId
      ? `<@${challenge.challengerId}> cancelled their open challenge.`
      : `<@${challenge.opponentId}> declined <@${challenge.challengerId}>'s challenge.`;

  return [message, formatChallengeRefundLine(challenge)]
    .filter((line) => line.length > 0)
    .join("\n");
};

const buildFailedPublishChallengeContent = (challengerId: string, wagerPips: number): string => {
  return [
    "Failed to post the challenge in this channel.",
    wagerPips > 0
      ? `<@${challengerId}> was refunded ${wagerPips} pip${wagerPips === 1 ? "" : "s"}.`
      : "",
  ]
    .filter((line) => line.length > 0)
    .join("\n");
};

const getOtherParticipantId = (challenge: DicePvpChallenge, userId: string): string => {
  return challenge.challengerId === userId ? challenge.opponentId : challenge.challengerId;
};

const formatChallengeExpiry = (expiresAt: string): string => {
  const expiresAtMs = Date.parse(expiresAt);
  if (Number.isNaN(expiresAtMs)) {
    return "soon";
  }

  return formatDiscordRelativeTime(expiresAtMs);
};

const formatChallengeUserLabel = (userId: string): string => {
  return userId === dicePvpOpenOpponentId ? "anyone" : `<@${userId}>`;
};

const formatChallengeWagerText = (wagerPips: number): string => {
  return wagerPips > 0 ? `${wagerPips} pip${wagerPips === 1 ? "" : "s"} per player` : "no wager";
};

const buildChallengeStakeLine = (wagerPips: number): string => {
  return `Stake: ${formatChallengeWagerText(wagerPips)}.`;
};

const buildChallengeBurnLine = (wagerPips: number): string => {
  if (wagerPips < 1) {
    return "Burn on decisive result: none.";
  }

  const burnPips = getWagerBurnPips(wagerPips);
  const payoutPips = getWagerWinnerPayoutPips(wagerPips);
  return `Decisive payout: ${payoutPips} pips to the winner, ${burnPips} pip${burnPips === 1 ? "" : "s"} burned.`;
};

const formatChallengeRefundLine = (challenge: DicePvpChallenge): string => {
  if (challenge.wagerPips < 1) {
    return "";
  }

  return `<@${challenge.challengerId}> was refunded ${challenge.wagerPips} pip${challenge.wagerPips === 1 ? "" : "s"}.`;
};

const formatMinutesOrHours = (durationMs: number): string => {
  const minutes = Math.floor(durationMs / minuteMs);
  if (minutes % 60 === 0) {
    return `${minutes / 60}h`;
  }

  return `${minutes}m`;
};

const formatUserAchievementUnlockLine = (
  userId: string,
  achievementIds: readonly string[],
): string => {
  const achievementText = formatAchievementUnlockText(achievementIds);
  return achievementText ? `<@${userId}>: ${achievementText}` : "";
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

const cancelledByTierUpdate = (challenge: DicePvpChallenge): DicePvpResult => {
  return updateMessage(
    [
      "Challenge cancelled. Both players must have the selected duel die unlocked at acceptance time.",
      formatChallengeRefundLine(challenge),
    ]
      .filter((line) => line.length > 0)
      .join("\n"),
    true,
  );
};

const expireExpiredPendingChallengesForUsers = ({
  economy,
  pvp,
  userIds,
  nowMs,
}: {
  economy: Pick<DiceEconomyRepository, "applyPipsDelta">;
  pvp: Pick<DicePvpRepository, "expireExpiredPendingDicePvpChallengesForUser">;
  userIds: string[];
  nowMs: number;
}): void => {
  const expiredChallenges = new Map<string, DicePvpChallenge>();

  for (const userId of new Set(userIds)) {
    for (const challenge of pvp.expireExpiredPendingDicePvpChallengesForUser(userId, nowMs)) {
      expiredChallenges.set(challenge.id, challenge);
    }
  }

  for (const challenge of expiredChallenges.values()) {
    refundChallengeChallenger(economy, challenge);
  }
};

const refundChallengeChallenger = (
  economy: Pick<DiceEconomyRepository, "applyPipsDelta">,
  challenge: DicePvpChallenge,
): void => {
  if (challenge.wagerPips < 1) {
    return;
  }

  economy.applyPipsDelta({
    userId: challenge.challengerId,
    amount: challenge.wagerPips,
  });
};

const cancelPendingChallenge = ({
  challenge,
  economy,
  pvp,
  status,
  unitOfWork,
}: {
  challenge: DicePvpChallenge;
  economy: Pick<DiceEconomyRepository, "applyPipsDelta">;
  pvp: Pick<DicePvpRepository, "setDicePvpChallengeStatusFromPending">;
  status: "declined" | "expired" | "cancelled";
  unitOfWork: UnitOfWork;
}): boolean => {
  return unitOfWork.runInTransaction(() => {
    if (!pvp.setDicePvpChallengeStatusFromPending(challenge.id, status)) {
      return false;
    }

    refundChallengeChallenger(economy, challenge);
    return true;
  });
};

const expireChallenge = ({
  challenge,
  economy,
  pvp,
  unitOfWork,
}: {
  challenge: DicePvpChallenge;
  economy: Pick<DiceEconomyRepository, "applyPipsDelta">;
  pvp: Pick<DicePvpRepository, "setDicePvpChallengeStatusFromPending">;
  unitOfWork: UnitOfWork;
}): boolean => {
  return cancelPendingChallenge({
    challenge,
    economy,
    pvp,
    status: "expired",
    unitOfWork,
  });
};

const cancelChallengeForLockout = (
  economy: Pick<DiceEconomyRepository, "applyPipsDelta">,
  pvp: Pick<DicePvpRepository, "setDicePvpChallengeStatusFromPending">,
  challenge: DicePvpChallenge,
  lockedUserId: string,
  lockoutUntil: number,
  unitOfWork: UnitOfWork,
): DicePvpResult => {
  const cancelled = cancelPendingChallenge({
    challenge,
    economy,
    pvp,
    status: "cancelled",
    unitOfWork,
  });
  if (!cancelled) {
    return alreadyHandledReply();
  }

  return updateMessage(
    [
      buildLockoutCancellationContent(lockedUserId, lockoutUntil),
      formatChallengeRefundLine(challenge),
    ]
      .filter((line) => line.length > 0)
      .join("\n"),
    true,
  );
};

const getWagerBurnPips = (wagerPips: number): number => {
  if (wagerPips < 1) {
    return 0;
  }

  return Math.max(1, Math.min(5, Math.floor(wagerPips * 0.1)));
};

const getWagerWinnerPayoutPips = (wagerPips: number): number => {
  if (wagerPips < 1) {
    return 0;
  }

  return wagerPips * 2 - getWagerBurnPips(wagerPips);
};

const extendEffect = (currentUntil: string | null, durationMs: number, nowMs: number): number => {
  const currentMs = currentUntil ? Date.parse(currentUntil) : Number.NaN;
  const base = Number.isNaN(currentMs) ? nowMs : Math.max(nowMs, currentMs);
  return base + durationMs;
};

const rollDie = (dieSides: number, random: () => number): number => {
  return Math.floor(random() * dieSides) + 1;
};
