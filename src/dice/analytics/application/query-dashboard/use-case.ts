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
import { truncateWithSuffix } from "../../../../shared/text";
import { secondsPerDay, secondsPerHour, secondsPerMinute } from "../../../../shared/time";

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

    const sections = [
      formatStatsSection("Economy", [`Fame: **${balance.fame}** | Pips: **${balance.pips}**`]),
      formatStatsSection("Progression", [
        `Dice: **${formatDiceCount(diceCount)}** on **D${dieSides}**`,
        `Prestige: active **${activePrestige}** | best **${highestPrestige}**`,
      ]),
      formatStatsSection("Roll Status", [
        `Current /roll power: **×${formatMultiplierFactor(modifierState.effectiveFactor)}**`,
        `Charge: ${formatChargeStatus(modifierState)}`,
        `Double rolls: ${formatDoubleRollStatus(modifierState, pvpDoubleRollUntil, nowMs)}`,
        `Temporary effects: ${formatTemporaryEffectsStatus(modifierState)}`,
        ...formatPermanentBonusesLine(permanentBonusSnapshot),
      ]),
      formatStatsSection("Bans", [
        `Ban slots: **${countUsedBans(bans)}/${unlockedBanSlots}** used`,
        `Next unlock: **${formatNextBanUnlock(balance.fame)}**`,
        `Current bans: ${formatCompactBansSummary(bans)}`,
      ]),
      formatStatsSection("Analytics", [
        `Current dice: **${formatElapsed(analyticsView.diceCountStartedAt, nowMs)}** | **${analyticsView.rollSetsCurrentDiceCount}** sets | **${analyticsView.nearDiceCountIncreaseRollSetsCurrentDiceCount}** one-offs`,
        `Current prestige: **${formatElapsed(analyticsView.prestigeStartedAt, nowMs)}** | **${analyticsView.diceRolledCurrentPrestige}** dice rolled`,
        `Lifetime: **${analyticsView.totalDiceRolled}** dice | **${analyticsView.totalDiceSetsRolled}** sets | **${analyticsView.totalRollCommandsCalled}** /roll calls`,
        `PvP: **${analyticsView.pvpWins}W / ${analyticsView.pvpLosses}L / ${analyticsView.pvpDraws}D**`,
      ]),
    ];
    const content = truncateWithSuffix(
      [formatStatsHeader(userMention), ...sections].join("\n\n"),
      discordMessageCharacterLimit,
      "\n...",
    );

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

const formatStatsHeader = (userMention: string): string => {
  return `**Rolly Stats for ${userMention}**`;
};

const formatStatsSection = (title: string, lines: string[]): string => {
  return [`**${title}**`, ...lines].join("\n");
};

const formatCompactBansSummary = (bans: Map<number, Set<number>>): string => {
  const entries = Array.from(bans.entries())
    .filter(([, values]) => values.size > 0)
    .sort((a, b) => a[0] - b[0]);

  if (entries.length < 1) {
    return "none";
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
    return "unavailable";
  }

  const nextUnlockAt = (Math.floor(fame / banStep) + 1) * banStep;
  const remainingFame = Math.max(0, nextUnlockAt - fame);
  return `${nextUnlockAt} Fame (+${remainingFame})`;
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
      `personal charge every ${formatMinutes(bonuses.personalCharge.minutesPerMultiplier)}, up to ×${bonuses.personalCharge.maxMultiplier}`,
    );
  }

  return parts.length > 0 ? parts.join(" | ") : "none";
};

const formatDoubleRollStatus = (
  modifierState: ReturnType<typeof createDiceRollModifierState>,
  pvpDoubleRollUntil: number | null,
  nowMs: number,
): string => {
  const parts: string[] = [];

  if (modifierState.hasActivePvpDoubleRoll) {
    parts.push(`PvP double-roll ×2 (${formatRemainingDuration(pvpDoubleRollUntil, nowMs)})`);
  }

  if (modifierState.hasActiveItemDoubleRoll) {
    parts.push(formatItemDoubleRollStatus(modifierState.itemDoubleRollStatus, nowMs));
  }

  return parts.length > 0 ? parts.join(" | ") : "none";
};

const formatTemporaryEffectsStatus = (
  modifierState: ReturnType<typeof createDiceRollModifierState>,
): string => {
  const parts: string[] = [];

  if (modifierState.temporaryEffectsRollSummary.multiplier > 1) {
    parts.push(`buffs ×${modifierState.temporaryEffectsRollSummary.multiplier}`);
  }

  if (modifierState.temporaryEffectsRollSummary.divisor > 1) {
    parts.push(`penalties ÷${modifierState.temporaryEffectsRollSummary.divisor}`);
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
    details.push(`${formatRemainingDuration(status.expiresAtMs, nowMs)}`);
  }

  if (details.length < 1) {
    return "item double-roll ×2";
  }

  return `item double-roll ×2 (${details.join(", ")})`;
};

const formatChargeStatus = (
  modifierState: ReturnType<typeof createDiceRollModifierState>,
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

  if (
    modifierState.globalChargeMultiplier > 1 &&
    modifierState.personalChargeMultiplier > 1 &&
    modifierState.combinedChargeMultiplier > 1
  ) {
    parts.push(`combined ×${formatMultiplierFactor(modifierState.combinedChargeMultiplier)}`);
  }

  return parts.length > 0 ? parts.join(" | ") : "none";
};

const formatRemainingDuration = (endMs: number | null, nowMs: number): string => {
  if (endMs === null || endMs <= nowMs) {
    return "0s";
  }

  return formatCompactDuration(endMs - nowMs);
};

const formatPermanentBonusesLine = (
  bonuses: ReturnType<DicePermanentBonusesPort["getPermanentBonuses"]>,
): string[] => {
  const summary = formatPermanentBonuses(bonuses);
  return summary === "none" ? [] : [`Permanent bonuses: ${summary}`];
};

const formatMinutes = (value: number): string => {
  const normalized = Math.max(1, Math.round(value));
  return `${normalized}m`;
};

const formatDiceCount = (value: number): string => {
  return `${value} ${value === 1 ? "die" : "dice"}`;
};

const formatElapsed = (startedAtIso: string, nowMs: number): string => {
  const startedAtMs = Date.parse(startedAtIso);
  if (Number.isNaN(startedAtMs)) {
    return "unknown";
  }

  return formatCompactDuration(Math.max(0, nowMs - startedAtMs), { includeDays: true });
};

const formatCompactDuration = (
  durationMs: number,
  { includeDays = false }: { includeDays?: boolean } = {},
): string => {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const days = Math.floor(totalSeconds / secondsPerDay);
  const hours = Math.floor((totalSeconds % secondsPerDay) / secondsPerHour);
  const minutes = Math.floor((totalSeconds % secondsPerHour) / secondsPerMinute);
  const seconds = totalSeconds % 60;

  if (includeDays && days > 0) {
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  }

  const totalHours = includeDays ? hours : Math.floor(totalSeconds / secondsPerHour);
  if (totalHours > 0) {
    return minutes > 0 ? `${totalHours}h ${minutes}m` : `${totalHours}h`;
  }

  if (minutes > 0) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }

  return `${seconds}s`;
};
