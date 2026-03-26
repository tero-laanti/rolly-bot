import { EmbedBuilder } from "discord.js";
import {
  discordButtonLabelCharacterLimit,
  discordEmbedDescriptionCharacterLimit,
  formatDiscordRelativeTime,
  truncateDiscordText,
} from "../../../shared/discord";
import type { RandomEventScenario, RandomEventSelectionResult } from "../domain/content";
import type {
  RandomEventRollChallengeDefinition,
  RandomEventRollChallengeProgress,
  RandomEventRollChallengeStepResult,
} from "../domain/roll-challenges";
import type { RandomEventRarityTier } from "../domain/variety";

const randomEventRarityPresentation: Record<
  RandomEventRarityTier,
  { label: string; color: number }
> = {
  common: { label: "Common Event", color: 0x95a5a6 },
  uncommon: { label: "Uncommon Event", color: 0x2ecc71 },
  rare: { label: "Rare Event", color: 0x3498db },
  epic: { label: "Epic Event", color: 0x9b59b6 },
  legendary: { label: "Legendary Event", color: 0xf1c40f },
};

const toActionText = (claimLabel: string): string => {
  const normalized = claimLabel.trim();
  if (normalized.length < 1) {
    return "join";
  }

  return normalized.charAt(0).toLowerCase() + normalized.slice(1);
};

const pickRandomTemplate = (templates: string[]): string | null => {
  if (templates.length < 1) {
    return null;
  }

  const index = Math.floor(Math.random() * templates.length);
  return templates[index] ?? templates[0] ?? null;
};

const maxVisibleParticipantMentions = 5;
const maxVisibleFailureLines = 3;

const formatOverflowLine = (hiddenCount: number, noun: string): string => {
  return `...and ${hiddenCount} more ${noun}${hiddenCount === 1 ? "" : "s"}.`;
};

const formatParticipantMentions = (
  participants: string[],
  maxVisible = maxVisibleParticipantMentions,
): string => {
  const visibleParticipants = participants.slice(0, maxVisible).map((userId) => `<@${userId}>`);
  const hiddenCount = participants.length - visibleParticipants.length;

  if (hiddenCount < 1) {
    return visibleParticipants.join(", ");
  }

  const hiddenLabel = `and ${hiddenCount} more`;
  return `${visibleParticipants.join(", ")}, ${hiddenLabel}`;
};

const formatComparator = (
  comparator: RandomEventRollChallengeStepResult["comparator"],
  target: number,
): string => {
  if (comparator === "eq") {
    return `exactly ${target}`;
  }

  if (comparator === "lte") {
    return `${target} or lower`;
  }

  return `${target} or higher`;
};

const formatSequenceStepLine = (
  stepResult: RandomEventRollChallengeStepResult,
  index: number,
): string => {
  const status = stepResult.succeeded ? "✅" : "❌";
  return `${status} Step ${index + 1}: **${stepResult.label}** — rolled ${stepResult.rolledValue} on d${stepResult.dieSides} (needed ${formatComparator(stepResult.comparator, stepResult.target)}).`;
};

const formatVisibleLines = ({
  lines,
  maxVisible,
  noun,
  takeFromEnd = false,
}: {
  lines: string[];
  maxVisible: number;
  noun: string;
  takeFromEnd?: boolean;
}): string[] => {
  if (maxVisible <= 0 || lines.length < 1) {
    return [];
  }

  const visibleLines = takeFromEnd ? lines.slice(-maxVisible) : lines.slice(0, maxVisible);
  const hiddenCount = lines.length - visibleLines.length;
  if (hiddenCount < 1) {
    return visibleLines;
  }

  return [...visibleLines, formatOverflowLine(hiddenCount, noun)];
};

export const getRandomEventRarityPresentation = (rarity: RandomEventRarityTier) => {
  return randomEventRarityPresentation[rarity];
};

export const getRandomEventEmbedTitle = (
  scenario: RandomEventScenario,
  renderedTitle: string,
): string => {
  return `${randomEventRarityPresentation[scenario.rarity].label} • ${renderedTitle}`;
};

export const buildClaimActivityLine = (
  scenario: RandomEventScenario,
  userId: string,
  claimLabel: string,
  mode: "did" | "already-ready",
): string => {
  const templates = scenario.activityTemplates;
  const selectedTemplate = templates
    ? pickRandomTemplate(mode === "already-ready" ? templates.alreadyReady : templates.accepted)
    : null;

  if (selectedTemplate) {
    return selectedTemplate.replaceAll("{userId}", userId);
  }

  const actionText = toActionText(claimLabel);
  if (mode === "already-ready") {
    return `<@${userId}> is already ready to ${actionText}.`;
  }

  return `<@${userId}> did ${actionText}.`;
};

