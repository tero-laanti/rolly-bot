import { InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { createLocalRunSelfUpdateUseCase } from "../../../infrastructure/update-runner";

const ownerEnvName = "DISCORD_OWNER_ID";
const outputLimit = 1800;

export const data = new SlashCommandBuilder()
  .setName("self-update")
  .setDescription("Pull latest code and rebuild the bot.")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setContexts(InteractionContextType.Guild)
  .addBooleanOption((option) =>
    option
      .setName("install")
      .setDescription("Run npm install before rebuilding.")
      .setRequired(false),
  );

export const execute = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  const ownerId = process.env[ownerEnvName];
  if (!ownerId) {
    await interaction.reply({
      content: `Missing ${ownerEnvName} in environment.`,
      ephemeral: true,
    });
    return;
  }

  if (interaction.user.id !== ownerId) {
    await interaction.reply({
      content: "You are not authorized to run this command.",
      ephemeral: true,
    });
    return;
  }

  const install = interaction.options.getBoolean("install") ?? false;
  const runSelfUpdate = createLocalRunSelfUpdateUseCase({
    outputLimit,
  });

  await interaction.deferReply({ ephemeral: true });

  const result = await runSelfUpdate({ install });

  await interaction.editReply(result.responseText);

  if (result.success) {
    setTimeout(() => process.exit(0), 1000);
  }
};
