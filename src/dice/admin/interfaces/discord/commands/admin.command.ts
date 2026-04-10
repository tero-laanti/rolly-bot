import { InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { ButtonInteraction, ChatInputCommandInteraction } from "discord.js";
import {
  applyButtonResult,
  applyRenderedButtonResult,
  applyRenderedChatInputResult,
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
        content: "Unknown admin action.",
        ephemeral: true,
      },
    });
    return;
  }

  const adminUseCase = createSqliteDiceAdminUseCase(getDatabase());
  await applyRenderedButtonResult(
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
  .setName("admin")
  .setDescription("Owner-only dice administration tools.")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setContexts(InteractionContextType.Guild)
  .addIntegerOption((option) =>
    option
      .setName("grant-pips")
      .setDescription("Optional pip amount to grant to the target user.")
      .setMinValue(1)
      .setRequired(false),
  )
  .addUserOption((option) =>
    option
      .setName("user")
      .setDescription("Optional target user for the effects panels. Defaults to you.")
      .setRequired(false),
  );

export const execute = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  const adminUseCase = createSqliteDiceAdminUseCase(getDatabase());
  const targetUserId = interaction.options.getUser("user")?.id ?? interaction.user.id;
  const grantPipsAmount = interaction.options.getInteger("grant-pips");
  await applyRenderedChatInputResult(
    interaction,
    renderDiceAdminResult(
      adminUseCase.createDiceAdminReply(
        getDiceAdminOwnerId(),
        interaction.user.id,
        targetUserId,
        grantPipsAmount,
      ),
    ),
  );
};

export const buttonHandlers = [
  {
    prefix: diceAdminButtonPrefix,
    handle: handleDiceAdminButton,
  },
];
