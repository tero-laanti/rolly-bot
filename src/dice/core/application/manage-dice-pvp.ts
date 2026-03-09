import { randomUUID } from "node:crypto";
import type { ActionRowBuilder, ButtonBuilder } from "discord.js";
import type { SqliteDatabase } from "../../../shared/db";
import type { InteractionResult } from "../../../bot/interaction-response";
import {
  buildChallengeActionRow,
  buildChallengeContent,
  buildDeclinedChallengeContent,
  buildDrawResultContent,
  buildExpiredChallengeContent,
  buildLockoutCancellationContent,
  buildPendingConflictContent,
  buildSetupContent,
  buildTierSelectionComponents,
  buildWinResultContent,
  decodeDicePvpOpponentToken,
  formatRelativeTime,
} from "../presentation/dice-pvp-output";
import {
  createDicePvpChallengeIfUsersAvailable,
  dicePvpOpenOpponentId,
  getActiveDiceLockout,
  getDicePvpChallenge,
  getDicePvpChallengeExpireMs,
  getDicePvpDieSidesForTier,
  getDicePvpEffects,
  getDuelPunishmentMs,
  getDuelRewardMs,
  getUnlockedDicePvpTier,
  isDicePvpChallengeExpired,
  setDicePvpChallengeOpponentFromOpen,
  setDicePvpChallengeStatusFromPending,
  setDicePvpEffects,
  type DicePvpChallenge,
} from "../domain/pvp";
import { updateDicePvpStats } from "../domain/analytics";

export const dicePvpButtonPrefix = "dice-pvp:";

type PublishChallengeInput = {
  content: string;
  components: ActionRowBuilder<ButtonBuilder>[];
};

type PublishChallenge = (input: PublishChallengeInput) => Promise<{ url: string }>;

export const createDicePvpSetupReply = (
  db: SqliteDatabase,
  challengerId: string,
  opponent: { id: string; bot: boolean } | null,
  nowMs: number = Date.now(),
): InteractionResult => {
  const lockoutUntil = getActiveDiceLockout(db, challengerId, nowMs);
  if (lockoutUntil) {
    return {
      kind: "reply",
      payload: {
        content: `You can play again ${formatRelativeTime(lockoutUntil)}.`,
        ephemeral: true,
      },
    };
  }

  if (opponent) {
    if (opponent.id === challengerId) {
      return {
        kind: "reply",
        payload: {
          content: "Select another user. You cannot challenge yourself.",
          ephemeral: true,
        },
      };
    }

    if (opponent.bot) {
      return {
        kind: "reply",
        payload: {
          content: "You can only challenge human players.",
          ephemeral: true,
        },
      };
    }
  }

  const maxTier = getUnlockedDicePvpTier(db, challengerId);
  return {
    kind: "reply",
    payload: {
      content: buildSetupContent(opponent?.id ?? null),
      components: buildTierSelectionComponents(challengerId, opponent?.id ?? null, maxTier),
      ephemeral: true,
    },
  };
};

export const handleDicePvpAction = async (
  db: SqliteDatabase,
  actorId: string,
  customId: string,
  publishChallenge: PublishChallenge | null,
  nowMs: number = Date.now(),
): Promise<InteractionResult> => {
  const [prefix, action, ...parts] = customId.split(":");
  if (prefix !== dicePvpButtonPrefix.slice(0, -1)) {
    return {
      kind: "reply",
      payload: {
        content: "Unknown PvP action.",
        ephemeral: true,
      },
    };
  }

  if (action === "pick") {
    return handleTierPick(db, actorId, parts, publishChallenge, nowMs);
  }

  if (action === "accept") {
    return handleChallengeAccept(db, actorId, parts[0], nowMs);
  }

  if (action === "decline") {
    return handleChallengeDecline(db, actorId, parts[0], nowMs);
  }

  return {
    kind: "reply",
    payload: {
      content: "Unknown PvP action.",
      ephemeral: true,
    },
  };
};

