import {
  discordMessageCharacterLimit,
  formatDiscordFullTime,
  formatDiscordRelativeTime,
  truncateDiscordText,
} from "../../../../shared/discord";
import { truncateWithSuffix } from "../../../../shared/text";
import { createContractProgress } from "../../domain/progress";
import { getContractRotationResetAt } from "../../domain/rotation";
import type { ContractProgress } from "../../domain/progress";
import type { ContractDefinition } from "../../domain/types";
import type { ContractsProgressRepository, ContractsRotationResolver } from "../ports";

const fullTitleMaxLength = 72;
const compactTitleMaxLength = 56;
const fullDescriptionMaxLength = 180;
const compactDescriptionMaxLength = 96;
const trimmedSuffix = "\n...";

export type DiceContractsView = {
  content: string;
  ephemeral: boolean;
};

type QueryContractsDependencies = {
  rotationResolver: Pick<ContractsRotationResolver, "resolveActiveRotation"> | null;
  progressRepository: Pick<ContractsProgressRepository, "getProgress"> | null;
};

type QueryContractsInput = {
  userId: string;
  userMention?: string;
  now?: Date;
};

type ContractEntryView = {
  title: string;
  description: string;
  progressLabel: string;
  rewardLabel: string;
  statusLabel: string;
};

type ContractSectionView = {
  title: string;
  resetAt: Date;
  entries: ContractEntryView[];
};

const renderRewardLabel = (progress: ContractProgress): string => {
  const parts: string[] = [];
  if (progress.reward.pips > 0) {
    parts.push(`${progress.reward.pips} Pip${progress.reward.pips === 1 ? "" : "s"}`);
  }
  if (progress.reward.fame > 0) {
    parts.push(`${progress.reward.fame} Fame`);
  }

  return parts.join(" + ");
};

const getStatusLabel = (progress: ContractProgress): string => {
  if (progress.rewardedAt) {
    return "Auto-claimed";
  }
  if (progress.completedAt) {
    return "Completed";
  }
  if (progress.currentCount > 0) {
    return "In progress";
  }
  return "Not started";
};

const buildContractEntryView = (
  contract: ContractDefinition,
  progress: ContractProgress,
): ContractEntryView => {
  return {
    title: contract.title,
    description: contract.description,
    progressLabel: `${progress.currentCount}/${progress.requiredCount}`,
    rewardLabel: renderRewardLabel(progress),
    statusLabel: getStatusLabel(progress),
  };
};

const renderContractEntry = (
  entry: ContractEntryView,
  {
    titleMaxLength,
    descriptionMaxLength,
    includeDescription,
  }: {
    titleMaxLength: number;
    descriptionMaxLength: number;
    includeDescription: boolean;
  },
): string[] => {
  const lines = [
    `- **${truncateDiscordText(entry.title, titleMaxLength)}**`,
    `  Progress: ${entry.progressLabel} | Reward: ${entry.rewardLabel} | Status: ${entry.statusLabel}`,
  ];

  if (includeDescription) {
    lines.splice(1, 0, `  ${truncateDiscordText(entry.description, descriptionMaxLength)}`);
  }

  return lines;
};

const renderContractSection = (
  section: ContractSectionView,
  options: {
    titleMaxLength: number;
    descriptionMaxLength: number;
    includeDescription: boolean;
  },
): string => {
  const header = [
    `**${section.title}**`,
    `Resets ${formatDiscordRelativeTime(section.resetAt.getTime())} (${formatDiscordFullTime(section.resetAt.getTime())})`,
  ];

  if (section.entries.length < 1) {
    return [...header, "No active contracts right now."].join("\n");
  }

  return [
    ...header,
    ...section.entries.flatMap((entry) => renderContractEntry(entry, options)),
  ].join("\n");
};

const renderContractsContent = (
  userMention: string,
  daily: ContractSectionView,
  weekly: ContractSectionView,
  options: {
    titleMaxLength: number;
    descriptionMaxLength: number;
    includeDescription: boolean;
  },
): string => {
  return [
    `**Rolly Contracts for ${userMention}**`,
    renderContractSection(daily, options),
    renderContractSection(weekly, options),
  ].join("\n\n");
};

const buildContentWithinLimit = (
  userMention: string,
  daily: ContractSectionView,
  weekly: ContractSectionView,
): string => {
  const fullContent = renderContractsContent(userMention, daily, weekly, {
    titleMaxLength: fullTitleMaxLength,
    descriptionMaxLength: fullDescriptionMaxLength,
    includeDescription: true,
  });
  if (fullContent.length <= discordMessageCharacterLimit) {
    return fullContent;
  }

  const compactContent = renderContractsContent(userMention, daily, weekly, {
    titleMaxLength: compactTitleMaxLength,
    descriptionMaxLength: compactDescriptionMaxLength,
    includeDescription: true,
  });
  if (compactContent.length <= discordMessageCharacterLimit) {
    return compactContent;
  }

  const noDescriptionContent = renderContractsContent(userMention, daily, weekly, {
    titleMaxLength: compactTitleMaxLength,
    descriptionMaxLength: 0,
    includeDescription: false,
  });
  return truncateWithSuffix(noDescriptionContent, discordMessageCharacterLimit, trimmedSuffix);
};

const createUnavailableContractsReply = (): DiceContractsView => {
  return {
    content:
      "**Rolly Contracts**\nContracts are currently unavailable on this bot. Add `contracts.v2.json` to the active rolly-data source to enable /contracts.",
    ephemeral: false,
  };
};

export const createQueryContractsUseCase = ({
  rotationResolver,
  progressRepository,
}: QueryContractsDependencies) => {
  const createContractsReply = ({
    userId,
    userMention = `<@${userId}>`,
    now = new Date(),
  }: QueryContractsInput): DiceContractsView => {
    if (!rotationResolver || !progressRepository) {
      return createUnavailableContractsReply();
    }

    const rotation = rotationResolver.resolveActiveRotation(now);
    const buildSection = (
      title: string,
      cadence: ContractDefinition["cadence"],
      periodKey: string,
      contracts: ContractDefinition[],
    ): ContractSectionView => {
      return {
        title,
        resetAt: getContractRotationResetAt(cadence, periodKey),
        entries: contracts.map((contract) => {
          const progress =
            progressRepository.getProgress(userId, contract.id, contract.cadence, periodKey) ??
            createContractProgress(contract);
          return buildContractEntryView(contract, progress);
        }),
      };
    };

    const daily = buildSection(
      "Daily Contracts",
      "daily",
      rotation.daily.periodKey,
      rotation.daily.contracts,
    );
    const weekly = buildSection(
      "Weekly Contracts",
      "weekly",
      rotation.weekly.periodKey,
      rotation.weekly.contracts,
    );

    return {
      content: buildContentWithinLimit(userMention, daily, weekly),
      ephemeral: false,
    };
  };

  return {
    createContractsReply,
  };
};
