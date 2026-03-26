import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import type {
  ActionButtonRowSpec,
  ButtonStyleSpec,
} from "../../shared-kernel/application/action-view";
import { discordActionRowLimit, discordComponentsPerActionRowLimit } from "../../shared/discord";

const buttonStyleMap: Record<ButtonStyleSpec, ButtonStyle> = {
  primary: ButtonStyle.Primary,
  secondary: ButtonStyle.Secondary,
  success: ButtonStyle.Success,
  danger: ButtonStyle.Danger,
};

export const renderActionButtonRows = <TAction>(
  rows: ActionButtonRowSpec<TAction>[],
  encodeAction: (action: TAction) => string,
): ActionRowBuilder<ButtonBuilder>[] => {
  if (rows.length > discordActionRowLimit) {
    throw new Error(
      `Discord action views support at most ${discordActionRowLimit} component rows.`,
    );
  }

  for (const row of rows) {
    if (row.length > discordComponentsPerActionRowLimit) {
      throw new Error(
        `Discord action rows support at most ${discordComponentsPerActionRowLimit} components.`,
      );
    }
  }

  return rows.map((row) =>
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      ...row.map((button) => {
        const builder = new ButtonBuilder()
          .setCustomId(encodeAction(button.action))
          .setStyle(buttonStyleMap[button.style])
          .setDisabled(Boolean(button.disabled));
        if (button.label) {
          builder.setLabel(button.label);
        }
        if (button.emoji) {
          builder.setEmoji(button.emoji);
        }

        return builder;
      }),
    ),
  );
};
