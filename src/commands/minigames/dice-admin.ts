import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  InteractionContextType,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import type { ButtonInteraction, ChatInputCommandInteraction } from "discord.js";
import { getDatabase } from "../../lib/db";
import {
  getActiveDiceLockout,
  getActiveDoubleRoll,
  setDicePvpEffects,
} from "../../lib/minigames/dice-game";
import { getActiveDiceTemporaryEffects } from "../../lib/minigames/dice-temporary-effects";
import {
  getRandomEventsAdminStatus,
  triggerRandomEventNow,
} from "../../lib/minigames/random-events-admin";

const ownerEnvName = "DISCORD_OWNER_ID";
export const diceAdminButtonPrefix = "dice-admin:";

type DiceAdminAction = "menu" | "status" | "event-trigger" | "effects-user" | "effects-clear";

type DiceAdminView = {
  content: string;
  components: ActionRowBuilder<ButtonBuilder>[];
};

export const data = new SlashCommandBuilder()
  .setName("dice-admin")
  .setDescription("Owner-only dice administration tools.")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setContexts(InteractionContextType.Guild)
  .addUserOption((option) =>
    option
      .setName("user")
      .setDescription("Optional target user for the effects panels. Defaults to you.")
      .setRequired(false),
  );

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
    content: [
      "**Dice admin**",
      `- Target user: <@${targetUserId}>`,
      "- Choose a section below.",
    ].join("\n"),
    components: buildMenuComponents(ownerId, targetUserId),
  };
};

const ensureOwnerForSlashCommand = async (
  interaction: ChatInputCommandInteraction,
): Promise<boolean> => {
  const ownerId = process.env[ownerEnvName];
  if (!ownerId) {
    await interaction.reply({
      content: `Missing ${ownerEnvName} in environment.`,
      ephemeral: true,
    });
    return false;
  }

  if (interaction.user.id !== ownerId) {
    await interaction.reply({
      content: "You are not authorized to run this command.",
      ephemeral: true,
    });
    return false;
  }

  return true;
};

const ensureOwnerForButton = async (
  interaction: ButtonInteraction,
  ownerId: string,
): Promise<boolean> => {
  if (interaction.user.id !== ownerId) {
    await interaction.reply({
      content: "You are not authorized to use this panel.",
      ephemeral: true,
    });
    return false;
  }

  return true;
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

const buildEffectsUserView = (ownerId: string, targetUserId: string): DiceAdminView => {
  const db = getDatabase();
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

const buildEffectsClearView = (ownerId: string, targetUserId: string): DiceAdminView => {
  const db = getDatabase();
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

export const execute = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  if (!(await ensureOwnerForSlashCommand(interaction))) {
    return;
  }

  const targetUserId = interaction.options.getUser("user")?.id ?? interaction.user.id;
  await interaction.reply({
    ...buildMenuView(interaction.user.id, targetUserId),
    ephemeral: true,
  });
};

export const handleDiceAdminButton = async (interaction: ButtonInteraction): Promise<void> => {
  const parsed = parseDiceAdminButtonId(interaction.customId);
  if (!parsed) {
    await interaction.reply({
      content: "Unknown dice-admin action.",
      ephemeral: true,
    });
    return;
  }

  if (!(await ensureOwnerForButton(interaction, parsed.ownerId))) {
    return;
  }

  if (parsed.action === "menu") {
    await interaction.update(buildMenuView(parsed.ownerId, parsed.targetUserId));
    return;
  }

  if (parsed.action === "status") {
    await interaction.update(
      buildStatusView(parsed.ownerId, parsed.targetUserId, interaction.guildId),
    );
    return;
  }

  if (parsed.action === "effects-user") {
    await interaction.update(buildEffectsUserView(parsed.ownerId, parsed.targetUserId));
    return;
  }

  if (parsed.action === "effects-clear") {
    await interaction.update(buildEffectsClearView(parsed.ownerId, parsed.targetUserId));
    return;
  }

  if (parsed.action === "event-trigger") {
    await interaction.deferUpdate();
    await interaction.editReply(await buildEventTriggerView(parsed.ownerId, parsed.targetUserId));
  }
};
