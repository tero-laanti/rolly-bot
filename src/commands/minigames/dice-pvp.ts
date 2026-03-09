import { randomUUID } from "node:crypto";
import { SlashCommandBuilder } from "discord.js";
import type { ButtonInteraction, ChatInputCommandInteraction } from "discord.js";
import { getDatabase } from "../../lib/db";
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
  dicePvpButtonPrefix,
  formatRelativeTime,
} from "../../lib/minigames/dice-pvp-output";
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
  updateDicePvpStats,
  type DicePvpChallenge,
} from "../../lib/minigames/dice-game";

export { dicePvpButtonPrefix };

export const data = new SlashCommandBuilder()
  .setName("dice-pvp")
  .setDescription("Challenge another user to a dice duel.")
  .addUserOption((option) =>
    option.setName("opponent").setDescription("The user you want to challenge.").setRequired(false),
  );

export const execute = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  const db = getDatabase();
  const challengerId = interaction.user.id;
  const opponent = interaction.options.getUser("opponent");
  const nowMs = Date.now();

  const lockoutUntil = getActiveDiceLockout(db, challengerId, nowMs);
  if (lockoutUntil) {
    await interaction.reply({
      content: `You can play again ${formatRelativeTime(lockoutUntil)}.`,
      ephemeral: true,
    });
    return;
  }

  if (opponent) {
    if (opponent.id === challengerId) {
      await interaction.reply({
        content: "Select another user. You cannot challenge yourself.",
        ephemeral: true,
      });
      return;
    }

    if (opponent.bot) {
      await interaction.reply({
        content: "You can only challenge human players.",
        ephemeral: true,
      });
      return;
    }
  }

  const maxTier = getUnlockedDicePvpTier(db, challengerId);

  await interaction.reply({
    content: buildSetupContent(opponent?.id ?? null),
    components: buildTierSelectionComponents(challengerId, opponent?.id ?? null, maxTier),
    ephemeral: true,
  });
};

export const handleDicePvpButton = async (interaction: ButtonInteraction): Promise<void> => {
  const [prefix, action, ...parts] = interaction.customId.split(":");
  if (prefix !== dicePvpButtonPrefix.slice(0, -1)) {
    return;
  }

  if (action === "pick") {
    await handleTierPick(interaction, parts);
    return;
  }

  if (action === "accept") {
    await handleChallengeAccept(interaction, parts[0]);
    return;
  }

  if (action === "decline") {
    await handleChallengeDecline(interaction, parts[0]);
    return;
  }

  await interaction.reply({
    content: "Unknown PvP action.",
    ephemeral: true,
  });
};

const handleTierPick = async (interaction: ButtonInteraction, parts: string[]) => {
  const ownerId = parts[0];
  const opponentToken = parts[1];
  const tierRaw = parts[2];

  if (!ownerId || !opponentToken || !tierRaw) {
    await interaction.reply({
      content: "Invalid challenge setup.",
      ephemeral: true,
    });
    return;
  }

  if (interaction.user.id !== ownerId) {
    await interaction.reply({
      content: "This PvP setup is not assigned to you.",
      ephemeral: true,
    });
    return;
  }

  const duelTier = Number.parseInt(tierRaw, 10);
  if (!Number.isInteger(duelTier)) {
    await interaction.reply({
      content: "Invalid duel die.",
      ephemeral: true,
    });
    return;
  }

  const db = getDatabase();
  const nowMs = Date.now();
  const opponentId = decodeDicePvpOpponentToken(opponentToken);
  const lockoutUntil = getActiveDiceLockout(db, ownerId, nowMs);
  if (lockoutUntil) {
    await interaction.update({
      content: `You can play again ${formatRelativeTime(lockoutUntil)}.`,
      components: [],
    });
    return;
  }

  if (opponentId !== dicePvpOpenOpponentId) {
    const opponentLockoutUntil = getActiveDiceLockout(db, opponentId, nowMs);
    if (opponentLockoutUntil) {
      await interaction.update({
        content: `<@${opponentId}> can play again ${formatRelativeTime(opponentLockoutUntil)}.`,
        components: [],
      });
      return;
    }
  }

  const maxTier = getUnlockedDicePvpTier(db, ownerId);
  if (duelTier < 1 || duelTier > maxTier) {
    await interaction.reply({
      content: "That duel die is not unlocked yet.",
      ephemeral: true,
    });
    return;
  }

  const channel = interaction.channel;
  if (!channel || !("send" in channel)) {
    await interaction.update({
      content: "Cannot create a public challenge in this channel.",
      components: [],
    });
    return;
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
    await interaction.update({
      content: buildPendingConflictContent(createResult, ownerId, opponentId),
      components: [],
    });
    return;
  }

  let challengeMessageUrl: string | null = null;
  try {
    const challengeMessage = await channel.send({
      content: buildChallengeContent(ownerId, opponentId, duelTier, expiresAtMs),
      components: [buildChallengeActionRow(challengeId, opponentId === dicePvpOpenOpponentId)],
    });
    challengeMessageUrl = challengeMessage.url;
  } catch {
    setDicePvpChallengeStatusFromPending(db, challengeId, "cancelled");
  }

  if (!challengeMessageUrl) {
    await interaction.update({
      content: "Failed to post the challenge in this channel.",
      components: [],
    });
    return;
  }

  await interaction.update({
    content: `Challenge created: ${challengeMessageUrl}`,
    components: [],
  });
};

