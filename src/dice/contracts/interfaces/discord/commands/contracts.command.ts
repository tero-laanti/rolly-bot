import { SlashCommandBuilder } from "discord.js";
import type { ButtonInteraction, ChatInputCommandInteraction } from "discord.js";
import { applyButtonResult } from "../../../../../app/discord/interaction-response";
import { renderActionView } from "../../../../../app/discord/render-action-result";
import { getDatabase } from "../../../../../shared/db";
import {
  createOptionalSqliteContractMasterService,
  createSqliteQueryContractsUseCase,
} from "../../../infrastructure/sqlite/services";
import {
  contractMasterButtonPrefix,
  encodeContractMasterButtonAction,
  parseContractMasterButtonAction,
} from "../buttons/contract-master-buttons";

export const data = new SlashCommandBuilder()
  .setName("contracts")
  .setDescription("Show your Contract Master summary.");

export const execute = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  const queryContracts = createSqliteQueryContractsUseCase(getDatabase());
  await interaction.reply(
    queryContracts.createContractsReply({
      userId: interaction.user.id,
      userMention: interaction.user.toString(),
      now: new Date(),
    }),
  );
};

const createEphemeralMessageResult = (content: string) => ({
  kind: "reply" as const,
  payload: {
    content,
    ephemeral: true,
  },
});

const handleContractMasterButton = async (interaction: ButtonInteraction): Promise<void> => {
  const action = parseContractMasterButtonAction(interaction.customId);
  if (!action) {
    await applyButtonResult(
      interaction,
      createEphemeralMessageResult("Unknown Contract Master action."),
    );
    return;
  }

  const service = createOptionalSqliteContractMasterService(getDatabase());
  if (!service) {
    await applyButtonResult(
      interaction,
      createEphemeralMessageResult("Contract Master is currently unavailable."),
    );
    return;
  }

  try {
    const now = new Date();
    let view;
    let resultKind: "reply" | "update" = "update";

    switch (action.kind) {
      case "panel-open-cadence":
        view = service.createCadenceView({
          userId: interaction.user.id,
          cadence: action.cadence,
          now,
        });
        resultKind = "reply";
        break;
      case "view-open-cadence":
        view = service.createCadenceView({
          userId: interaction.user.id,
          cadence: action.cadence,
          now,
        });
        break;
      case "open-chooser":
        view = service.createChooserView({
          userId: interaction.user.id,
          cadence: action.cadence,
          now,
        });
        break;
      case "accept-offer":
        view = service.acceptOffer({
          userId: interaction.user.id,
          cadence: action.cadence,
          difficulty: action.difficulty,
          now,
        });
        break;
      case "reroll-offer":
        view = service.rerollOffer({
          userId: interaction.user.id,
          cadence: action.cadence,
          difficulty: action.difficulty,
          now,
        });
        break;
    }

    await applyButtonResult(interaction, {
      kind: resultKind,
      payload: {
        ...renderActionView(view, encodeContractMasterButtonAction),
        ...(resultKind === "reply" ? { ephemeral: true } : {}),
      },
    });
  } catch (error) {
    const content = error instanceof Error ? error.message : "Contract Master action failed.";
    await applyButtonResult(interaction, createEphemeralMessageResult(content));
  }
};

export const buttonHandlers = [
  {
    prefix: contractMasterButtonPrefix,
    handle: handleContractMasterButton,
  },
];
