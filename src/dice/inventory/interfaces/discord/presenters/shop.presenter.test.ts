import assert from "node:assert/strict";
import test from "node:test";
import { ButtonStyle, ComponentType } from "discord.js";
import { renderDiceShopResult } from "./shop.presenter";

const categorySummaries = [
  {
    id: "consumables" as const,
    label: "Consumables",
    summary: "Single-use items and timed boosts for your next moves.",
    itemCount: 2,
  },
  {
    id: "permanent-upgrades" as const,
    label: "Permanent Upgrades",
    summary: "One-time passive upgrades that stay active once owned.",
    itemCount: 1,
  },
];

test("landing renders only top-level navigation buttons", () => {
  const rendered = renderDiceShopResult({
    kind: "reply",
    payload: {
      type: "view",
      ephemeral: false,
      view: {
        screen: "landing",
        ownerId: "user-1",
        balancePips: 40,
        categorySummaries,
      },
    },
  });

  assert.equal(rendered.kind, "reply");
  const embed = rendered.payload.embeds?.[0]?.toJSON();
  assert.equal(embed?.title, "Rolly Shop");

  const rows = rendered.payload.components?.map((row) => row.toJSON()) ?? [];
  assert.equal(rows.length, 1);
  assert.deepEqual(
    rows[0]?.components.map((component) => component.type),
    [ComponentType.Button, ComponentType.Button, ComponentType.Button],
  );
  assert.deepEqual(
    rows[0]?.components.map((component) => ("label" in component ? component.label : undefined)),
    ["Consumables", "Permanent Upgrades", "Close"],
  );
  assert.deepEqual(
    rows[0]?.components.map((component) => ("style" in component ? component.style : undefined)),
    [ButtonStyle.Primary, ButtonStyle.Primary, ButtonStyle.Danger],
  );
});

test("category renders one select menu with only that category's items", () => {
  const rendered = renderDiceShopResult({
    kind: "update",
    payload: {
      type: "view",
      view: {
        screen: "category",
        ownerId: "user-1",
        balancePips: 40,
        categorySummaries,
        categoryId: "consumables",
        categoryLabel: "Consumables",
        categorySummary: "Single-use items and timed boosts for your next moves.",
        categoryItems: [
          {
            id: "dice-revolver",
            name: "Dice Revolver",
            pricePips: 6,
            ownedQuantity: 0,
          },
          {
            id: "cleanse-salt",
            name: "Cleanse Salt",
            pricePips: 15,
            ownedQuantity: 2,
          },
        ],
      },
    },
  });

  assert.equal(rendered.kind, "update");
  const rows = rendered.payload.components?.map((row) => row.toJSON()) ?? [];
  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.components[0]?.type, ComponentType.StringSelect);
  if (rows[0]?.components[0]?.type !== ComponentType.StringSelect) {
    return;
  }

  assert.deepEqual(
    rows[0].components[0].options.map((option) => option.value),
    ["dice-revolver", "cleanse-salt"],
  );
  assert.deepEqual(
    rows[0].components[0].options.map((option) => option.description),
    ["6 pips • Owned 0", "15 pips • Owned 2"],
  );
  assert.deepEqual(
    rows[1]?.components.map((component) => ("label" in component ? component.label : undefined)),
    ["View Permanent Upgrades", "Shop Home", "Close"],
  );
});

test("item-detail renders one buy button plus navigation controls", () => {
  const rendered = renderDiceShopResult({
    kind: "update",
    payload: {
      type: "view",
      view: {
        screen: "item-detail",
        ownerId: "user-1",
        balancePips: 34,
        categorySummaries,
        categoryId: "consumables",
        categoryLabel: "Consumables",
        itemNavigation: {
          previousItemId: null,
          nextItemId: "cleanse-salt",
        },
        selectedItem: {
          id: "dice-revolver",
          name: "Dice Revolver",
          description: "Your next 6 /roll uses roll twice.",
          pricePips: 6,
          ownedQuantity: 1,
          typeLabel: "Consumable",
          buyable: true,
        },
      },
    },
  });

  const embed = rendered.payload.embeds?.[0]?.toJSON();
  assert.equal(embed?.title, "Dice Revolver");

  const rows = rendered.payload.components?.map((row) => row.toJSON()) ?? [];
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows[0]?.components.map((component) => ("label" in component ? component.label : undefined)),
    ["Previous", "Next"],
  );
  assert.deepEqual(
    rows[0]?.components.map((component) =>
      "disabled" in component ? component.disabled : undefined,
    ),
    [true, false],
  );
  assert.deepEqual(
    rows[1]?.components.map((component) => ("label" in component ? component.label : undefined)),
    ["Buy", "Back to Categories", "Close"],
  );
});

