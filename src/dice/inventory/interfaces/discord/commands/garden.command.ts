import { SlashCommandBuilder } from "discord.js";
import type { ButtonInteraction, ChatInputCommandInteraction } from "discord.js";
import { publishAchievementEffects } from "../../../../../app/discord/achievement-effects";
import {
  applyButtonResult,
  applyRenderedChatInputResult,
} from "../../../../../app/discord/interaction-response";
import { getDatabase } from "../../../../../shared/db";
import { createSqliteDiceGardenUseCase } from "../../../infrastructure/sqlite/services";
import { parseDiceGardenAction, diceGardenButtonPrefix } from "../buttons/garden-buttons";
import { renderDiceGardenResult } from "../presenters/garden.presenter";

const handleDiceGardenButton = async (interaction: ButtonInteraction): Promise<void> => {
  const gardenUseCase = createSqliteDiceGardenUseCase(getDatabase());
  const action = parseDiceGardenAction(interaction.customId);
  if (!action) {
    await applyButtonResult(interaction, {
      kind: "reply",
      payload: {
        content: "Unknown garden action.",
        ephemeral: true,
      },
    });
    return;
  }

  const outcome = gardenUseCase.handleDiceGardenAction(interaction.user.id, action);
  const rendered = renderDiceGardenResult(outcome.result);
  await applyButtonResult(interaction, rendered.interactionResult);
  await publishAchievementEffects({
    client: interaction.client,
    announcements: outcome.achievementAnnouncements ?? rendered.achievementAnnouncements ?? [],
  });
};

export const data = new SlashCommandBuilder()
  .setName("garden")
  .setDescription("Tend your die saplings and harvest idle pips.");

export const execute = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  const gardenUseCase = createSqliteDiceGardenUseCase(getDatabase());
  await applyRenderedChatInputResult(
    interaction,
    renderDiceGardenResult(gardenUseCase.createDiceGardenReply(interaction.user.id)),
  );
};

export const buttonHandlers = [
  {
    prefix: diceGardenButtonPrefix,
    handle: handleDiceGardenButton,
  },
];
