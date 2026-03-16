import { InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { ButtonInteraction, ChatInputCommandInteraction } from "discord.js";
import {
  applyButtonResult,
  applyChatInputResult,
} from "../../../../../app/discord/interaction-response";
import { getDatabase } from "../../../../../shared/db";
import { createSqliteDiceAdminUseCase } from "../../../infrastructure/sqlite/services";
import { diceAdminButtonPrefix, parseDiceAdminAction } from "../buttons/admin-buttons";
import { renderDiceAdminResult } from "../presenters/admin.presenter";

const ownerEnvName = "DISCORD_OWNER_ID";

const getDiceAdminOwnerId = (): string | null => {
  return process.env[ownerEnvName] ?? null;
};

const handleDiceAdminButton = async (interaction: ButtonInteraction): Promise<void> => {
  const action = parseDiceAdminAction(interaction.customId);
  if (!action) {
    await applyButtonResult(interaction, {
      kind: "reply",
      payload: {
        content: "Unknown dice-admin action.",
        ephemeral: true,
      },
    });
    return;
  }

  const adminUseCase = createSqliteDiceAdminUseCase(getDatabase());
  await applyButtonResult(
    interaction,
    renderDiceAdminResult(
      await adminUseCase.handleDiceAdminAction(
        getDiceAdminOwnerId(),
        interaction.user.id,
        action,
        interaction.guildId,
      ),
    ),
  );
};

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
  const adminUseCase = createSqliteDiceAdminUseCase(getDatabase());
  const targetUserId = interaction.options.getUser("user")?.id ?? interaction.user.id;
  await applyChatInputResult(
    interaction,
    renderDiceAdminResult(
      adminUseCase.createDiceAdminReply(getDiceAdminOwnerId(), interaction.user.id, targetUserId),
    ),
  );
};

export const buttonHandlers = [
  {
    prefix: diceAdminButtonPrefix,
    handle: handleDiceAdminButton,
  },
];
