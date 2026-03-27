import type { DiceAnalyticsRepository } from "../ports";
import type { DiceEconomyRepository } from "../../../economy/application/ports";
import type { DicePermanentBonusesPort } from "../../../inventory/application/ports";
import type { DiceItemEffectsService } from "../../../inventory/application/item-effects-service";
import type { DiceProgressionRepository } from "../../../progression/application/ports";
import type { DicePvpRepository } from "../../../pvp/application/ports";
import {
  createDiceRollModifierState,
  formatMultiplierFactor,
} from "../../../progression/application/roll-status";
import {
  getDiceBanStep,
  getUnlockedBanSlotsFromFame,
} from "../../../progression/domain/game-rules";
import { discordMessageCharacterLimit } from "../../../../shared/discord";
import { formatDurationWords, truncateWithSuffix } from "../../../../shared/text";

export type DiceStatsView = {
  content: string;
  ephemeral: boolean;
};

type QueryDiceStatsDependencies = {
  analytics: Pick<DiceAnalyticsRepository, "getDiceAnalytics">;
  economy: Pick<DiceEconomyRepository, "getEconomySnapshot">;
  itemEffects: Pick<DiceItemEffectsService, "getItemDoubleRollStatus">;
  permanentBonuses: Pick<DicePermanentBonusesPort, "getPermanentBonuses">;
  progression: Pick<
    DiceProgressionRepository,
    | "getActiveDicePrestige"
    | "getActiveDiceTemporaryEffects"
    | "getDiceBans"
    | "getDiceCount"
    | "getDicePrestige"
    | "getDiceSides"
    | "getLastDiceRollAt"
    | "getLastPersonalDiceRollAt"
  >;
  pvp: Pick<DicePvpRepository, "getActiveDoubleRoll">;
};

type QueryDiceStatsInput = {
  userId: string;
  userMention: string;
  nowMs?: number;
};

export const createQueryDiceStatsUseCase = ({
  analytics,
  economy,
  itemEffects,
  permanentBonuses,
  progression,
  pvp,
}: QueryDiceStatsDependencies) => {
  return ({ userId, userMention, nowMs = Date.now() }: QueryDiceStatsInput): DiceStatsView => {
    const analyticsView = analytics.getDiceAnalytics(userId);
    const balance = economy.getEconomySnapshot(userId);
    const dieSides = progression.getDiceSides(userId);
    const diceCount = progression.getDiceCount(userId);
    const highestPrestige = progression.getDicePrestige(userId);
    const activePrestige = progression.getActiveDicePrestige(userId);
    const bans = progression.getDiceBans(userId);
    const permanentBonusSnapshot = permanentBonuses.getPermanentBonuses(userId);
    const pvpDoubleRollUntil = pvp.getActiveDoubleRoll(userId, nowMs);
    const itemDoubleRollStatus = itemEffects.getItemDoubleRollStatus(userId, nowMs);
    const modifierState = createDiceRollModifierState({
      prestige: highestPrestige,
      lastGlobalRollAtMs: progression.getLastDiceRollAt(),
      lastPersonalRollAtMs: progression.getLastPersonalDiceRollAt(userId),
      personalChargeBonus: permanentBonusSnapshot.personalCharge,
      pvpDoubleRollUntilMs: pvpDoubleRollUntil,
      itemDoubleRollStatus,
      temporaryEffects: progression.getActiveDiceTemporaryEffects({
        userId,
        nowMs,
        commandName: "dice",
      }),
      nowMs,
    });
    const unlockedBanSlots =
      getUnlockedBanSlotsFromFame(balance.fame, diceCount, dieSides) +
      permanentBonusSnapshot.extraBanSlots;

    const lines = [
      `**Rolly Stats for ${userMention}**`,
      `Economy: ${balance.fame} Fame | ${balance.pips} Pips.`,
      `Progression: ${formatDiceCount(diceCount)} on D${dieSides} | active prestige ${activePrestige} | highest prestige ${highestPrestige}.`,
      `Bans: ${countUsedBans(bans)}/${unlockedBanSlots} used | ${formatNextBanUnlock(balance.fame)} | ${formatCompactBansSummary(bans)}.`,
      `Permanent bonuses: ${formatPermanentBonuses(permanentBonusSnapshot)}.`,
      `Active roll status: ${formatActiveRollStatus(modifierState, pvpDoubleRollUntil, nowMs)}.`,
      `Current /roll power: ×${formatMultiplierFactor(modifierState.effectiveFactor)}.`,
      `Time at current dice count: ${formatElapsed(analyticsView.diceCountStartedAt, nowMs)}.`,
      `Current-dice analytics: ${analyticsView.rollSetsCurrentDiceCount} sets | ${analyticsView.nearDiceCountIncreaseRollSetsCurrentDiceCount} one-offs.`,
      `Time on current prestige: ${formatElapsed(analyticsView.prestigeStartedAt, nowMs)}.`,
      `Current-prestige analytics: ${analyticsView.diceRolledCurrentPrestige} dice rolled.`,
      `Lifetime analytics: ${analyticsView.totalDiceRolled} dice rolled | ${analyticsView.totalDiceSetsRolled} sets | ${analyticsView.totalRollCommandsCalled} /roll calls.`,
      `PvP stats: ${analyticsView.pvpWins}W / ${analyticsView.pvpLosses}L / ${analyticsView.pvpDraws}D.`,
    ];
    const content = truncateWithSuffix(lines.join("\n"), discordMessageCharacterLimit, "\n...");

    return {
      content,
      ephemeral: false,
    };
  };
};