test("receipt renders success embed plus only Shop Home and Close", () => {
  const rendered = renderDiceShopResult({
    kind: "update",
    payload: {
      type: "view",
      view: {
        screen: "purchase-receipt",
        ownerId: "user-1",
        balancePips: 34,
        categorySummaries,
        receipt: {
          itemName: "Dice Revolver",
          ownedQuantity: 1,
          remainingPips: 34,
          changeSummary:
            "The item was added to your inventory. Use /inventory when you want to activate it.",
        },
      },
    },
  });

  const embed = rendered.payload.embeds?.[0]?.toJSON();
  assert.equal(embed?.title, "Purchase Complete");

  const rows = rendered.payload.components?.map((row) => row.toJSON()) ?? [];
  assert.equal(rows.length, 1);
  assert.deepEqual(
    rows[0]?.components.map((component) => ("label" in component ? component.label : undefined)),
    ["Shop Home", "Close"],
  );
});

test("close message clears both embeds and components", () => {
  const rendered = renderDiceShopResult({
    kind: "update",
    payload: {
      type: "message",
      content: "Shop closed.",
      clearComponents: true,
    },
  });

  assert.equal(rendered.kind, "update");
  assert.deepEqual(rendered.payload.embeds, []);
  assert.deepEqual(rendered.payload.components, []);
});

test("empty category omits the select menu and keeps navigation buttons", () => {
  const rendered = renderDiceShopResult({
    kind: "update",
    payload: {
      type: "view",
      view: {
        screen: "category",
        ownerId: "user-1",
        balancePips: 40,
        categorySummaries,
        categoryId: "consumables",
        categoryLabel: "Consumables",
        categorySummary: "Single-use items and timed boosts for your next moves.",
        categoryItems: [],
      },
    },
  });

  const rows = rendered.payload.components?.map((row) => row.toJSON()) ?? [];
  assert.equal(rows.length, 1);
  assert.deepEqual(
    rows[0]?.components.map((component) => ("label" in component ? component.label : undefined)),
    ["View Permanent Upgrades", "Shop Home", "Close"],
  );
});

test("permanent upgrades render owned state as emoji instead of a count", () => {
  const rendered = renderDiceShopResult({
    kind: "update",
    payload: {
      type: "view",
      view: {
        screen: "category",
        ownerId: "user-1",
        balancePips: 40,
        categorySummaries,
        categoryId: "permanent-upgrades",
        categoryLabel: "Permanent Upgrades",
        categorySummary: "One-time passive upgrades that stay active once owned.",
        categoryItems: [
          {
            id: "umbrella-harness",
            name: "Umbrella Harness",
            pricePips: 25,
            ownedQuantity: 0,
          },
        ],
      },
    },
  });

  const embed = rendered.payload.embeds?.[0]?.toJSON();
  const itemsField = embed?.fields?.find((field) => field.name === "Items");
  assert.match(itemsField?.value ?? "", /Owned: ❌/);

  const rows = rendered.payload.components?.map((row) => row.toJSON()) ?? [];
  assert.equal(rows[0]?.components[0]?.type, ComponentType.StringSelect);
  if (rows[0]?.components[0]?.type !== ComponentType.StringSelect) {
    return;
  }

  assert.equal(rows[0].components[0].options[0]?.description, "25 pips • Owned: ❌");
});

test("permanent upgrade item detail renders emoji owned state", () => {
  const rendered = renderDiceShopResult({
    kind: "update",
    payload: {
      type: "view",
      view: {
        screen: "item-detail",
        ownerId: "user-1",
        balancePips: 15,
        categorySummaries,
        categoryId: "permanent-upgrades",
        categoryLabel: "Permanent Upgrades",
        itemNavigation: {
          previousItemId: null,
          nextItemId: null,
        },
        selectedItem: {
          id: "umbrella-harness",
          name: "Umbrella Harness",
          description: "Adds one extra Bad Luck Umbrella charge.",
          pricePips: 25,
          ownedQuantity: 0,
          typeLabel: "Permanent Upgrade",
          buyable: false,
          buyDisabledReason: "You need 25 pips. Current balance: 15 pips.",
        },
      },
    },
  });

  const embed = rendered.payload.embeds?.[0]?.toJSON();
  const ownedField = embed?.fields?.find((field) => field.name === "Owned");
  assert.equal(ownedField?.value, "❌");
});
