import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import type { SqliteDatabase } from "../../../shared/db";
import type { InteractionResult } from "../../../bot/interaction-response";
import { getActiveDiceTemporaryEffects } from "../domain/temporary-effects";
import { getActiveDoubleRoll, getActiveDiceLockout, setDicePvpEffects } from "../domain/pvp";
import { getRandomEventsAdminStatus, triggerRandomEventNow } from "../../features/random-events/admin";

const ownerEnvName = "DISCORD_OWNER_ID";
export const diceAdminButtonPrefix = "dice-admin:";

type DiceAdminAction = "menu" | "status" | "event-trigger" | "effects-user" | "effects-clear";

type DiceAdminView = {
  content: string;
  components: ActionRowBuilder<ButtonBuilder>[];
};

export const getDiceAdminOwnerId = (): string | null => {
  return process.env[ownerEnvName] ?? null;
};

export const createDiceAdminReply = (
  ownerId: string | null,
  actorId: string,
  targetUserId: string,
): InteractionResult => {
  if (!ownerId) {
    return {
      kind: "reply",
      payload: {
        content: `Missing ${ownerEnvName} in environment.`,
        ephemeral: true,
      },
    };
  }

  if (actorId !== ownerId) {
    return {
      kind: "reply",
      payload: {
        content: "You are not authorized to run this command.",
        ephemeral: true,
      },
    };
  }

  return {
    kind: "reply",
    payload: {
      ...buildMenuView(actorId, targetUserId),
      ephemeral: true,
    },
  };
};

export const handleDiceAdminAction = async (
  db: SqliteDatabase,
  ownerId: string | null,
  actorId: string,
  customId: string,
  guildId: string | null,
): Promise<InteractionResult> => {
  const parsed = parseDiceAdminButtonId(customId);
  if (!parsed) {
    return {
      kind: "reply",
      payload: {
        content: "Unknown dice-admin action.",
        ephemeral: true,
      },
    };
  }

  if (!ownerId || actorId !== parsed.ownerId || actorId !== ownerId) {
    return {
      kind: "reply",
      payload: {
        content: "You are not authorized to use this panel.",
        ephemeral: true,
      },
    };
  }

  if (parsed.action === "menu") {
    return {
      kind: "update",
      payload: buildMenuView(parsed.ownerId, parsed.targetUserId),
    };
  }

  if (parsed.action === "status") {
    return {
      kind: "update",
      payload: buildStatusView(parsed.ownerId, parsed.targetUserId, guildId),
    };
  }

  if (parsed.action === "effects-user") {
    return {
      kind: "update",
      payload: buildEffectsUserView(db, parsed.ownerId, parsed.targetUserId),
    };
  }

  if (parsed.action === "effects-clear") {
    return {
      kind: "update",
      payload: buildEffectsClearView(db, parsed.ownerId, parsed.targetUserId),
    };
  }

  return {
    kind: "edit",
    payload: await buildEventTriggerView(parsed.ownerId, parsed.targetUserId),
  };
};

const formatTimestamp = (value: Date | number | null): string => {
  if (value === null) {
    return "none";
  }

  const timestampSeconds = Math.floor((value instanceof Date ? value.getTime() : value) / 1000);
  return `<t:${timestampSeconds}:f> (<t:${timestampSeconds}:R>)`;
};

const buildDiceAdminButtonId = (
  action: DiceAdminAction,
  ownerId: string,
  targetUserId: string,
): string => {
  return `${diceAdminButtonPrefix}${action}:${ownerId}:${targetUserId}`;
};

const parseDiceAdminButtonId = (
  customId: string,
): { action: DiceAdminAction; ownerId: string; targetUserId: string } | null => {
  if (!customId.startsWith(diceAdminButtonPrefix)) {
    return null;
  }

  const [actionRaw, ownerId, targetUserId] = customId
    .slice(diceAdminButtonPrefix.length)
    .split(":");
  if (!actionRaw || !ownerId || !targetUserId) {
    return null;
  }

  if (
    actionRaw !== "menu" &&
    actionRaw !== "status" &&
    actionRaw !== "event-trigger" &&
    actionRaw !== "effects-user" &&
    actionRaw !== "effects-clear"
  ) {
    return null;
  }

  return {
    action: actionRaw,
    ownerId,
    targetUserId,
  };
};

const buildMenuComponents = (
  ownerId: string,
  targetUserId: string,
): ActionRowBuilder<ButtonBuilder>[] => {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(buildDiceAdminButtonId("status", ownerId, targetUserId))
        .setLabel("Status")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(buildDiceAdminButtonId("event-trigger", ownerId, targetUserId))
        .setLabel("Event trigger")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(buildDiceAdminButtonId("effects-user", ownerId, targetUserId))
        .setLabel("Effects user")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(buildDiceAdminButtonId("effects-clear", ownerId, targetUserId))
        .setLabel("Effects clear")
        .setStyle(ButtonStyle.Danger),
    ),
  ];
};

const buildBackComponents = (
  ownerId: string,
  targetUserId: string,
): ActionRowBuilder<ButtonBuilder>[] => {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(buildDiceAdminButtonId("menu", ownerId, targetUserId))
        .setLabel("Back")
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
};

const buildMenuView = (ownerId: string, targetUserId: string): DiceAdminView => {
  return {
    content: ["**Dice admin**", `- Target user: <@${targetUserId}>`, "- Choose a section below."].join(
      "\n",
    ),
    components: buildMenuComponents(ownerId, targetUserId),
  };
};