export const buildActiveClaimDescription = (
  prompt: string,
  activityLine: string | null,
  expiresAtMs: number | null,
  participants: string[] = [],
  failedAttemptLines: string[] = [],
  requiredReadyCount: number | null = null,
): string => {
  const buildDescription = ({
    participantMaxVisible,
    failedAttemptMaxVisible,
  }: {
    participantMaxVisible: number;
    failedAttemptMaxVisible: number;
  }): string => {
    const lines = [prompt];

    if (typeof requiredReadyCount === "number") {
      const remainingPlayers = Math.max(requiredReadyCount - participants.length, 0);
      lines.push(
        "",
        `**Ready now:** ${participants.length}/${requiredReadyCount}. Still waiting for ${remainingPlayers} more player${remainingPlayers === 1 ? "" : "s"}.`,
      );
    }

    if (participants.length > 0) {
      const participantLabel = participants.length === 1 ? "Participant" : "Participants";
      lines.push(
        "",
        `**${participantLabel} so far:** ${formatParticipantMentions(participants, participantMaxVisible)}`,
      );
    }

    if (activityLine) {
      lines.push("", activityLine);
    }

    const visibleFailureLines = formatVisibleLines({
      lines: failedAttemptLines,
      maxVisible: failedAttemptMaxVisible,
      noun: "failed attempt",
      takeFromEnd: true,
    });
    if (visibleFailureLines.length > 0) {
      lines.push("", "**Recent failed attempts:**", ...visibleFailureLines);
      lines.push("", "The event is still open.");
    }

    if (typeof expiresAtMs === "number") {
      lines.push("", `⏳ Ends ${formatDiscordRelativeTime(expiresAtMs)}.`);
    }

    return lines.join("\n");
  };

  let participantMaxVisible =
    participants.length > 0 ? Math.min(maxVisibleParticipantMentions, participants.length) : 0;
  let failedAttemptMaxVisible = Math.min(maxVisibleFailureLines, failedAttemptLines.length);
  let description = buildDescription({
    participantMaxVisible,
    failedAttemptMaxVisible,
  });

  while (
    description.length > discordEmbedDescriptionCharacterLimit &&
    failedAttemptMaxVisible > 0
  ) {
    failedAttemptMaxVisible -= 1;
    description = buildDescription({
      participantMaxVisible,
      failedAttemptMaxVisible,
    });
  }

  while (description.length > discordEmbedDescriptionCharacterLimit && participantMaxVisible > 1) {
    participantMaxVisible -= 1;
    description = buildDescription({
      participantMaxVisible,
      failedAttemptMaxVisible,
    });
  }

  return truncateDiscordText(
    description,
    discordEmbedDescriptionCharacterLimit,
    "\n... (truncated)",
  );
};

export const buildSequenceChallengeButtonLabel = (
  progress: RandomEventRollChallengeProgress,
  totalSteps: number,
): string => {
  const nextStepNumber = Math.min(progress.nextStepIndex + 1, totalSteps);
  return `Roll step ${nextStepNumber}/${totalSteps}`;
};

export const buildActiveClaimButtonLabel = ({
  claimLabel,
  participantCount,
  requiredReadyCount,
  hasKeepOpenFailures,
  retryMode,
}: {
  claimLabel: string;
  participantCount: number;
  requiredReadyCount: number | null;
  hasKeepOpenFailures: boolean;
  retryMode: "same-user-can-retry" | "next-user-must-try";
}): string => {
  if (typeof requiredReadyCount === "number" && participantCount > 0) {
    return truncateDiscordText(
      `${claimLabel} (${participantCount}/${requiredReadyCount})`,
      discordButtonLabelCharacterLimit,
    );
  }

  if (hasKeepOpenFailures) {
    const prefix = retryMode === "same-user-can-retry" ? "Try again: " : "Next try: ";
    return truncateDiscordText(`${prefix}${claimLabel}`, discordButtonLabelCharacterLimit);
  }

  return claimLabel;
};

export const buildSequenceChallengeDescription = ({
  selection,
  userId,
  challenge,
  progress,
  expiresAtMs,
}: {
  selection: RandomEventSelectionResult;
  userId: string;
  challenge: RandomEventRollChallengeDefinition;
  progress: RandomEventRollChallengeProgress;
  expiresAtMs: number;
}): string => {
  const buildDescription = (maxVisibleStepLines: number): string => {
    const lines = [selection.renderedPrompt, "", `<@${userId}> is taking the challenge.`];
    const revealedRollLines = formatVisibleLines({
      lines: progress.stepResults.map((stepResult, index) =>
        formatSequenceStepLine(stepResult, index),
      ),
      maxVisible: maxVisibleStepLines,
      noun: "earlier revealed roll",
      takeFromEnd: true,
    });

    if (revealedRollLines.length > 0) {
      lines.push("", "**Revealed rolls:**", ...revealedRollLines);
    }

    if (!progress.completed) {
      const nextStep = challenge.steps[progress.nextStepIndex];
      if (nextStep) {
        lines.push(
          "",
          `**Next step ${progress.nextStepIndex + 1}/${challenge.steps.length}:** ${nextStep.label}`,
          `Need ${formatComparator(nextStep.comparator, nextStep.target)}.`,
          `⏳ Auto-resolves ${formatDiscordRelativeTime(expiresAtMs)} if no one continues.`,
        );
      }
    }

    return lines.join("\n");
  };

  let maxVisibleStepLines = progress.stepResults.length;
  let description = buildDescription(maxVisibleStepLines);
  while (description.length > discordEmbedDescriptionCharacterLimit && maxVisibleStepLines > 0) {
    maxVisibleStepLines -= 1;
    description = buildDescription(maxVisibleStepLines);
  }

  return truncateDiscordText(
    description,
    discordEmbedDescriptionCharacterLimit,
    "\n... (truncated)",
  );
};