const handleChallengeAccept = async (
  interaction: ButtonInteraction,
  challengeId: string | undefined,
): Promise<void> => {
  if (!challengeId) {
    await interaction.reply({
      content: "Invalid challenge id.",
      ephemeral: true,
    });
    return;
  }

  const db = getDatabase();
  const challenge = getDicePvpChallenge(db, challengeId);
  if (!challenge) {
    await interaction.reply({
      content: "Challenge not found.",
      ephemeral: true,
    });
    return;
  }

  if (challenge.status !== "pending") {
    await interaction.reply({
      content: `This challenge is already ${challenge.status}.`,
      ephemeral: true,
    });
    return;
  }

  const nowMs = Date.now();
  if (isDicePvpChallengeExpired(challenge, nowMs)) {
    const markedExpired = setDicePvpChallengeStatusFromPending(db, challenge.id, "expired");
    if (!markedExpired) {
      await interaction.reply({
        content: "This challenge was already handled.",
        ephemeral: true,
      });
      return;
    }

    await interaction.update({
      content: buildExpiredChallengeContent(challenge),
      components: [],
    });
    return;
  }

  const isOpenChallenge = challenge.opponentId === dicePvpOpenOpponentId;
  let opponentIdForDuel = challenge.opponentId;

  if (isOpenChallenge) {
    if (interaction.user.id === challenge.challengerId) {
      await interaction.reply({
        content: "You cannot accept your own open challenge.",
        ephemeral: true,
      });
      return;
    }
    opponentIdForDuel = interaction.user.id;
  } else if (interaction.user.id !== challenge.opponentId) {
    await interaction.reply({
      content: "Only the challenged user can accept.",
      ephemeral: true,
    });
    return;
  }

  const challengerLockoutUntil = getActiveDiceLockout(db, challenge.challengerId, nowMs);
  if (challengerLockoutUntil) {
    await cancelChallengeForLockout(
      interaction,
      db,
      challenge,
      challenge.challengerId,
      challengerLockoutUntil,
    );
    return;
  }

  const opponentLockoutUntil = getActiveDiceLockout(db, opponentIdForDuel, nowMs);
  if (opponentLockoutUntil) {
    if (isOpenChallenge) {
      await interaction.reply({
        content: `You can play again ${formatRelativeTime(opponentLockoutUntil)}.`,
        ephemeral: true,
      });
      return;
    }

    await cancelChallengeForLockout(
      interaction,
      db,
      challenge,
      opponentIdForDuel,
      opponentLockoutUntil,
    );
    return;
  }

  const challengerTier = getUnlockedDicePvpTier(db, challenge.challengerId);
  if (challengerTier < challenge.duelTier) {
    const cancelled = setDicePvpChallengeStatusFromPending(db, challenge.id, "cancelled");
    if (!cancelled) {
      await interaction.reply({
        content: "This challenge was already handled.",
        ephemeral: true,
      });
      return;
    }

    await interaction.update({
      content:
        "Challenge cancelled. Both players must have the selected duel die unlocked at acceptance time.",
      components: [],
    });
    return;
  }

  const opponentTier = getUnlockedDicePvpTier(db, opponentIdForDuel);
  if (opponentTier < challenge.duelTier) {
    if (isOpenChallenge) {
      await interaction.reply({
        content: "You do not have this duel die unlocked yet.",
        ephemeral: true,
      });
      return;
    }

    const cancelled = setDicePvpChallengeStatusFromPending(db, challenge.id, "cancelled");
    if (!cancelled) {
      await interaction.reply({
        content: "This challenge was already handled.",
        ephemeral: true,
      });
      return;
    }

    await interaction.update({
      content:
        "Challenge cancelled. Both players must have the selected duel die unlocked at acceptance time.",
      components: [],
    });
    return;
  }

  if (isOpenChallenge) {
    const claimed = setDicePvpChallengeOpponentFromOpen(db, challenge.id, opponentIdForDuel);
    if (!claimed) {
      await interaction.reply({
        content: "This challenge was already handled.",
        ephemeral: true,
      });
      return;
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
    await interaction.reply({
      content: "This challenge was already handled.",
      ephemeral: true,
    });
    return;
  }

  if (outcome.type === "draw") {
    await interaction.update({
      content: buildDrawResultContent(
        resolvedChallenge,
        challengerRoll,
        opponentRoll,
        duelDieSides,
      ),
      components: [],
    });
    return;
  }

  await interaction.update({
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
  });
};

const handleChallengeDecline = async (
  interaction: ButtonInteraction,
  challengeId: string | undefined,
): Promise<void> => {
  if (!challengeId) {
    await interaction.reply({
      content: "Invalid challenge id.",
      ephemeral: true,
    });
    return;
  }

  const db = getDatabase();
  const challenge = getDicePvpChallenge(db, challengeId);
  if (!challenge) {
    await interaction.reply({
      content: "Challenge not found.",
      ephemeral: true,
    });
    return;
  }

  if (challenge.status !== "pending") {
    await interaction.reply({
      content: `This challenge is already ${challenge.status}.`,
      ephemeral: true,
    });
    return;
  }

  const nowMs = Date.now();
  if (isDicePvpChallengeExpired(challenge, nowMs)) {
    const markedExpired = setDicePvpChallengeStatusFromPending(db, challenge.id, "expired");
    if (!markedExpired) {
      await interaction.reply({
        content: "This challenge was already handled.",
        ephemeral: true,
      });
      return;
    }

    await interaction.update({
      content: buildExpiredChallengeContent(challenge),
      components: [],
    });
    return;
  }

  if (challenge.opponentId === dicePvpOpenOpponentId) {
    if (interaction.user.id !== challenge.challengerId) {
      await interaction.reply({
        content: "Only the challenger can cancel an open challenge.",
        ephemeral: true,
      });
      return;
    }
  } else if (interaction.user.id !== challenge.opponentId) {
    await interaction.reply({
      content: "Only the challenged user can decline.",
      ephemeral: true,
    });
    return;
  }

  const challengerLockoutUntil = getActiveDiceLockout(db, challenge.challengerId, nowMs);
  if (challengerLockoutUntil) {
    await cancelChallengeForLockout(
      interaction,
      db,
      challenge,
      challenge.challengerId,
      challengerLockoutUntil,
    );
    return;
  }

  if (challenge.opponentId !== dicePvpOpenOpponentId) {
    const opponentLockoutUntil = getActiveDiceLockout(db, challenge.opponentId, nowMs);
    if (opponentLockoutUntil) {
      await cancelChallengeForLockout(
        interaction,
        db,
        challenge,
        challenge.opponentId,
        opponentLockoutUntil,
      );
      return;
    }
  }

  const declined = setDicePvpChallengeStatusFromPending(db, challenge.id, "declined");
  if (!declined) {
    await interaction.reply({
      content: "This challenge was already handled.",
      ephemeral: true,
    });
    return;
  }

  await interaction.update({
    content: buildDeclinedChallengeContent(challenge),
    components: [],
  });
};

const cancelChallengeForLockout = async (
  interaction: ButtonInteraction,
  db: ReturnType<typeof getDatabase>,
  challenge: DicePvpChallenge,
  lockedUserId: string,
  lockoutUntil: number,
): Promise<void> => {
  const cancelled = setDicePvpChallengeStatusFromPending(db, challenge.id, "cancelled");
  if (!cancelled) {
    await interaction.reply({
      content: "This challenge was already handled.",
      ephemeral: true,
    });
    return;
  }

  await interaction.update({
    content: buildLockoutCancellationContent(lockedUserId, lockoutUntil),
    components: [],
  });
};

const extendEffect = (currentUntil: string | null, durationMs: number, nowMs: number): number => {
  const currentMs = currentUntil ? Date.parse(currentUntil) : Number.NaN;
  const base = Number.isNaN(currentMs) ? nowMs : Math.max(nowMs, currentMs);
  return base + durationMs;
};

const rollDie = (dieSides: number): number => {
  return Math.floor(Math.random() * dieSides) + 1;
};