const buildStatusView = (
  ownerId: string,
  targetUserId: string,
  guildId: string | null,
): DiceAdminView => {
  const status = getRandomEventsAdminStatus();
  if (!status) {
    return {
      content: "**Dice admin · status**\nRandom-event runtime is currently unavailable.",
      components: buildBackComponents(ownerId, targetUserId),
    };
  }

  const lines = [
    "**Dice admin · status**",
    `- Enabled: ${status.enabled ? "yes" : "no"}`,
    `- Channel: ${status.channelId ? `<#${status.channelId}>` : "not configured"}`,
    `- Gate: ${status.gate.reason}`,
    `- Should trigger now: ${status.gate.shouldTrigger ? "yes" : "no"}`,
    `- Retry delay: ${Math.round(status.gate.retryDelayMs / 1000)}s`,
    `- Next scheduler check: ${formatTimestamp(status.nextCheckAt)}`,
    `- Last triggered: ${formatTimestamp(status.snapshot.lastTriggeredAt)}`,
    `- Active event count: ${status.snapshot.activeEventCount}`,
  ];

  if (status.activeEvents.length > 0) {
    lines.push("", "**Active events**");
    for (const activeEvent of status.activeEvents) {
      lines.push(
        `- ${activeEvent.title} [${activeEvent.rarity}] • ${activeEvent.claimPolicy} • participants: ${activeEvent.participantCount} • expires: ${formatTimestamp(activeEvent.expiresAt)} • https://discord.com/channels/${guildId ?? "@me"}/${activeEvent.channelId}/${activeEvent.messageId}`,
      );
    }
  }

  return {
    content: lines.join("\n"),
    components: buildBackComponents(ownerId, targetUserId),
  };
};

const formatTemporaryEffectLine = (
  effect: ReturnType<typeof getActiveDiceTemporaryEffects>[number],
): string => {
  const parts = [effect.kind, effect.effectCode, `x${effect.magnitude}`, `source=${effect.source}`];

  if (effect.remainingRolls !== null) {
    parts.push(`rolls=${effect.remainingRolls}`);
  }

  if (effect.expiresAt) {
    parts.push(`expires=${formatTimestamp(new Date(effect.expiresAt))}`);
  }

  return `- ${parts.join(" • ")}`;
};

const buildEffectsUserView = (
  db: SqliteDatabase,
  ownerId: string,
  targetUserId: string,
): DiceAdminView => {
  const temporaryEffects = getActiveDiceTemporaryEffects(db, { userId: targetUserId });
  const lockoutUntil = getActiveDiceLockout(db, targetUserId);
  const doubleRollUntil = getActiveDoubleRoll(db, targetUserId);

  const lines = [
    "**Dice admin · effects user**",
    `- User: <@${targetUserId}>`,
    `- Lockout: ${formatTimestamp(lockoutUntil)}`,
    `- Double-roll: ${formatTimestamp(doubleRollUntil)}`,
    `- Temporary effects: ${temporaryEffects.length}`,
  ];

  if (temporaryEffects.length > 0) {
    lines.push("", ...temporaryEffects.map(formatTemporaryEffectLine));
  }

  return {
    content: lines.join("\n"),
    components: buildBackComponents(ownerId, targetUserId),
  };
};

const buildEffectsClearView = (
  db: SqliteDatabase,
  ownerId: string,
  targetUserId: string,
): DiceAdminView => {
  const temporaryEffects = getActiveDiceTemporaryEffects(db, { userId: targetUserId });
  const hadLockout = getActiveDiceLockout(db, targetUserId) !== null;
  const hadDoubleRoll = getActiveDoubleRoll(db, targetUserId) !== null;

  const clearedTemporaryEffects = db
    .prepare("DELETE FROM dice_temporary_effects WHERE user_id = ?")
    .run(targetUserId).changes;

  setDicePvpEffects(db, {
    userId: targetUserId,
    lockoutUntil: null,
    doubleRollUntil: null,
  });

  const lines = [
    "**Dice admin · effects clear**",
    `- User: <@${targetUserId}>`,
    `- Temporary effects removed: ${clearedTemporaryEffects}`,
    `- Lockout cleared: ${hadLockout ? "yes" : "no"}`,
    `- Double-roll cleared: ${hadDoubleRoll ? "yes" : "no"}`,
  ];

  if (temporaryEffects.length > 0) {
    lines.push("", "**Removed effects**", ...temporaryEffects.map(formatTemporaryEffectLine));
  }

  return {
    content: lines.join("\n"),
    components: buildBackComponents(ownerId, targetUserId),
  };
};

const buildEventTriggerView = async (
  ownerId: string,
  targetUserId: string,
): Promise<DiceAdminView> => {
  const result = await triggerRandomEventNow();
  if (!result.ok) {
    const content =
      result.reason === "disabled"
        ? "**Dice admin · event trigger**\nRandom events are disabled in config."
        : result.reason === "active-event-exists"
          ? "**Dice admin · event trigger**\nA random event is already active. Use Status first."
          : "**Dice admin · event trigger**\nRandom-event runtime is currently unavailable.";

    return {
      content,
      components: buildBackComponents(ownerId, targetUserId),
    };
  }

  if (!result.result?.created) {
    return {
      content:
        "**Dice admin · event trigger**\nNo event was created. Check channel config or content selection state.",
      components: buildBackComponents(ownerId, targetUserId),
    };
  }

  return {
    content: [
      "**Dice admin · event trigger**",
      "Random event triggered.",
      `- Event id: ${result.result.eventId ?? "unknown"}`,
      `- Expires: ${formatTimestamp(result.result.expiresAt ?? null)}`,
    ].join("\n"),
    components: buildBackComponents(ownerId, targetUserId),
  };
};
