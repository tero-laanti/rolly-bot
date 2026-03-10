import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import type { ActionButtonRowSpec, ButtonStyleSpec } from "../../../application/interaction-model";

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
  return rows.map((row) =>
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      ...row.map((button) =>
        new ButtonBuilder()
          .setCustomId(encodeAction(button.action))
          .setLabel(button.label)
          .setStyle(buttonStyleMap[button.style])
          .setDisabled(Boolean(button.disabled)),
      ),
    ),
  );
};
