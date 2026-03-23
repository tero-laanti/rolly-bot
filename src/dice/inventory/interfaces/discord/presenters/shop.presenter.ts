import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
} from "discord.js";
import type { MessageActionRowComponentBuilder } from "discord.js";
import type { InteractionResult } from "../../../../../app/discord/interaction-response";
import type { DiceShopResult, DiceShopViewModel } from "../../../application/manage-shop/use-case";
import { encodeDiceShopButtonAction } from "../buttons/shop-buttons";
import { encodeDiceShopSelectMenuId } from "../select-menus/shop-select-menus";

export const renderDiceShopResult = (result: DiceShopResult): InteractionResult => {
  if (result.payload.type === "message") {
    if (result.kind === "reply") {
      return {
        kind: "reply",
        payload: {
          content: result.payload.content,
          ephemeral: result.payload.ephemeral,
        },
      };
    }

    return {
      kind: result.kind,
      payload: {
        content: result.payload.content,
        embeds: result.payload.clearComponents ? [] : undefined,
        components: result.payload.clearComponents ? [] : undefined,
      },
    };
  }

  const payload = renderDiceShopView(result.payload.view);
  if (result.kind === "reply") {
    return {
      kind: "reply",
      payload: {
        ...payload,
        ephemeral: result.payload.ephemeral,
      },
    };
  }

  return {
    kind: result.kind,
    payload,
  };
};

const renderDiceShopView = (view: DiceShopViewModel): InteractionResult["payload"] => {
  return {
    embeds: [buildDiceShopEmbed(view)],
    components: buildDiceShopComponents(view),
  };
};

const buildDiceShopEmbed = (view: DiceShopViewModel): EmbedBuilder => {
  if (view.screen === "landing") {
    const embed = new EmbedBuilder()
      .setTitle("Rolly Shop")
      .setDescription(buildLandingDescription(view))
      .addFields({
        name: "Current Pips",
        value: `${view.balancePips} pips`,
        inline: false,
      });

    for (const summary of view.categorySummaries) {
      embed.addFields({
        name: summary.label,
        value: `${summary.summary}\n${summary.itemCount} item${summary.itemCount === 1 ? "" : "s"}.`,
        inline: false,
      });
    }

    return embed;
  }

  if (view.screen === "category") {
    return new EmbedBuilder()
      .setTitle(`Rolly Shop: ${view.categoryLabel}`)
      .setDescription(buildCategoryDescription(view))
      .addFields(
        {
          name: "Current Pips",
          value: `${view.balancePips} pips`,
          inline: false,
        },
        {
          name: "Items",
          value:
            view.categoryItems.length > 0
              ? view.categoryItems
                  .map(
                    (item) =>
                      `**${item.name}** • ${item.pricePips} pips • ${formatOwnedSummary(
                        view.categoryId,
                        item.ownedQuantity,
                      )}`,
                  )
                  .join("\n")
              : "No items available in this category.",
          inline: false,
        },
      );
  }

  if (view.screen === "item-detail") {
    const embed = new EmbedBuilder()
      .setTitle(view.selectedItem.name)
      .setDescription(view.selectedItem.description)
      .addFields(
        {
          name: "Current Pips",
          value: `${view.balancePips} pips`,
          inline: true,
        },
        {
          name: "Price",
          value: `${view.selectedItem.pricePips} pips`,
          inline: true,
        },
        {
          name: "Owned",
          value: formatOwnedValue(view.categoryId, view.selectedItem.ownedQuantity),
          inline: true,
        },
        {
          name: "Item Type",
          value: view.selectedItem.typeLabel,
          inline: true,
        },
      );

    if (view.statusMessage) {
      embed.addFields({
        name: "Status",
        value: view.statusMessage,
        inline: false,
      });
    } else if (view.selectedItem.buyDisabledReason) {
      embed.addFields({
        name: "Availability",
        value: view.selectedItem.buyDisabledReason,
        inline: false,
      });
    }

    return embed;
  }

  const embed = new EmbedBuilder()
    .setTitle("Purchase Complete")
    .setDescription(`Bought **${view.receipt.itemName}**.`)
    .addFields(
      {
        name: "Quantity Now Owned",
        value: `${view.receipt.ownedQuantity}`,
        inline: true,
      },
      {
        name: "Remaining Pips",
        value: `${view.receipt.remainingPips} pips`,
        inline: true,
      },
      {
        name: "What Changed",
        value: view.receipt.changeSummary,
        inline: false,
      },
    );

  if (view.receipt.statusText) {
    embed.addFields({
      name: "Status",
      value: view.receipt.statusText,
      inline: false,
    });
  }

  return embed;
};

const buildLandingDescription = (
  view: Extract<DiceShopViewModel, { screen: "landing" }>,
): string => {
  if (!view.statusMessage) {
    return "Pick a category to browse what you can buy with your pips.";
  }

  return `Pick a category to browse what you can buy with your pips.\n\n${view.statusMessage}`;
};

