import {
  InteractionContextType,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import type { ButtonInteraction, ChatInputCommandInteraction } from "discord.js";
import { getDatabase } from "../../shared/db";
import {
  createDiceAdminReply,
  diceAdminButtonPrefix,
  getDiceAdminOwnerId,
  handleDiceAdminAction,
} from "../../dice/application/manage-dice-admin";
import { applyButtonResult, applyChatInputResult } from "../../bot/interaction-response";

export { diceAdminButtonPrefix };

export const data = new SlashCommandBuilder()
  .setName("dice-admin")
  .setDescription("Owner-only dice administration tools.")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setContexts(InteractionContextType.Guild)
  .addUserOption((option) =>
    option
      .setName("user")
      .setDescription("Optional target user for the effects panels. Defaults to you.")
      .setRequired(false),
  );

export const execute = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  const targetUserId = interaction.options.getUser("user")?.id ?? interaction.user.id;
  await applyChatInputResult(
    interaction,
    createDiceAdminReply(getDiceAdminOwnerId(), interaction.user.id, targetUserId),
  );
};

export const handleDiceAdminButton = async (interaction: ButtonInteraction): Promise<void> => {
  await applyButtonResult(
    interaction,
    await handleDiceAdminAction(
      getDatabase(),
      getDiceAdminOwnerId(),
      interaction.user.id,
      interaction.customId,
      interaction.guildId,
    ),
  );
};
