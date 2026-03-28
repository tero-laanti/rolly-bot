import {
  discordMessageCharacterLimit,
  formatDiscordFullTime,
  formatDiscordRelativeTime,
  truncateDiscordText,
} from "../../../../shared/discord";
import { truncateWithSuffix } from "../../../../shared/text";
import type { QueryContractsDependencies } from "../ports";
import type { ContractCadenceView } from "../ports";

const descriptionMaxLength = 180;
const trimmedSuffix = "\n...";

export type DiceContractsView = {
  content: string;
  ephemeral: boolean;
};

type QueryContractsInput = {
  userId: string;
  userMention?: string;
  now?: Date;
};

const formatRerollStatus = (view: ContractCadenceView): string => {
  return view.offers
    .map((offer) => `${offer.label}: ${offer.rerollUsed ? "used" : "ready"}`)
    .join(" | ");
};

const formatRefillStatus = (view: ContractCadenceView): string => {
  if (view.completionCount < 1) {
    return "Locked until your first completion.";
  }

  if (view.completionCount >= 2) {
    return "Exhausted for this reset window.";
  }

  if (view.refillClaimed) {
    return `Claimed from ${view.refillAvailableDifficulty ?? "unknown"} difficulty.`;
  }

  return `Available for ${view.refillAvailableDifficulty ?? "unknown"} difficulty.`;
};

const renderActiveRun = (view: ContractCadenceView): string[] => {
  if (!view.activeRun) {
    return ["No accepted contract right now."];
  }

  const progressLabel = `${view.activeRun.currentCount}/${view.activeRun.requiredCount}`;
  const statusLabel = view.activeRun.completedAt ? "Completed" : "In progress";

  return [
    `**${truncateDiscordText(view.activeRun.contractTitle, 72)}**`,
    truncateDiscordText(view.activeRun.contractDescription, descriptionMaxLength),
    `Difficulty: ${view.activeRun.difficulty} | Progress: ${progressLabel} | Reward: ${view.activeRun.rewardPips} Pips | Status: ${statusLabel}`,
  ];
};

const renderCadenceSection = (view: ContractCadenceView): string => {
  const totalEarnedPips = view.activeRun
    ? view.activeRun.rewardGrantedAt
      ? view.activeRun.rewardPips
      : 0
    : 0;

  return [
    `**${view.label} Contracts**`,
    `Resets ${formatDiscordRelativeTime(view.resetAt.getTime())} (${formatDiscordFullTime(view.resetAt.getTime())})`,
    ...renderActiveRun(view),
    `Completed this window: ${view.completionCount}/2`,
    `Rerolls: ${formatRerollStatus(view)}`,
    `Refill: ${formatRefillStatus(view)}`,
    `Pips granted from current accepted run: ${totalEarnedPips}`,
  ].join("\n");
};

const createUnavailableContractsReply = (): DiceContractsView => ({
  content:
    "**Rolly Contracts**\nContracts are currently unavailable on this bot. Add `contracts.v2.json` to the active rolly-data source to enable /contracts.",
  ephemeral: false,
});

export const createQueryContractsUseCase = ({ cadenceResolver }: QueryContractsDependencies) => {
  const createContractsReply = ({
    userId,
    userMention = `<@${userId}>`,
    now = new Date(),
  }: QueryContractsInput): DiceContractsView => {
    if (!cadenceResolver) {
      return createUnavailableContractsReply();
    }

    const daily = cadenceResolver.resolveCadenceView({ userId, cadence: "daily", now });
    const weekly = cadenceResolver.resolveCadenceView({ userId, cadence: "weekly", now });
    const content = [
      `**Rolly Contracts for ${userMention}**`,
      renderCadenceSection(daily),
      renderCadenceSection(weekly),
    ].join("\n\n");

    return {
      content:
        content.length <= discordMessageCharacterLimit
          ? content
          : truncateWithSuffix(content, discordMessageCharacterLimit, trimmedSuffix),
      ephemeral: false,
    };
  };

  return { createContractsReply };
};
