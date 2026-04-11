import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
} from "discord.js";
import type { MessageActionRowComponentBuilder } from "discord.js";
import { discordStringSelectOptionLimit } from "../../../../../shared/discord";
import {
  createRenderedInteractionResult,
  type InteractionResult,
  type RenderedInteractionResult,
} from "../../../../../app/discord/interaction-response";
import type { DiceShopResult, DiceShopViewModel } from "../../../application/manage-shop/use-case";
import { encodeDiceShopButtonAction } from "../buttons/shop-buttons";
import { encodeDiceShopSelectMenuId } from "../select-menus/shop-select-menus";

export const renderDiceShopResult = (result: DiceShopResult): RenderedInteractionResult => {
  let interactionResult: InteractionResult;

  if (result.payload.type === "message") {
    if (result.kind === "reply") {
      interactionResult = {
        kind: "reply",
        payload: {
          content: result.payload.content,
          ephemeral: result.payload.ephemeral,
        },
      };
    } else {
      interactionResult = {
        kind: result.kind,
        payload: {
          content: result.payload.content,
          embeds: result.payload.clearComponents ? [] : undefined,
          components: result.payload.clearComponents ? [] : undefined,
        },
      };
    }
  } else {
    const payload = renderDiceShopView(result.payload.view);
    if (result.kind === "reply") {
      interactionResult = {
        kind: "reply",
        payload: {
          ...payload,
          ephemeral: result.payload.ephemeral,
        },
      };
    } else {
      interactionResult = {
        kind: result.kind,
        payload,
      };
    }
  }

  return createRenderedInteractionResult(interactionResult, result.achievementAnnouncements ?? []);
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
                  .map((item) => `**${item.name}** • ${item.pricePips} pips • ${item.ownedSummary}`)
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
          value: view.selectedItem.ownedLabel,
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

  if (view.screen === "use-item-confirmation") {
    return new EmbedBuilder()
      .setTitle("Use Item Now?")
      .setDescription(`Use **${view.itemName}** right away?`)
      .addFields({
        name: "Current Pips",
        value: `${view.balancePips} pips`,
        inline: false,
      });
  }

  const embed = new EmbedBuilder()
    .setTitle("Purchase Complete")
    .setDescription(
      view.receipt.boughtAnother
        ? `Bought another **${view.receipt.itemName}**.`
        : `Bought **${view.receipt.itemName}**.`,
    )
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
    return [
      view.categorySummary,
      `Choose an item from the dropdown below.${formatPageIndicator(view.currentPage, view.totalPages)}`,
    ].join("\n");
  }

  return [
    view.categorySummary,
    `Choose an item from the dropdown below.${formatPageIndicator(view.currentPage, view.totalPages)}`,
    "",
    view.statusMessage,
  ].join("\n");
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
      if (view.categoryItems.length > discordStringSelectOptionLimit) {
        throw new Error(
          `Shop category page exceeds Discord's ${discordStringSelectOptionLimit}-option limit.`,
        );
      }

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
                description: `${item.pricePips} pips • ${item.ownedSummary}`,
              })),
            ),
        ),
      );
    }

    const controls: MessageActionRowComponentBuilder[] = [];
    if (view.currentPage > 0) {
      controls.push(
        new ButtonBuilder()
          .setCustomId(
            encodeDiceShopButtonAction({
              type: "page-category",
              ownerId: view.ownerId,
              categoryId: view.categoryId,
              page: view.currentPage - 1,
            }),
          )
          .setLabel("←")
          .setStyle(ButtonStyle.Secondary),
      );
    }
    if (view.currentPage + 1 < view.totalPages) {
      controls.push(
        new ButtonBuilder()
          .setCustomId(
            encodeDiceShopButtonAction({
              type: "page-category",
              ownerId: view.ownerId,
              categoryId: view.categoryId,
              page: view.currentPage + 1,
            }),
          )
          .setLabel("→")
          .setStyle(ButtonStyle.Secondary),
      );
    }
    controls.push(
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
    );

    rows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(...controls));

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
              type: "page-category",
              ownerId: view.ownerId,
              categoryId: view.categoryId,
              page: view.categoryPage,
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

  if (view.screen === "use-item-confirmation") {
    return [
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(
            encodeDiceShopButtonAction({
              type: "confirm-use-item",
              ownerId: view.ownerId,
              categoryId: view.categoryId,
              itemId: view.itemId,
            }),
          )
          .setLabel("Yes")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(encodeDiceShopButtonAction({ type: "view-home", ownerId: view.ownerId }))
          .setLabel("No")
          .setStyle(ButtonStyle.Secondary),
      ),
    ];
  }

  return [
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(
          encodeDiceShopButtonAction({
            type: "buy-another-item",
            ownerId: view.ownerId,
            categoryId: view.receipt.categoryId,
            itemId: view.receipt.itemId,
          }),
        )
        .setLabel("Buy Another")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(
          encodeDiceShopButtonAction({
            type: "prompt-use-item",
            ownerId: view.ownerId,
            categoryId: view.receipt.categoryId,
            itemId: view.receipt.itemId,
          }),
        )
        .setLabel("Use Item")
        .setStyle(ButtonStyle.Success)
        .setDisabled(!view.receipt.canUseItemNow),
      new ButtonBuilder()
        .setCustomId(encodeDiceShopButtonAction({ type: "close", ownerId: view.ownerId }))
        .setLabel("Close")
        .setStyle(ButtonStyle.Danger),
    ),
  ];
};

const formatPageIndicator = (currentPage: number, totalPages: number): string => {
  return totalPages > 1 ? `\nPage ${currentPage + 1}/${totalPages}.` : "";
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
