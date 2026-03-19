import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type BaseMessageOptions,
} from "discord.js";
import { formatDiscordFullTime, formatDiscordRelativeTime } from "../../../../shared/discord";
import type { RaidOutcome } from "../../application/ports";
import { buildRaidJoinButtonId } from "./button-ids";

const raidColor = 0xb33a3a;
const successColor = 0x2f9e44;
const failureColor = 0x8b949e;

const maxVisibleParticipants = 20;
const hpBarWidth = 14;

const formatParticipants = (participantIds: readonly string[]): string => {
  if (participantIds.length < 1) {
    return "No raiders yet - be the first to join.";
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

  return `${visibleParticipantMentions.join(", ")} ... and ${hiddenParticipantCount} more`;
};

const formatHpBar = (currentHp: number, maxHp: number): string => {
  const normalizedMaxHp = Math.max(1, maxHp);
  const normalizedCurrentHp = Math.max(0, Math.min(normalizedMaxHp, currentHp));
  const filledWidth = Math.round((normalizedCurrentHp / normalizedMaxHp) * hpBarWidth);
  const emptyWidth = Math.max(0, hpBarWidth - filledWidth);
  return `[${"#".repeat(filledWidth)}${"-".repeat(emptyWidth)}]`;
};

const buildContributionBlock = (contributionLines: readonly string[]): string => {
  if (contributionLines.length < 1) {
    return "No damage logged yet.";
  }

  return contributionLines.join("\n");
};

const getOutcomePresentation = (
  outcome: RaidOutcome,
): {
  color: number;
  title: string;
  summaryLine: string;
} => {
  if (outcome === "success") {
    return {
      color: successColor,
      title: "Raid cleared",
      summaryLine: "The boss was defeated in time.",
    };
  }

  return {
    color: failureColor,
    title: "Raid failed",
    summaryLine: "The boss escaped when the raid timer expired.",
  };
};

export const buildRaidAnnouncementPrompt = ({
  raidId,
  participantIds,
  scheduledStartAtMs,
  disabled = false,
  bossName = null,
  threadId = null,
}: {
  raidId: string;
  participantIds: readonly string[];
  scheduledStartAtMs: number;
  disabled?: boolean;
  bossName?: string | null;
  threadId?: string | null;
}): BaseMessageOptions => {
  const descriptionLines = [
    disabled
      ? `Raid signup closed ${formatDiscordRelativeTime(scheduledStartAtMs)}.`
      : `The raid begins ${formatDiscordRelativeTime(scheduledStartAtMs)}.`,
    `Start time: ${formatDiscordFullTime(scheduledStartAtMs)}.`,
  ];

  if (disabled && bossName && threadId) {
    descriptionLines.push(`Boss: **${bossName}**.`, `Fight in <#${threadId}>.`);
  } else {
    descriptionLines.push(
      disabled
        ? "This raid is no longer accepting new raiders."
        : "Join now to lock yourself in before the boss arrives.",
    );
  }

  descriptionLines.push(
    "",
    `**Joined raiders (${participantIds.length})**`,
    formatParticipants(participantIds),
  );

  const embed = new EmbedBuilder()
    .setColor(raidColor)
    .setTitle(disabled ? "Raid signup closed" : "Incoming raid")
    .setDescription(descriptionLines.join("\n"))
    .setFooter({
      text: disabled
        ? "Joined raiders are now locked for this raid."
        : "Joined players will be carried into the active raid state.",
    });

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

export const buildRaidActivePrompt = ({
  participantIds,
  startedAtMs,
  endsAtMs,
  threadId,
  bossName,
  bossLevel,
  currentHp,
  maxHp,
  rewardSummary,
  totalDamage,
  totalAttacks,
  contributionLines,
}: {
  participantIds: readonly string[];
  startedAtMs: number;
  endsAtMs: number;
  threadId: string;
  bossName: string;
  bossLevel: number;
  currentHp: number;
  maxHp: number;
  rewardSummary: string;
  totalDamage: number;
  totalAttacks: number;
  contributionLines: readonly string[];
}): BaseMessageOptions => {
  const embed = new EmbedBuilder()
    .setColor(raidColor)
    .setTitle(`${bossName} - Lv.${bossLevel}`)
    .setDescription(
      [
        `Fight in <#${threadId}>.`,
        `Raid opened ${formatDiscordRelativeTime(startedAtMs)} and closes ${formatDiscordRelativeTime(endsAtMs)}.`,
        "Only joined raiders using /dice in this thread deal damage.",
        "",
        `HP: **${currentHp}/${maxHp}** ${formatHpBar(currentHp, maxHp)}`,
        `Total damage: **${totalDamage}** across ${totalAttacks} hit${totalAttacks === 1 ? "" : "s"}.`,
        `Reward on success: **${rewardSummary}**.`,
        "",
        `**Joined raiders (${participantIds.length})**`,
        formatParticipants(participantIds),
        "",
        "**Damage leaders**",
        buildContributionBlock(contributionLines),
      ].join("\n"),
    )
    .setFooter({ text: "Use /dice inside the raid thread to attack." });

  return {
    embeds: [embed],
    components: [],
  };
};

export const buildRaidResolvedPrompt = ({
  participantIds,
  resolvedAtMs,
  outcome,
  bossName,
  bossLevel,
  maxHp,
  rewardSummary,
  contributionLines,
}: {
  participantIds: readonly string[];
  resolvedAtMs: number;
  outcome: RaidOutcome;
  bossName: string;
  bossLevel: number;
  maxHp: number;
  rewardSummary: string;
  contributionLines: readonly string[];
}): BaseMessageOptions => {
  const presentation = getOutcomePresentation(outcome);
  const rewardLine =
    outcome === "success" ? `Reward applied to all joined raiders: **${rewardSummary}**.` : "";

  const embed = new EmbedBuilder()
    .setColor(presentation.color)
    .setTitle(`${presentation.title} - ${bossName} Lv.${bossLevel}`)
    .setDescription(
      [
        `${presentation.summaryLine} The raid ended ${formatDiscordRelativeTime(resolvedAtMs)}.`,
        `Boss HP pool: **${maxHp}**.`,
        rewardLine,
        "",
        `**Joined raiders (${participantIds.length})**`,
        formatParticipants(participantIds),
        "",
        "**Damage leaders**",
        buildContributionBlock(contributionLines),
      ]
        .filter((line) => line.length > 0)
        .join("\n"),
    );

  return {
    embeds: [embed],
    components: [],
  };
};

export const buildRaidResolveFailedPrompt = ({
  participantIds,
  resolvedAtMs,
  bossName,
  outcome,
}: {
  participantIds: readonly string[];
  resolvedAtMs: number;
  bossName: string | null;
  outcome: RaidOutcome | null;
}): BaseMessageOptions => {
  const outcomeText =
    outcome === "success"
      ? "The raid boss was defeated."
      : outcome === "failure"
        ? "The raid timed out."
        : "The raid ended.";

  const embed = new EmbedBuilder()
    .setColor(failureColor)
    .setTitle("Raid ended with cleanup needed")
    .setDescription(
      [
        `${outcomeText} Cleanup failed ${formatDiscordRelativeTime(resolvedAtMs)}.`,
        bossName ? `Boss: **${bossName}**.` : "",
        "A moderator may need to tidy the stale raid message manually.",
        "",
        `**Joined raiders (${participantIds.length})**`,
        formatParticipants(participantIds),
      ]
        .filter((line) => line.length > 0)
        .join("\n"),
    );

  return {
    embeds: [embed],
    components: [],
  };
};

export const buildRaidInterruptedPrompt = ({
  participantIds,
  bossName = null,
}: {
  participantIds: readonly string[];
  bossName?: string | null;
}): BaseMessageOptions => {
  const embed = new EmbedBuilder()
    .setColor(failureColor)
    .setTitle("Raid interrupted")
    .setDescription(
      [
        "This raid was closed while the bot restarted.",
        bossName ? `Boss: **${bossName}**.` : "",
        "",
        `**Joined raiders (${participantIds.length})**`,
        formatParticipants(participantIds),
      ]
        .filter((line) => line.length > 0)
        .join("\n"),
    );

  return {
    embeds: [embed],
    components: [],
  };
};

export const buildRaidStartFailedPrompt = ({
  participantIds,
}: {
  participantIds: readonly string[];
}): BaseMessageOptions => {
  const embed = new EmbedBuilder()
    .setColor(failureColor)
    .setTitle("Raid failed to start")
    .setDescription(
      [
        "Raid signup closed, but the boss thread could not be opened.",
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
    .setColor(failureColor)
    .setTitle("Raid cancelled")
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
