import { SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { getDatabase } from "../../shared/db";
import { diceAchievements } from "../../dice/core/domain/achievements";
import { getUserDiceAchievements } from "../../dice/core/domain/achievements-store";

export const data = new SlashCommandBuilder()
  .setName("dice-achievements")
  .setDescription("Show your unlocked dice achievements.");

export const execute = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  const db = getDatabase();
  const earnedIds = new Set(getUserDiceAchievements(db, interaction.user.id));

  if (earnedIds.size === 0) {
    await interaction.reply({
      content: "No dice achievements unlocked yet.",
      ephemeral: false,
    });
    return;
  }

  const lines = diceAchievements
    .filter((achievement) => earnedIds.has(achievement.id))
    .map((achievement) => achievement.name);

  await interaction.reply({
    content: `Your dice achievements (${earnedIds.size}/${diceAchievements.length}):\n${lines.join("\n")}`,
    ephemeral: false,
  });
};
