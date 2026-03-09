import { InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import {
  buildUpdateSteps,
  formatCommandResult,
  runCommandStep,
  truncateCommandOutput,
} from "../../lib/self-update";

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
  const steps = buildUpdateSteps({ install });

  await interaction.deferReply({ ephemeral: true });

  const results: string[] = [];
  let success = true;

  for (const step of steps) {
    const result = await runCommandStep(step);
    results.push(formatCommandResult(result));
    if (result.code !== 0) {
      success = false;
      break;
    }
  }

  const summary = success ? "Update finished." : "Update failed.";
  const detail = truncateCommandOutput(results.join("\n\n"), outputLimit);
  const response = detail ? `${summary}\n\n\`\`\`\n${detail}\n\`\`\`` : summary;

  await interaction.editReply(response);

  if (success) {
    setTimeout(() => process.exit(0), 1000);
  }
};