const countUsedBans = (bans: Map<number, Set<number>>): number => {
  let count = 0;
  for (const values of bans.values()) {
    count += values.size;
  }

  return count;
};

const formatCompactBansSummary = (bans: Map<number, Set<number>>): string => {
  const entries = Array.from(bans.entries())
    .filter(([, values]) => values.size > 0)
    .sort((a, b) => a[0] - b[0]);

  if (entries.length < 1) {
    return "current bans none";
  }

  const parts = entries.map(([dieIndex, values]) => {
    const list = Array.from(values.values()).sort((a, b) => a - b);
    return `D${dieIndex}: ${list.join(", ")}`;
  });

  return truncateWithSuffix(parts.join(" | "), 280, "...");
};

const formatNextBanUnlock = (fame: number): string => {
  const banStep = getDiceBanStep();
  if (banStep <= 0) {
    return "next Fame unlock unavailable";
  }

  const nextUnlockAt = (Math.floor(fame / banStep) + 1) * banStep;
  const remainingFame = Math.max(0, nextUnlockAt - fame);
  return `next Fame unlock at ${nextUnlockAt} (+${remainingFame})`;
};

const formatPermanentBonuses = (
  bonuses: ReturnType<DicePermanentBonusesPort["getPermanentBonuses"]>,
): string => {
  const parts: string[] = [];

  if (bonuses.extraBanSlots > 0) {
    parts.push(`+${bonuses.extraBanSlots} ban slot${bonuses.extraBanSlots === 1 ? "" : "s"}`);
  }

  if (bonuses.pipRewardBonusPercent > 0) {
    parts.push(`+${bonuses.pipRewardBonusPercent}% pip rewards`);
  }

  if (bonuses.personalCharge.unlocked) {
    parts.push(
      `personal charge every ${formatMinutes(bonuses.personalCharge.minutesPerMultiplier)} up to ×${bonuses.personalCharge.maxMultiplier}`,
    );
  }

  return parts.length > 0 ? parts.join(" | ") : "none";
};

const formatActiveRollStatus = (
  modifierState: ReturnType<typeof createDiceRollModifierState>,
  pvpDoubleRollUntil: number | null,
  nowMs: number,
): string => {
  const parts: string[] = [];

  if (modifierState.globalChargeMultiplier > 1) {
    parts.push(`global charge ×${formatMultiplierFactor(modifierState.globalChargeMultiplier)}`);
  }

  if (modifierState.personalChargeMultiplier > 1) {
    parts.push(
      `personal charge ×${formatMultiplierFactor(modifierState.personalChargeMultiplier)}`,
    );
  }

  if (modifierState.combinedChargeMultiplier > 1) {
    parts.push(`current charge ×${formatMultiplierFactor(modifierState.combinedChargeMultiplier)}`);
  }

  if (modifierState.hasActivePvpDoubleRoll) {
    parts.push(`PvP double ×2 for ${formatRemainingDuration(pvpDoubleRollUntil, nowMs)}`);
  }

  if (modifierState.hasActiveItemDoubleRoll) {
    parts.push(formatItemDoubleRollStatus(modifierState.itemDoubleRollStatus, nowMs));
  }

  if (modifierState.temporaryEffectsRollSummary.multiplier > 1) {
    parts.push(`temporary buffs ×${modifierState.temporaryEffectsRollSummary.multiplier}`);
  }

  if (modifierState.temporaryEffectsRollSummary.divisor > 1) {
    parts.push(`temporary penalties ÷${modifierState.temporaryEffectsRollSummary.divisor}`);
  }

  return parts.length > 0 ? parts.join(" | ") : "none";
};

const formatItemDoubleRollStatus = (
  status: DiceItemEffectsService["getItemDoubleRollStatus"] extends (
    userId: string,
    nowMs?: number,
  ) => infer TReturn
    ? TReturn
    : never,
  nowMs: number,
): string => {
  const details: string[] = [];
  if (status.remainingUses > 0) {
    details.push(`${status.remainingUses} use${status.remainingUses === 1 ? "" : "s"}`);
  }

  if (status.expiresAtMs !== null && status.expiresAtMs > nowMs) {
    details.push(`for ${formatRemainingDuration(status.expiresAtMs, nowMs)}`);
  }

  if (details.length < 1) {
    return "item double active";
  }

  if (details.length === 1) {
    return `item double ${details[0]}`;
  }

  return `item double ${details[0]} ${details.slice(1).join(" ")}`;
};

const formatRemainingDuration = (endMs: number | null, nowMs: number): string => {
  if (endMs === null || endMs <= nowMs) {
    return "0 seconds";
  }

  return formatDurationWords(endMs - nowMs);
};

const formatMinutes = (value: number): string => {
  const normalized = Math.max(1, Math.round(value));
  return `${normalized} minute${normalized === 1 ? "" : "s"}`;
};

const formatDiceCount = (value: number): string => {
  return `${value} ${value === 1 ? "die" : "dice"}`;
};

const formatElapsed = (startedAtIso: string, nowMs: number): string => {
  const startedAtMs = Date.parse(startedAtIso);
  if (Number.isNaN(startedAtMs)) {
    return "Unknown";
  }

  return formatDurationWords(Math.max(0, nowMs - startedAtMs), { includeDays: true });
};
