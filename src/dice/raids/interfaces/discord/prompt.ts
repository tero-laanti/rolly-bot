import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type BaseMessageOptions,
} from "discord.js";
import { formatDiscordFullTime, formatDiscordRelativeTime } from "../../../../shared/discord";
import { buildRaidJoinButtonId } from "./button-ids";

const raidColor = 0xb33a3a;
const resolvedColor = 0x57606a;

const maxVisibleParticipants = 20;

const formatParticipants = (participantIds: readonly string[]): string => {
  if (participantIds.length < 1) {
    return "No raiders yet — be the first to join.";
  }

  const visibleParticipantMentions = participantIds
    .slice(0, maxVisibleParticipants)
    .map((participantId) => `<@${participantId}>`);
  const hiddenParticipantCount = Math.max(
    0,
    participantIds.length - visibleParticipantMentions.length,
  );

  if (hiddenParticipantCount < 1) {
    return visibleParticipantMentions.join(", ");
  }

  return `${visibleParticipantMentions.join(", ")} … and ${hiddenParticipantCount} more`;
};

export const buildRaidAnnouncementPrompt = ({
  raidId,
  participantIds,
  scheduledStartAtMs,
  disabled = false,
}: {
  raidId: string;
  participantIds: readonly string[];
  scheduledStartAtMs: number;
  disabled?: boolean;
}): BaseMessageOptions => {
  const embed = new EmbedBuilder()
    .setColor(raidColor)
    .setTitle("⚔️ Incoming raid")
    .setDescription(
      [
        `The raid begins ${formatDiscordRelativeTime(scheduledStartAtMs)}.`,
        `Start time: ${formatDiscordFullTime(scheduledStartAtMs)}.`,
        "Join now to lock yourself in before the boss arrives.",
        "",
        `**Joined raiders (${participantIds.length})**`,
        formatParticipants(participantIds),
      ].join("\n"),
    )
    .setFooter({ text: "Joined players will be carried into the active raid state." });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildRaidJoinButtonId(raidId))
      .setLabel(participantIds.length < 1 ? "Join raid" : `Join raid (${participantIds.length})`)
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
  );

  return {
    embeds: [embed],
    components: [row],
  };
};

export const buildRaidStartedPrompt = ({
  participantIds,
  startedAtMs,
  endsAtMs,
}: {
  participantIds: readonly string[];
  startedAtMs: number;
  endsAtMs: number;
}): BaseMessageOptions => {
  const embed = new EmbedBuilder()
    .setColor(raidColor)
    .setTitle("🐉 Raid started")
    .setDescription(
      [
        `The boss has arrived ${formatDiscordRelativeTime(startedAtMs)}.`,
        `The raid window closes ${formatDiscordRelativeTime(endsAtMs)}.`,
        "",
        `**Joined raiders (${participantIds.length})**`,
        formatParticipants(participantIds),
      ].join("\n"),
    )
    .setFooter({ text: "Joined raiders are locked in for this raid." });

  return {
    embeds: [embed],
  };
};

export const buildRaidResolvedPrompt = ({
  participantIds,
  resolvedAtMs,
}: {
  participantIds: readonly string[];
  resolvedAtMs: number;
}): BaseMessageOptions => {
  const embed = new EmbedBuilder()
    .setColor(resolvedColor)
    .setTitle("🏁 Raid window closed")
    .setDescription(
      [
        `The raid ended ${formatDiscordRelativeTime(resolvedAtMs)}.`,
        "",
        `**Joined raiders (${participantIds.length})**`,
        formatParticipants(participantIds),
      ].join("\n"),
    );

  return {
    embeds: [embed],
  };
};

export const buildRaidInterruptedPrompt = ({
  participantIds,
}: {
  participantIds: readonly string[];
}): BaseMessageOptions => {
  const embed = new EmbedBuilder()
    .setColor(resolvedColor)
    .setTitle("⏸️ Raid interrupted")
    .setDescription(
      [
        "This raid was closed while the bot restarted.",
        "",
        `**Joined raiders (${participantIds.length})**`,
        formatParticipants(participantIds),
      ].join("\n"),
    );

  return {
    embeds: [embed],
    components: [],
  };
};

export const buildRaidCancelledPrompt = ({
  scheduledStartAtMs,
}: {
  scheduledStartAtMs: number;
}): BaseMessageOptions => {
  const embed = new EmbedBuilder()
    .setColor(resolvedColor)
    .setTitle("💨 Raid cancelled")
    .setDescription(
      [
        "Nobody joined before the boss arrived.",
        `Scheduled start: ${formatDiscordFullTime(scheduledStartAtMs)}.`,
      ].join("\n"),
    );

  return {
    embeds: [embed],
    components: [],
  };
};
