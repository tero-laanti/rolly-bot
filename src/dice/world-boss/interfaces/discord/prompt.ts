import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type BaseMessageOptions,
} from "discord.js";
import {
  assertDiscordTextLength,
  discordEmbedDescriptionCharacterLimit,
  discordEmbedTitleCharacterLimit,
  formatDiscordFullTime,
  formatDiscordRelativeTime,
  truncateDiscordText,
} from "../../../../shared/discord";
import type { WorldBossOutcome } from "../../application/ports";
import { buildWorldBossJoinButtonId, buildWorldBossLeaveButtonId } from "./button-ids";

const worldBossColor = 0xb33a3a;
const successColor = 0x2f9e44;
const failureColor = 0x8b949e;

const maxVisibleParticipants = 20;
const hpBarWidth = 14;

const formatOverflowLine = (hiddenCount: number, noun: string): string => {
  return `...and ${hiddenCount} more ${noun}${hiddenCount === 1 ? "" : "s"}.`;
};

const formatParticipants = (
  participantIds: readonly string[],
  maxVisible: number = maxVisibleParticipants,
): string => {
  if (participantIds.length < 1) {
    return "No challengers yet - be the first to join.";
  }

  const visibleParticipantMentions = participantIds
    .slice(0, maxVisible)
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

const buildContributionLines = (
  contributionLines: readonly string[],
  maxVisible: number,
): string[] => {
  if (contributionLines.length < 1) {
    return ["No damage logged yet."];
  }

  if (maxVisible <= 0) {
    return [formatOverflowLine(contributionLines.length, "damage line")];
  }

  const visibleLines = contributionLines.slice(0, maxVisible);
  const hiddenLineCount = contributionLines.length - visibleLines.length;
  if (hiddenLineCount < 1) {
    return visibleLines;
  }

  return [...visibleLines, formatOverflowLine(hiddenLineCount, "damage line")];
};

const buildWorldBossDescriptionWithinLimit = ({
  linesBeforeParticipants,
  participantIds,
  contributionLines = null,
}: {
  linesBeforeParticipants: string[];
  participantIds: readonly string[];
  contributionLines?: readonly string[] | null;
}): string => {
  const buildDescription = ({
    participantMaxVisible,
    contributionMaxVisible,
  }: {
    participantMaxVisible: number;
    contributionMaxVisible: number;
  }): string => {
    const lines = [
      ...linesBeforeParticipants,
      "",
      `**Joined players (${participantIds.length})**`,
      formatParticipants(participantIds, participantMaxVisible),
    ];

    if (contributionLines && contributionLines.length > 0) {
      lines.push(
        "",
        "**Damage leaders**",
        ...buildContributionLines(contributionLines, contributionMaxVisible),
      );
    }

    return lines.join("\n");
  };

  let participantMaxVisible =
    participantIds.length > 0 ? Math.min(maxVisibleParticipants, participantIds.length) : 0;
  let contributionMaxVisible = contributionLines?.length ?? 0;
  let description = buildDescription({
    participantMaxVisible,
    contributionMaxVisible,
  });

  while (description.length > discordEmbedDescriptionCharacterLimit && contributionMaxVisible > 0) {
    contributionMaxVisible -= 1;
    description = buildDescription({
      participantMaxVisible,
      contributionMaxVisible,
    });
  }

  while (description.length > discordEmbedDescriptionCharacterLimit && participantMaxVisible > 1) {
    participantMaxVisible -= 1;
    description = buildDescription({
      participantMaxVisible,
      contributionMaxVisible,
    });
  }

  return truncateDiscordText(
    description,
    discordEmbedDescriptionCharacterLimit,
    "\n... (truncated)",
  );
};

const getOutcomePresentation = (
  outcome: WorldBossOutcome,
): {
  color: number;
  title: string;
  summaryLine: string;
} => {
  if (outcome === "success") {
    return {
      color: successColor,
      title: "World Boss defeated",
      summaryLine: "The boss was defeated in time.",
    };
  }

  return {
    color: failureColor,
    title: "World Boss escaped",
    summaryLine: "The boss escaped when the world boss timer expired.",
  };
};

export const buildWorldBossAnnouncementPrompt = ({
  worldBossId,
  participantIds,
  scheduledStartAtMs,
  disabled = false,
  bossName = null,
  threadId = null,
}: {
  worldBossId: string;
  participantIds: readonly string[];
  scheduledStartAtMs: number;
  disabled?: boolean;
  bossName?: string | null;
  threadId?: string | null;
}): BaseMessageOptions => {
  const descriptionLines = [
    disabled
      ? `World Boss signup closed ${formatDiscordRelativeTime(scheduledStartAtMs)}.`
      : `The World Boss fight begins ${formatDiscordRelativeTime(scheduledStartAtMs)}.`,
    `Start time: ${formatDiscordFullTime(scheduledStartAtMs)}.`,
  ];

  if (disabled && bossName && threadId) {
    descriptionLines.push(`Boss: **${bossName}**.`, `Fight in <#${threadId}>.`);
  } else {
    descriptionLines.push(
      disabled
        ? "This World Boss is no longer accepting new players."
        : "Join now before the World Boss arrives.",
    );
  }

  const title = disabled ? "World Boss signup closed" : "Incoming World Boss";
  assertDiscordTextLength(title, "world boss prompt title", discordEmbedTitleCharacterLimit);

  const embed = new EmbedBuilder()
    .setColor(worldBossColor)
    .setTitle(title)
    .setDescription(
      buildWorldBossDescriptionWithinLimit({
        linesBeforeParticipants: descriptionLines,
        participantIds,
      }),
    )
    .setFooter({
      text: disabled
        ? "Joined players are now locked for this World Boss."
        : "Joined players will be carried into the active World Boss fight.",
    });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildWorldBossJoinButtonId(worldBossId))
      .setLabel("Join World Boss")
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(buildWorldBossLeaveButtonId(worldBossId))
      .setLabel("Leave World Boss")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
  );

  return {
    embeds: [embed],
    components: [row],
  };
};

