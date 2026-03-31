import { EmbedBuilder, type BaseMessageOptions } from "discord.js";
import {
  assertDiscordTextLength,
  discordEmbedDescriptionCharacterLimit,
  discordEmbedTitleCharacterLimit,
  formatDiscordRelativeTime,
  truncateDiscordText,
} from "../../../../shared/discord";

const activeColor = 0xb36b2d;
const successColor = 0x2f9e44;
const failureColor = 0x8b949e;
const hpBarWidth = 14;

const formatHpBar = (currentHp: number, maxHp: number): string => {
  const normalizedMaxHp = Math.max(1, maxHp);
  const normalizedCurrentHp = Math.max(0, Math.min(normalizedMaxHp, currentHp));
  const filledWidth = Math.round((normalizedCurrentHp / normalizedMaxHp) * hpBarWidth);
  const emptyWidth = Math.max(0, hpBarWidth - filledWidth);
  return `[${"#".repeat(filledWidth)}${"-".repeat(emptyWidth)}]`;
};

const formatParty = (participantIds: readonly string[]): string => {
  if (participantIds.length < 1) {
    return "No raiders locked in.";
  }

  return participantIds.map((participantId) => `<@${participantId}>`).join(", ");
};

const buildDescription = (lines: readonly string[]): string => {
  return truncateDiscordText(
    lines.filter((line) => line.length > 0).join("\n"),
    discordEmbedDescriptionCharacterLimit,
    "\n... (truncated)",
  );
};

export const buildRaidEncounterPrompt = ({
  bossName,
  bossLevel,
  encounterTitle,
  currentHp,
  maxHp,
  rewardSummary,
  participantIds,
  startsAtMs,
  endsAtMs,
}: {
  bossName: string;
  bossLevel: number;
  encounterTitle: string;
  currentHp: number;
  maxHp: number;
  rewardSummary: string;
  participantIds: readonly string[];
  startsAtMs: number;
  endsAtMs: number;
}): BaseMessageOptions => {
  const title = `${bossName} - Lv.${bossLevel}`;
  assertDiscordTextLength(title, "raid encounter prompt title", discordEmbedTitleCharacterLimit);

  const embed = new EmbedBuilder()
    .setColor(activeColor)
    .setTitle(title)
    .setDescription(
      buildDescription([
        `**${encounterTitle}**`,
        `Raid opened ${formatDiscordRelativeTime(startsAtMs)} and closes ${formatDiscordRelativeTime(endsAtMs)}.`,
        "Use /roll in this channel to damage the boss.",
        `Clear reward: **${rewardSummary}**.`,
        "",
        `HP: **${currentHp}/${maxHp}** ${formatHpBar(currentHp, maxHp)}`,
        `Party (${participantIds.length}): ${formatParty(participantIds)}`,
      ]),
    )
    .setFooter({ text: "Only this raid party can attack in this instance." });

  return {
    embeds: [embed],
    components: [],
  };
};

export const buildRaidResolvedPrompt = ({
  bossName,
  bossLevel,
  currentHp,
  maxHp,
  participantIds,
  rewardSummary,
  summary,
  resolvedAtMs,
  closeScheduledAtMs,
}: {
  bossName: string;
  bossLevel: number;
  currentHp: number;
  maxHp: number;
  participantIds: readonly string[];
  rewardSummary?: string | null;
  summary: string;
  resolvedAtMs: number;
  closeScheduledAtMs: number;
}): BaseMessageOptions => {
  const success = currentHp <= 0;
  const title = success
    ? `Raid Boss Defeated - ${bossName} Lv.${bossLevel}`
    : `Raid Timed Out - ${bossName} Lv.${bossLevel}`;
  assertDiscordTextLength(title, "raid resolved prompt title", discordEmbedTitleCharacterLimit);

  const embed = new EmbedBuilder()
    .setColor(success ? successColor : failureColor)
    .setTitle(title)
    .setDescription(
      buildDescription([
        summary,
        success && rewardSummary ? `Rewards granted: **${rewardSummary}**.` : "",
        `Raid ended ${formatDiscordRelativeTime(resolvedAtMs)}.`,
        `Final HP: **${Math.max(0, currentHp)}/${maxHp}** ${formatHpBar(currentHp, maxHp)}`,
        `Party (${participantIds.length}): ${formatParty(participantIds)}`,
        `This instance closes ${formatDiscordRelativeTime(closeScheduledAtMs)}.`,
      ]),
    );

  return {
    embeds: [embed],
    components: [],
  };
};