export const buildResolvedEventEmbed = (
  selection: RandomEventSelectionResult,
  lines: string[],
): EmbedBuilder => {
  const rarityPresentation = randomEventRarityPresentation[selection.scenario.rarity];
  const buildDescription = (maxVisibleLines: number): string => {
    return [
      selection.renderedPrompt,
      "",
      "**Outcome:**",
      ...formatVisibleLines({
        lines,
        maxVisible: maxVisibleLines,
        noun: "result line",
      }),
    ].join("\n");
  };

  let maxVisibleLines = lines.length;
  let description = buildDescription(maxVisibleLines);
  while (description.length > discordEmbedDescriptionCharacterLimit && maxVisibleLines > 0) {
    maxVisibleLines -= 1;
    description = buildDescription(maxVisibleLines);
  }

  return new EmbedBuilder()
    .setTitle(getRandomEventEmbedTitle(selection.scenario, selection.renderedTitle))
    .setDescription(
      truncateDiscordText(description, discordEmbedDescriptionCharacterLimit, "\n... (truncated)"),
    )
    .setColor(rarityPresentation.color)
    .setFooter({ text: `${rarityPresentation.label} • Resolved` });
};

export const buildExpiredEventEmbed = (
  selection: RandomEventSelectionResult,
  failedAttemptLines: string[] = [],
  participants: string[] = [],
): EmbedBuilder => {
  const rarityPresentation = randomEventRarityPresentation[selection.scenario.rarity];
  const requiredReadyCount = selection.scenario.requiredReadyCount;
  const buildDescription = ({
    participantMaxVisible,
    failedAttemptMaxVisible,
  }: {
    participantMaxVisible: number;
    failedAttemptMaxVisible: number;
  }): string => {
    const descriptionLines =
      typeof requiredReadyCount === "number" && participants.length < requiredReadyCount
        ? [
            selection.renderedPrompt,
            "",
            `Only ${participants.length}/${requiredReadyCount} players were ready before time ran out.`,
            ...(participants.length > 0
              ? [
                  "",
                  `**Ready players:** ${formatParticipantMentions(
                    participants,
                    participantMaxVisible,
                  )}`,
                ]
              : []),
          ]
        : failedAttemptLines.length > 0
          ? [
              selection.renderedPrompt,
              "",
              "**Recent failed attempts:**",
              ...formatVisibleLines({
                lines: failedAttemptLines,
                maxVisible: failedAttemptMaxVisible,
                noun: "failed attempt",
                takeFromEnd: true,
              }),
              "",
              "The window closes before anyone pulls it off.",
            ]
          : [selection.renderedPrompt, "", "No one claimed this event in time."];

    return descriptionLines.join("\n");
  };

  let participantMaxVisible =
    participants.length > 0 ? Math.min(maxVisibleParticipantMentions, participants.length) : 0;
  let failedAttemptMaxVisible = Math.min(maxVisibleFailureLines, failedAttemptLines.length);
  let description = buildDescription({
    participantMaxVisible,
    failedAttemptMaxVisible,
  });

  while (
    description.length > discordEmbedDescriptionCharacterLimit &&
    failedAttemptMaxVisible > 0
  ) {
    failedAttemptMaxVisible -= 1;
    description = buildDescription({
      participantMaxVisible,
      failedAttemptMaxVisible,
    });
  }

  while (description.length > discordEmbedDescriptionCharacterLimit && participantMaxVisible > 1) {
    participantMaxVisible -= 1;
    description = buildDescription({
      participantMaxVisible,
      failedAttemptMaxVisible,
    });
  }

  return new EmbedBuilder()
    .setTitle(getRandomEventEmbedTitle(selection.scenario, selection.renderedTitle))
    .setDescription(
      truncateDiscordText(description, discordEmbedDescriptionCharacterLimit, "\n... (truncated)"),
    )
    .setColor(rarityPresentation.color)
    .setFooter({ text: `${rarityPresentation.label} • Expired` });
};