const handleTierPick = async (
  db: SqliteDatabase,
  actorId: string,
  parts: string[],
  publishChallenge: PublishChallenge | null,
  nowMs: number,
): Promise<InteractionResult> => {
  const ownerId = parts[0];
  const opponentToken = parts[1];
  const tierRaw = parts[2];

  if (!ownerId || !opponentToken || !tierRaw) {
    return {
      kind: "reply",
      payload: {
        content: "Invalid challenge setup.",
        ephemeral: true,
      },
    };
  }

  if (actorId !== ownerId) {
    return {
      kind: "reply",
      payload: {
        content: "This PvP setup is not assigned to you.",
        ephemeral: true,
      },
    };
  }

  const duelTier = Number.parseInt(tierRaw, 10);
  if (!Number.isInteger(duelTier)) {
    return {
      kind: "reply",
      payload: {
        content: "Invalid duel die.",
        ephemeral: true,
      },
    };
  }

  const opponentId = decodeDicePvpOpponentToken(opponentToken);
  const lockoutUntil = getActiveDiceLockout(db, ownerId, nowMs);
  if (lockoutUntil) {
    return {
      kind: "update",
      payload: {
        content: `You can play again ${formatRelativeTime(lockoutUntil)}.`,
        components: [],
      },
    };
  }

  if (opponentId !== dicePvpOpenOpponentId) {
    const opponentLockoutUntil = getActiveDiceLockout(db, opponentId, nowMs);
    if (opponentLockoutUntil) {
      return {
        kind: "update",
        payload: {
          content: `<@${opponentId}> can play again ${formatRelativeTime(opponentLockoutUntil)}.`,
          components: [],
        },
      };
    }
  }

  const maxTier = getUnlockedDicePvpTier(db, ownerId);
  if (duelTier < 1 || duelTier > maxTier) {
    return {
      kind: "reply",
      payload: {
        content: "That duel die is not unlocked yet.",
        ephemeral: true,
      },
    };
  }

  if (!publishChallenge) {
    return {
      kind: "update",
      payload: {
        content: "Cannot create a public challenge in this channel.",
        components: [],
      },
    };
  }

  const challengeId = randomUUID();
  const expiresAtMs = nowMs + getDicePvpChallengeExpireMs();
  const expiresAtIso = new Date(expiresAtMs).toISOString();

  const createResult = createDicePvpChallengeIfUsersAvailable(db, {
    id: challengeId,
    challengerId: ownerId,
    opponentId,
    duelTier,
    expiresAt: expiresAtIso,
    nowMs,
  });
  if (!createResult.created) {
    return {
      kind: "update",
      payload: {
        content: buildPendingConflictContent(createResult, ownerId, opponentId),
        components: [],
      },
    };
  }

  try {
    const challengeMessage = await publishChallenge({
      content: buildChallengeContent(ownerId, opponentId, duelTier, expiresAtMs),
      components: [buildChallengeActionRow(challengeId, opponentId === dicePvpOpenOpponentId)],
    });

    return {
      kind: "update",
      payload: {
        content: `Challenge created: ${challengeMessage.url}`,
        components: [],
      },
    };
  } catch {
    setDicePvpChallengeStatusFromPending(db, challengeId, "cancelled");
    return {
      kind: "update",
      payload: {
        content: "Failed to post the challenge in this channel.",
        components: [],
      },
    };
  }
};

