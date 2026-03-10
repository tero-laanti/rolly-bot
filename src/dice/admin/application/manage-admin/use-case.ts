import type { SqliteDatabase } from "../../../../shared/db";
import type { ActionResult, ActionView } from "../../../../shared-kernel/application/action-view";
import {
  getRandomEventsAdminStatus,
  triggerRandomEventNow,
} from "../../../random-events/infrastructure/admin-controller";
import { getActiveDoubleRoll, getActiveDiceLockout, setDicePvpEffects } from "../../../pvp/domain/pvp";
import { getActiveDiceTemporaryEffects } from "../../../progression/domain/temporary-effects";

export type DiceAdminAction =
  | {
      type: "menu";
      ownerId: string;
      targetUserId: string;
    }
  | {
      type: "status";
      ownerId: string;
      targetUserId: string;
    }
  | {
      type: "event-trigger";
      ownerId: string;
      targetUserId: string;
    }
  | {
      type: "effects-user";
      ownerId: string;
      targetUserId: string;
    }
  | {
      type: "effects-clear";
      ownerId: string;
      targetUserId: string;
    };

export type DiceAdminResult = ActionResult<DiceAdminAction>;

export const createDiceAdminReply = (
  ownerId: string | null,
  actorId: string,
  targetUserId: string,
): DiceAdminResult => {
  if (!ownerId) {
    return replyMessage("Missing DISCORD_OWNER_ID in environment.", true);
  }

  if (actorId !== ownerId) {
    return replyMessage("You are not authorized to run this command.", true);
  }

  return {
    kind: "reply",
    payload: {
      type: "view",
      view: buildMenuView(actorId, targetUserId),
      ephemeral: true,
    },
  };
};

export const handleDiceAdminAction = async (
  db: SqliteDatabase,
  ownerId: string | null,
  actorId: string,
  action: DiceAdminAction,
  guildId: string | null,
): Promise<DiceAdminResult> => {
  if (!ownerId || actorId !== action.ownerId || actorId !== ownerId) {
    return replyMessage("You are not authorized to use this panel.", true);
  }

  if (action.type === "menu") {
    return updateView(buildMenuView(action.ownerId, action.targetUserId));
  }

  if (action.type === "status") {
    return updateView(buildStatusView(action.ownerId, action.targetUserId, guildId));
  }

  if (action.type === "effects-user") {
    return updateView(buildEffectsUserView(db, action.ownerId, action.targetUserId));
  }

  if (action.type === "effects-clear") {
    return updateView(buildEffectsClearView(db, action.ownerId, action.targetUserId));
  }

  return editView(await buildEventTriggerView(action.ownerId, action.targetUserId));
};

const buildMenuView = (ownerId: string, targetUserId: string): ActionView<DiceAdminAction> => {
  return {
    content: [
      "**Dice admin**",
      `- Target user: <@${targetUserId}>`,
      "- Choose a section below.",
    ].join("\n"),
    components: [
      [
        {
          action: { type: "status", ownerId, targetUserId },
          label: "Status",
          style: "primary",
        },
        {
          action: { type: "event-trigger", ownerId, targetUserId },
          label: "Event trigger",
          style: "primary",
        },
        {
          action: { type: "effects-user", ownerId, targetUserId },
          label: "Effects user",
          style: "secondary",
        },
        {
          action: { type: "effects-clear", ownerId, targetUserId },
          label: "Effects clear",
          style: "danger",
        },
      ],
    ],
  };
};

const buildStatusView = (
  ownerId: string,
  targetUserId: string,
  guildId: string | null,
): ActionView<DiceAdminAction> => {
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

const buildEffectsUserView = (
  db: SqliteDatabase,
  ownerId: string,
  targetUserId: string,
): ActionView<DiceAdminAction> => {
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
): ActionView<DiceAdminAction> => {
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
): Promise<ActionView<DiceAdminAction>> => {
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

const buildBackComponents = (
  ownerId: string,
  targetUserId: string,
): ActionView<DiceAdminAction>["components"] => {
  return [
    [
      {
        action: { type: "menu", ownerId, targetUserId },
        label: "Back",
        style: "secondary",
      },
    ],
  ];
};

const formatTimestamp = (value: Date | number | null): string => {
  if (value === null) {
    return "none";
  }

  const timestampSeconds = Math.floor((value instanceof Date ? value.getTime() : value) / 1000);
  return `<t:${timestampSeconds}:f> (<t:${timestampSeconds}:R>)`;
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

const replyMessage = (content: string, ephemeral: boolean): DiceAdminResult => {
  return {
    kind: "reply",
    payload: {
      type: "message",
      content,
      ephemeral,
    },
  };
};

const updateView = (view: ActionView<DiceAdminAction>): DiceAdminResult => {
  return {
    kind: "update",
    payload: {
      type: "view",
      view,
    },
  };
};

const editView = (view: ActionView<DiceAdminAction>): DiceAdminResult => {
  return {
    kind: "edit",
    payload: {
      type: "view",
      view,
    },
  };
};