const buildCategoryDescription = (
  view: Extract<DiceShopViewModel, { screen: "category" }>,
): string => {
  if (!view.statusMessage) {
    return `${view.categorySummary}\nChoose an item from the dropdown below.`;
  }

  return `${view.categorySummary}\nChoose an item from the dropdown below.\n\n${view.statusMessage}`;
};

const buildDiceShopComponents = (
  view: DiceShopViewModel,
): ActionRowBuilder<MessageActionRowComponentBuilder>[] => {
  if (view.screen === "landing") {
    return [
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        ...view.categorySummaries.map((summary) =>
          new ButtonBuilder()
            .setCustomId(
              encodeDiceShopButtonAction({
                type: "open-category",
                ownerId: view.ownerId,
                categoryId: summary.id,
              }),
            )
            .setLabel(summary.label)
            .setStyle(ButtonStyle.Primary),
        ),
        new ButtonBuilder()
          .setCustomId(encodeDiceShopButtonAction({ type: "close", ownerId: view.ownerId }))
          .setLabel("Close")
          .setStyle(ButtonStyle.Danger),
      ),
    ];
  }

  if (view.screen === "category") {
    const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];
    const alternateCategory = getAlternateCategorySummary(view);

    if (view.categoryItems.length > 0) {
      rows.push(
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(
              encodeDiceShopSelectMenuId({
                type: "select-item",
                ownerId: view.ownerId,
                categoryId: view.categoryId,
              }),
            )
            .setPlaceholder(`Choose a ${view.categoryLabel.toLowerCase().slice(0, -1)} item`)
            .setMinValues(1)
            .setMaxValues(1)
            .setOptions(
              view.categoryItems.map((item) => ({
                label: item.name,
                value: item.id,
                description: `${item.pricePips} pips • ${formatOwnedSummary(
                  view.categoryId,
                  item.ownedQuantity,
                )}`,
              })),
            ),
        ),
      );
    }

    rows.push(
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(
            encodeDiceShopButtonAction({
              type: "open-category",
              ownerId: view.ownerId,
              categoryId: alternateCategory.id,
            }),
          )
          .setLabel(`View ${alternateCategory.label}`)
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(encodeDiceShopButtonAction({ type: "view-home", ownerId: view.ownerId }))
          .setLabel("Shop Home")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(encodeDiceShopButtonAction({ type: "close", ownerId: view.ownerId }))
          .setLabel("Close")
          .setStyle(ButtonStyle.Danger),
      ),
    );

    return rows;
  }

  if (view.screen === "item-detail") {
    return [
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(
            encodeDiceShopButtonAction({
              type: "view-adjacent-item",
              ownerId: view.ownerId,
              categoryId: view.categoryId,
              itemId: view.selectedItem.id,
              direction: "previous",
            }),
          )
          .setLabel("Previous")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(!view.itemNavigation.previousItemId),
        new ButtonBuilder()
          .setCustomId(
            encodeDiceShopButtonAction({
              type: "view-adjacent-item",
              ownerId: view.ownerId,
              categoryId: view.categoryId,
              itemId: view.selectedItem.id,
              direction: "next",
            }),
          )
          .setLabel("Next")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(!view.itemNavigation.nextItemId),
      ),
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(
            encodeDiceShopButtonAction({
              type: "buy-selected-item",
              ownerId: view.ownerId,
              categoryId: view.categoryId,
              itemId: view.selectedItem.id,
            }),
          )
          .setLabel("Buy")
          .setStyle(ButtonStyle.Success)
          .setDisabled(!view.selectedItem.buyable),
        new ButtonBuilder()
          .setCustomId(
            encodeDiceShopButtonAction({
              type: "open-category",
              ownerId: view.ownerId,
              categoryId: view.categoryId,
            }),
          )
          .setLabel("Back to Categories")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(encodeDiceShopButtonAction({ type: "close", ownerId: view.ownerId }))
          .setLabel("Close")
          .setStyle(ButtonStyle.Danger),
      ),
    ];
  }

  return [
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(encodeDiceShopButtonAction({ type: "view-home", ownerId: view.ownerId }))
        .setLabel("Shop Home")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(encodeDiceShopButtonAction({ type: "close", ownerId: view.ownerId }))
        .setLabel("Close")
        .setStyle(ButtonStyle.Danger),
    ),
  ];
};

const formatOwnedSummary = (categoryId: string, ownedQuantity: number): string => {
  if (categoryId === "permanent-upgrades") {
    return `Owned: ${ownedQuantity > 0 ? "✅" : "❌"}`;
  }

  return `Owned ${ownedQuantity}`;
};

const formatOwnedValue = (categoryId: string, ownedQuantity: number): string => {
  if (categoryId === "permanent-upgrades") {
    return ownedQuantity > 0 ? "✅" : "❌";
  }

  return `${ownedQuantity}`;
};

const getAlternateCategorySummary = (view: Extract<DiceShopViewModel, { screen: "category" }>) => {
  const alternateCategory = view.categorySummaries.find(
    (summary) => summary.id !== view.categoryId,
  );
  if (!alternateCategory) {
    throw new Error(`Missing alternate shop category for ${view.categoryId}.`);
  }

  return alternateCategory;
};