export const buildWorldBossActivePrompt = ({
  participantIds,
  eligibleParticipantCount,
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
  eligibleParticipantCount: number;
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
  const title = `${bossName} - Lv.${bossLevel}`;
  assertDiscordTextLength(title, "world boss active prompt title", discordEmbedTitleCharacterLimit);
  const embed = new EmbedBuilder()
    .setColor(worldBossColor)
    .setTitle(title)
    .setDescription(
      buildWorldBossDescriptionWithinLimit({
        linesBeforeParticipants: [
          `Fight in <#${threadId}>.`,
          `World Boss opened ${formatDiscordRelativeTime(startedAtMs)} and closes ${formatDiscordRelativeTime(endsAtMs)}.`,
          "Only joined players using /roll in this thread deal damage.",
          "Land at least one hit in this thread to qualify for the clear reward.",
          "",
          `HP: **${currentHp}/${maxHp}** ${formatHpBar(currentHp, maxHp)}`,
          `Total damage: **${totalDamage}** across ${totalAttacks} hit${totalAttacks === 1 ? "" : "s"}.`,
          `Reward-eligible players: **${eligibleParticipantCount}**.`,
          `Base reward on success: **${rewardSummary}**.`,
        ],
        participantIds,
        contributionLines,
      }),
    )
    .setFooter({ text: "Use /roll inside the World Boss thread to attack." });

  return {
    embeds: [embed],
    components: [],
  };
};

export const buildWorldBossResolvedPrompt = ({
  participantIds,
  eligibleParticipantCount,
  resolvedAtMs,
  outcome,
  bossName,
  bossLevel,
  maxHp,
  rewardSummary,
  contributionLines,
  doubleRollRushChannelId = null,
  doubleRollRushEndsAtMs = null,
  doubleRollRushFailed = false,
}: {
  participantIds: readonly string[];
  eligibleParticipantCount: number;
  resolvedAtMs: number;
  outcome: WorldBossOutcome;
  bossName: string;
  bossLevel: number;
  maxHp: number;
  rewardSummary: string;
  contributionLines: readonly string[];
  doubleRollRushChannelId?: string | null;
  doubleRollRushEndsAtMs?: number | null;
  doubleRollRushFailed?: boolean;
}): BaseMessageOptions => {
  const presentation = getOutcomePresentation(outcome);
  const rewardLine =
    outcome === "success"
      ? `Reward applied to ${eligibleParticipantCount} eligible player${eligibleParticipantCount === 1 ? "" : "s"}: **${rewardSummary}**.`
      : "";
  const doubleRollRushLine =
    outcome === "success" && doubleRollRushChannelId && doubleRollRushEndsAtMs
      ? `Roll Paradise is live in <#${doubleRollRushChannelId}> until ${formatDiscordRelativeTime(doubleRollRushEndsAtMs)}. Use /roll there for the normal double-roll buff.`
      : outcome === "success" && doubleRollRushFailed
        ? "Roll Paradise could not be opened automatically. The clear reward still applied."
        : "";
  const title = `${presentation.title} - ${bossName} Lv.${bossLevel}`;
  assertDiscordTextLength(
    title,
    "world boss resolved prompt title",
    discordEmbedTitleCharacterLimit,
  );

  const embed = new EmbedBuilder()
    .setColor(presentation.color)
    .setTitle(title)
    .setDescription(
      buildWorldBossDescriptionWithinLimit({
        linesBeforeParticipants: [
          `${presentation.summaryLine} The World Boss ended ${formatDiscordRelativeTime(resolvedAtMs)}.`,
          `Boss HP pool: **${maxHp}**.`,
          rewardLine,
          doubleRollRushLine,
        ].filter((line) => line.length > 0),
        participantIds,
        contributionLines,
      }),
    );

  return {
    embeds: [embed],
    components: [],
  };
};

export const buildWorldBossRollParadiseKickoffPrompt = ({
  endsAtMs,
}: {
  endsAtMs: number;
}): BaseMessageOptions => {
  const embed = new EmbedBuilder()
    .setColor(successColor)
    .setTitle("Roll Paradise")
    .setDescription(
      truncateDiscordText(
        [
          `Use /roll in this channel until ${formatDiscordRelativeTime(endsAtMs)}.`,
          "All /rolls in this channel gain the normal double-roll buff.",
          "Other double-roll sources stack with this channel's ×2 boost.",
        ].join("\n"),
        discordEmbedDescriptionCharacterLimit,
        "\n... (truncated)",
      ),
    )
    .setFooter({ text: "When Roll Paradise closes, rolls here go back to normal." });

  return {
    embeds: [embed],
    components: [],
  };
};

export const buildWorldBossResolveFailedPrompt = ({
  participantIds,
  resolvedAtMs,
  bossName,
  outcome,
}: {
  participantIds: readonly string[];
  resolvedAtMs: number;
  bossName: string | null;
  outcome: WorldBossOutcome | null;
}): BaseMessageOptions => {
  const outcomeText =
    outcome === "success"
      ? "The World Boss was defeated."
      : outcome === "failure"
        ? "The World Boss timer expired."
        : "The World Boss ended.";
  const title = "World Boss ended with cleanup needed";
  assertDiscordTextLength(
    title,
    "world boss cleanup prompt title",
    discordEmbedTitleCharacterLimit,
  );

  const embed = new EmbedBuilder()
    .setColor(failureColor)
    .setTitle(title)
    .setDescription(
      buildWorldBossDescriptionWithinLimit({
        linesBeforeParticipants: [
          `${outcomeText} Cleanup failed ${formatDiscordRelativeTime(resolvedAtMs)}.`,
          bossName ? `Boss: **${bossName}**.` : "",
          "A moderator may need to tidy the stale World Boss message manually.",
        ].filter((line) => line.length > 0),
        participantIds,
      }),
    );

  return {
    embeds: [embed],
    components: [],
  };
};

export const buildWorldBossInterruptedPrompt = ({
  participantIds,
  bossName = null,
}: {
  participantIds: readonly string[];
  bossName?: string | null;
}): BaseMessageOptions => {
  const title = "World Boss interrupted";
  assertDiscordTextLength(
    title,
    "world boss interrupted prompt title",
    discordEmbedTitleCharacterLimit,
  );
  const embed = new EmbedBuilder()
    .setColor(failureColor)
    .setTitle(title)
    .setDescription(
      buildWorldBossDescriptionWithinLimit({
        linesBeforeParticipants: [
          "This World Boss was closed while the bot restarted.",
          bossName ? `Boss: **${bossName}**.` : "",
        ].filter((line) => line.length > 0),
        participantIds,
      }),
    );

  return {
    embeds: [embed],
    components: [],
  };
};

export const buildWorldBossStartFailedPrompt = ({
  participantIds,
}: {
  participantIds: readonly string[];
}): BaseMessageOptions => {
  const title = "World Boss failed to start";
  assertDiscordTextLength(
    title,
    "world boss start failed prompt title",
    discordEmbedTitleCharacterLimit,
  );
  const embed = new EmbedBuilder()
    .setColor(failureColor)
    .setTitle(title)
    .setDescription(
      buildWorldBossDescriptionWithinLimit({
        linesBeforeParticipants: [
          "World Boss signup closed, but the boss thread could not be opened.",
        ],
        participantIds,
      }),
    );

  return {
    embeds: [embed],
    components: [],
  };
};

export const buildWorldBossCancelledPrompt = ({
  scheduledStartAtMs,
}: {
  scheduledStartAtMs: number;
}): BaseMessageOptions => {
  const title = "World Boss cancelled";
  assertDiscordTextLength(
    title,
    "world boss cancelled prompt title",
    discordEmbedTitleCharacterLimit,
  );
  const embed = new EmbedBuilder()
    .setColor(failureColor)
    .setTitle(title)
    .setDescription(
      truncateDiscordText(
        [
          "Nobody joined before the boss arrived.",
          `Scheduled start: ${formatDiscordFullTime(scheduledStartAtMs)}.`,
        ].join("\n"),
        discordEmbedDescriptionCharacterLimit,
        "\n... (truncated)",
      ),
    );

  return {
    embeds: [embed],
    components: [],
  };
};
