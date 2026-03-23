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

export const applyChatInputResult = async (
  interaction: ChatInputCommandInteraction,
  result: InteractionResult,
): Promise<void> => {
  if (result.kind !== "reply") {
    throw new Error(`Chat input commands cannot apply interaction result kind: ${result.kind}`);
  }

  await interaction.reply(result.payload);
};

export const applyButtonResult = async (
  interaction: ButtonInteraction,
  result: InteractionResult,
): Promise<void> => {
  await applyMessageComponentResult(interaction, result);
};

export const applyStringSelectMenuResult = async (
  interaction: StringSelectMenuInteraction,
  result: InteractionResult,
): Promise<void> => {
  await applyMessageComponentResult(interaction, result);
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