const handleChallengeAccept = (
  db: SqliteDatabase,
  actorId: string,
  challengeId: string | undefined,
  nowMs: number,
): InteractionResult => {
  if (!challengeId) {
    return {
      kind: "reply",
      payload: {
        content: "Invalid challenge id.",
        ephemeral: true,
      },
    };
  }

  const challenge = getDicePvpChallenge(db, challengeId);
  if (!challenge) {
    return {
      kind: "reply",
      payload: {
        content: "Challenge not found.",
        ephemeral: true,
      },
    };
  }

  if (challenge.status !== "pending") {
    return {
      kind: "reply",
      payload: {
        content: `This challenge is already ${challenge.status}.`,
        ephemeral: true,
      },
    };
  }

  if (isDicePvpChallengeExpired(challenge, nowMs)) {
    const markedExpired = setDicePvpChallengeStatusFromPending(db, challenge.id, "expired");
    if (!markedExpired) {
      return alreadyHandledReply();
    }

    return {
      kind: "update",
      payload: {
        content: buildExpiredChallengeContent(challenge),
        components: [],
      },
    };
  }

  const isOpenChallenge = challenge.opponentId === dicePvpOpenOpponentId;
  let opponentIdForDuel = challenge.opponentId;

  if (isOpenChallenge) {
    if (actorId === challenge.challengerId) {
      return {
        kind: "reply",
        payload: {
          content: "You cannot accept your own open challenge.",
          ephemeral: true,
        },
      };
    }
    opponentIdForDuel = actorId;
  } else if (actorId !== challenge.opponentId) {
    return {
      kind: "reply",
      payload: {
        content: "Only the challenged user can accept.",
        ephemeral: true,
      },
    };
  }

  const challengerLockoutUntil = getActiveDiceLockout(db, challenge.challengerId, nowMs);
  if (challengerLockoutUntil) {
    return cancelChallengeForLockout(db, challenge, challenge.challengerId, challengerLockoutUntil);
  }

  const opponentLockoutUntil = getActiveDiceLockout(db, opponentIdForDuel, nowMs);
  if (opponentLockoutUntil) {
    if (isOpenChallenge) {
      return {
        kind: "reply",
        payload: {
          content: `You can play again ${formatRelativeTime(opponentLockoutUntil)}.`,
          ephemeral: true,
        },
      };
    }

    return cancelChallengeForLockout(db, challenge, opponentIdForDuel, opponentLockoutUntil);
  }

  const challengerTier = getUnlockedDicePvpTier(db, challenge.challengerId);
  if (challengerTier < challenge.duelTier) {
    const cancelled = setDicePvpChallengeStatusFromPending(db, challenge.id, "cancelled");
    if (!cancelled) {
      return alreadyHandledReply();
    }

    return cancelledByTierUpdate();
  }

  const opponentTier = getUnlockedDicePvpTier(db, opponentIdForDuel);
  if (opponentTier < challenge.duelTier) {
    if (isOpenChallenge) {
      return {
        kind: "reply",
        payload: {
          content: "You do not have this duel die unlocked yet.",
          ephemeral: true,
        },
      };
    }

    const cancelled = setDicePvpChallengeStatusFromPending(db, challenge.id, "cancelled");
    if (!cancelled) {
      return alreadyHandledReply();
    }

    return cancelledByTierUpdate();
  }

  if (isOpenChallenge) {
    const claimed = setDicePvpChallengeOpponentFromOpen(db, challenge.id, opponentIdForDuel);
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

  const outcome = db.transaction(() => {
    if (!setDicePvpChallengeStatusFromPending(db, challenge.id, "resolved")) {
      return { resolved: false as const };
    }

    if (challengerRoll === opponentRoll) {
      updateDicePvpStats(db, { userId: resolvedChallenge.challengerId, draws: 1 });
      updateDicePvpStats(db, { userId: resolvedChallenge.opponentId, draws: 1 });
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
    const winnerEffects = getDicePvpEffects(db, winnerId);
    const loserEffects = getDicePvpEffects(db, loserId);
    const winnerDoubleRollUntilMs = extendEffect(winnerEffects.doubleRollUntil, rewardMs, nowMs);
    const loserLockoutUntilMs = extendEffect(loserEffects.lockoutUntil, punishmentMs, nowMs);

    setDicePvpEffects(db, {
      userId: winnerId,
      doubleRollUntil: new Date(winnerDoubleRollUntilMs).toISOString(),
    });
    setDicePvpEffects(db, {
      userId: loserId,
      lockoutUntil: new Date(loserLockoutUntilMs).toISOString(),
    });
    updateDicePvpStats(db, { userId: winnerId, wins: 1 });
    updateDicePvpStats(db, { userId: loserId, losses: 1 });

    return {
      resolved: true as const,
      type: "win" as const,
      winnerId,
      loserId,
      winnerDoubleRollUntilMs,
      loserLockoutUntilMs,
    };
  })();

  if (!outcome.resolved) {
    return alreadyHandledReply();
  }

  if (outcome.type === "draw") {
    return {
      kind: "update",
      payload: {
        content: buildDrawResultContent(
          resolvedChallenge,
          challengerRoll,
          opponentRoll,
          duelDieSides,
        ),
        components: [],
      },
    };
  }

  return {
    kind: "update",
    payload: {
      content: buildWinResultContent(
        resolvedChallenge,
        challengerRoll,
        opponentRoll,
        duelDieSides,
        outcome.winnerId,
        outcome.loserId,
        outcome.winnerDoubleRollUntilMs,
        outcome.loserLockoutUntilMs,
      ),
      components: [],
    },
  };
};

const handleChallengeDecline = (
  db: SqliteDatabase,
  actorId: string,
  challengeId: string | undefined,
  nowMs: number,
): InteractionResult => {
  if (!challengeId) {
    return {
      kind: "reply",
      payload: {
        content: "Invalid challenge id.",
        ephemeral: true,
      },
    };
  }

  const challenge = getDicePvpChallenge(db, challengeId);
  if (!challenge) {
    return {
      kind: "reply",
      payload: {
        content: "Challenge not found.",
        ephemeral: true,
      },
    };
  }

  if (challenge.status !== "pending") {
    return {
      kind: "reply",
      payload: {
        content: `This challenge is already ${challenge.status}.`,
        ephemeral: true,
      },
    };
  }

  if (isDicePvpChallengeExpired(challenge, nowMs)) {
    const markedExpired = setDicePvpChallengeStatusFromPending(db, challenge.id, "expired");
    if (!markedExpired) {
      return alreadyHandledReply();
    }

    return {
      kind: "update",
      payload: {
        content: buildExpiredChallengeContent(challenge),
        components: [],
      },
    };
  }

  if (challenge.opponentId === dicePvpOpenOpponentId) {
    if (actorId !== challenge.challengerId) {
      return {
        kind: "reply",
        payload: {
          content: "Only the challenger can cancel an open challenge.",
          ephemeral: true,
        },
      };
    }
  } else if (actorId !== challenge.opponentId) {
    return {
      kind: "reply",
      payload: {
        content: "Only the challenged user can decline.",
        ephemeral: true,
      },
    };
  }

  const challengerLockoutUntil = getActiveDiceLockout(db, challenge.challengerId, nowMs);
  if (challengerLockoutUntil) {
    return cancelChallengeForLockout(db, challenge, challenge.challengerId, challengerLockoutUntil);
  }

  if (challenge.opponentId !== dicePvpOpenOpponentId) {
    const opponentLockoutUntil = getActiveDiceLockout(db, challenge.opponentId, nowMs);
    if (opponentLockoutUntil) {
      return cancelChallengeForLockout(db, challenge, challenge.opponentId, opponentLockoutUntil);
    }
  }

  const declined = setDicePvpChallengeStatusFromPending(db, challenge.id, "declined");
  if (!declined) {
    return alreadyHandledReply();
  }

  return {
    kind: "update",
    payload: {
      content: buildDeclinedChallengeContent(challenge),
      components: [],
    },
  };
};

const alreadyHandledReply = (): InteractionResult => {
  return {
    kind: "reply",
    payload: {
      content: "This challenge was already handled.",
      ephemeral: true,
    },
  };
};

const cancelledByTierUpdate = (): InteractionResult => {
  return {
    kind: "update",
    payload: {
      content:
        "Challenge cancelled. Both players must have the selected duel die unlocked at acceptance time.",
      components: [],
    },
  };
};

const cancelChallengeForLockout = (
  db: SqliteDatabase,
  challenge: DicePvpChallenge,
  lockedUserId: string,
  lockoutUntil: number,
): InteractionResult => {
  const cancelled = setDicePvpChallengeStatusFromPending(db, challenge.id, "cancelled");
  if (!cancelled) {
    return alreadyHandledReply();
  }

  return {
    kind: "update",
    payload: {
      content: buildLockoutCancellationContent(lockedUserId, lockoutUntil),
      components: [],
    },
  };
};

const extendEffect = (currentUntil: string | null, durationMs: number, nowMs: number): number => {
  const currentMs = currentUntil ? Date.parse(currentUntil) : Number.NaN;
  const base = Number.isNaN(currentMs) ? nowMs : Math.max(nowMs, currentMs);
  return base + durationMs;
};

const rollDie = (dieSides: number): number => {
  return Math.floor(Math.random() * dieSides) + 1;
};
