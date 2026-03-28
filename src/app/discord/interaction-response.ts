import type {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageMentionOptions,
  MessageActionRowComponentBuilder,
  StringSelectMenuInteraction,
} from "discord.js";
import { publishAchievementAnnouncements } from "./achievement-announcements";
import { publishContractCompletionAnnouncements } from "./contract-completion-announcements";
import type { ContractCompletionAnnouncement } from "../../dice/contracts/application/completion-announcements";
import type { AchievementAnnouncement } from "../../dice/progression/application/achievement-announcements";

type InteractionMessagePayload = {
  content?: string;
  embeds?: EmbedBuilder[];
  allowedMentions?: MessageMentionOptions;
  components?:
    | ActionRowBuilder<MessageActionRowComponentBuilder>[]
    | ActionRowBuilder<ButtonBuilder>[];
};

export type InteractionResult =
  | {
      kind: "reply";
      payload: InteractionMessagePayload & { ephemeral?: boolean };
    }
  | {
      kind: "update";
      payload: InteractionMessagePayload;
    }
  | {
      kind: "edit";
      payload: InteractionMessagePayload;
    };

export type RenderedInteractionResult = {
  interactionResult: InteractionResult;
  achievementAnnouncements?: AchievementAnnouncement[];
  contractCompletionAnnouncements?: ContractCompletionAnnouncement[];
};

export const createRenderedInteractionResult = (
  interactionResult: InteractionResult,
  achievementAnnouncements: readonly AchievementAnnouncement[] = [],
  contractCompletionAnnouncements: readonly ContractCompletionAnnouncement[] = [],
): RenderedInteractionResult => {
  return {
    interactionResult,
    achievementAnnouncements: [...achievementAnnouncements],
    contractCompletionAnnouncements: [...contractCompletionAnnouncements],
  };
};

export const applyChatInputResult = async (
  interaction: ChatInputCommandInteraction,
  result: InteractionResult,
): Promise<void> => {
  if (result.kind !== "reply") {
    throw new Error(`Chat input commands cannot apply interaction result kind: ${result.kind}`);
  }

  await interaction.reply(result.payload);
};

export const applyRenderedChatInputResult = async (
  interaction: ChatInputCommandInteraction,
  result: RenderedInteractionResult,
): Promise<void> => {
  await applyChatInputResult(interaction, result.interactionResult);
  await publishAchievementAnnouncements({
    client: interaction.client,
    announcements: result.achievementAnnouncements ?? [],
  });
  await publishContractCompletionAnnouncements({
    client: interaction.client,
    announcements: result.contractCompletionAnnouncements ?? [],
  });
};

export const applyButtonResult = async (
  interaction: ButtonInteraction,
  result: InteractionResult,
): Promise<void> => {
  await applyMessageComponentResult(interaction, result);
};

export const applyRenderedButtonResult = async (
  interaction: ButtonInteraction,
  result: RenderedInteractionResult,
): Promise<void> => {
  await applyButtonResult(interaction, result.interactionResult);
  await publishAchievementAnnouncements({
    client: interaction.client,
    announcements: result.achievementAnnouncements ?? [],
  });
  await publishContractCompletionAnnouncements({
    client: interaction.client,
    announcements: result.contractCompletionAnnouncements ?? [],
  });
};

export const applyStringSelectMenuResult = async (
  interaction: StringSelectMenuInteraction,
  result: InteractionResult,
): Promise<void> => {
  await applyMessageComponentResult(interaction, result);
};

export const applyRenderedStringSelectMenuResult = async (
  interaction: StringSelectMenuInteraction,
  result: RenderedInteractionResult,
): Promise<void> => {
  await applyStringSelectMenuResult(interaction, result.interactionResult);
  await publishAchievementAnnouncements({
    client: interaction.client,
    announcements: result.achievementAnnouncements ?? [],
  });
  await publishContractCompletionAnnouncements({
    client: interaction.client,
    announcements: result.contractCompletionAnnouncements ?? [],
  });
};

const applyMessageComponentResult = async (
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  result: InteractionResult,
): Promise<void> => {
  if (result.kind === "reply") {
    await interaction.reply(result.payload);
    return;
  }

  if (result.kind === "update") {
    await interaction.update(result.payload);
    return;
  }

  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate();
  }

  await interaction.editReply(result.payload);
};
