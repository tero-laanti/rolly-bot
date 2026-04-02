import { SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { publishAchievementEffects } from "../../../../../app/discord/achievement-effects";
import { publishContractCompletionAnnouncements } from "../../../../../app/discord/contract-completion-announcements";
import { applyChatInputResult } from "../../../../../app/discord/interaction-response";
import { getDatabase } from "../../../../../shared/db";
import { createSqliteRollDiceUseCase } from "../../../infrastructure/sqlite/services";
import {
  hasBeginnerRollerAchievementAnnouncement,
  publishBeginnerRollGraduationMessage,
} from "../beginner-roll-graduation";
import { renderDiceRollResult } from "../presenters/roll.presenter";

export const data = new SlashCommandBuilder().setName("roll").setDescription("Roll your dice.");

export const execute = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  const runRollDiceUseCase = createSqliteRollDiceUseCase(getDatabase());
  const rendered = renderDiceRollResult(
    runRollDiceUseCase({
      userId: interaction.user.id,
      userMention: interaction.user.toString(),
      channelId: interaction.channelId,
    }),
  );

  await applyChatInputResult(interaction, rendered.interactionResult);

  if (
    hasBeginnerRollerAchievementAnnouncement(
      rendered.achievementAnnouncements ?? [],
      interaction.user.id,
    )
  ) {
    await publishBeginnerRollGraduationMessage({
      channel: interaction.channel,
      userId: interaction.user.id,
    });
  }

  await publishAchievementEffects({
    client: interaction.client,
    announcements: rendered.achievementAnnouncements ?? [],
  });
  await publishContractCompletionAnnouncements({
    client: interaction.client,
    announcements: rendered.contractCompletionAnnouncements ?? [],
  });
};
