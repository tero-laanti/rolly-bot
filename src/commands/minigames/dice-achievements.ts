import { SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { getDatabase } from "../../lib/db";
import { diceAchievements } from "../../lib/minigames/achievements";
import { getUserDiceAchievements } from "../../lib/minigames/dice-game";

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
