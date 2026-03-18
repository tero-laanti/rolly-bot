import { EmbedBuilder } from "discord.js";
import { formatDiscordRelativeTime } from "../../../shared/discord";
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

const formatParticipantMentions = (participants: string[], maxVisible = 5): string => {
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
): string => {
  const lines = [prompt];

  if (participants.length > 0) {
    const participantLabel = participants.length === 1 ? "Participant" : "Participants";
    lines.push("", `**${participantLabel} so far:** ${formatParticipantMentions(participants)}`);
  }

  if (activityLine) {
    lines.push("", activityLine);
  }

  if (typeof expiresAtMs === "number") {
    lines.push("", `⏳ Ends ${formatDiscordRelativeTime(expiresAtMs)}.`);
  }

  return lines.join("\n");
};

export const buildSequenceChallengeButtonLabel = (
  progress: RandomEventRollChallengeProgress,
  totalSteps: number,
): string => {
  const nextStepNumber = Math.min(progress.nextStepIndex + 1, totalSteps);
  return `Roll step ${nextStepNumber}/${totalSteps}`;
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
  const lines = [selection.renderedPrompt, "", `<@${userId}> is taking the challenge.`];

  if (progress.stepResults.length > 0) {
    lines.push(
      "",
      "**Revealed rolls:**",
      ...progress.stepResults.map((stepResult, index) => formatSequenceStepLine(stepResult, index)),
    );
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

export const buildResolvedEventEmbed = (
  selection: RandomEventSelectionResult,
  lines: string[],
): EmbedBuilder => {
  const rarityPresentation = randomEventRarityPresentation[selection.scenario.rarity];
  return new EmbedBuilder()
    .setTitle(getRandomEventEmbedTitle(selection.scenario, selection.renderedTitle))
    .setDescription([selection.renderedPrompt, "", "**Outcome:**", ...lines].join("\n"))
    .setColor(rarityPresentation.color)
    .setFooter({ text: `${rarityPresentation.label} • Resolved` });
};

export const buildExpiredEventEmbed = (selection: RandomEventSelectionResult): EmbedBuilder => {
  const rarityPresentation = randomEventRarityPresentation[selection.scenario.rarity];
  return new EmbedBuilder()
    .setTitle(getRandomEventEmbedTitle(selection.scenario, selection.renderedTitle))
    .setDescription([selection.renderedPrompt, "", "No one claimed this event in time."].join("\n"))
    .setColor(rarityPresentation.color)
    .setFooter({ text: `${rarityPresentation.label} • Expired` });
};
