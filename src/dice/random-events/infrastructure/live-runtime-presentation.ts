import { EmbedBuilder } from "discord.js";
import type { RandomEventScenario, RandomEventSelectionResult } from "../domain/content";
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

const formatRelativeTimestamp = (timestampMs: number): string => {
  return `<t:${Math.floor(timestampMs / 1000)}:R>`;
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
    const participantMentions = participants.map((userId) => `<@${userId}>`).join(", ");
    const participantLabel = participants.length === 1 ? "Participant" : "Participants";
    lines.push("", `**${participantLabel} so far:** ${participantMentions}`);
  }

  if (activityLine) {
    lines.push("", activityLine);
  }

  if (typeof expiresAtMs === "number") {
    lines.push("", `⏳ Ends ${formatRelativeTimestamp(expiresAtMs)}.`);
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
