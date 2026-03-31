import type { Client, Message, MessageMentionOptions } from "discord.js";
import type { AchievementsChannelConfig } from "../../shared/config";
import { achievementsChannelConfig } from "../../shared/config";
import type { AchievementAnnouncement } from "../../dice/progression/application/achievement-announcements";
import { mergeAchievementAnnouncements } from "../../dice/progression/application/achievement-announcements";
import { getDiceAchievement } from "../../dice/progression/domain/achievements";
import type { AchievementRoleRewardGrant } from "./achievement-role-rewards";

type SendableMessageChannel = {
  send: (options: { content: string; allowedMentions: MessageMentionOptions }) => Promise<Message>;
};

type AchievementAnnouncementsLogger = {
  warn: (...args: unknown[]) => void;
};

const formatAchievementAnnouncementEntry = (achievementId: string): string => {
  const achievement = getDiceAchievement(achievementId);
  if (!achievement) {
    return achievementId;
  }

  if (achievement.hidden) {
    return achievement.name;
  }

  const rewardText =
    achievement.pipReward > 0
      ? `, +${achievement.pipReward} pip${achievement.pipReward === 1 ? "" : "s"}`
      : "";
  if (!achievement.unlockReasonText) {
    return `${achievement.name}${rewardText}`;
  }

  return `${achievement.name} (${achievement.unlockReasonText}${rewardText})`;
};

const isSendableMessageChannel = (value: unknown): value is SendableMessageChannel => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const channel = value as {
    send?: unknown;
  };
  return typeof channel.send === "function";
};

const resolveAchievementsChannel = async (
  client: Client,
  channelId: string,
): Promise<SendableMessageChannel> => {
  const channel = await client.channels.fetch(channelId);
  if (!channel || !channel.isTextBased() || !isSendableMessageChannel(channel)) {
    throw new Error(
      `ACHIEVEMENTS_CHANNEL_ID must reference a sendable text channel. Received ${channelId}.`,
    );
  }

  return channel;
};

export const formatAchievementAnnouncementContent = (
  announcement: AchievementAnnouncement,
  roleRewardGrants: readonly AchievementRoleRewardGrant[] = [],
): string => {
  const entries = announcement.achievementIds.map(formatAchievementAnnouncementEntry);
  const label = entries.length === 1 ? "Achievement" : "Achievements";
  const grantedRoleRewards = roleRewardGrants.filter(
    (grant) => grant.userId === announcement.userId,
  );
  if (grantedRoleRewards.length < 1) {
    return `<@${announcement.userId}> ${label} unlocked: ${entries.join(", ")}.`;
  }

  const roleLabel = grantedRoleRewards.length === 1 ? "New role unlocked" : "New roles unlocked";
  const roleNames = grantedRoleRewards.map((grant) => grant.roleName).join(", ");
  const unlockTexts = [
    ...new Set(grantedRoleRewards.flatMap((grant) => (grant.unlockText ? [grant.unlockText] : []))),
  ];
  const unlockTextSuffix = unlockTexts.length > 0 ? ` ${unlockTexts.join(" ")}` : "";

  return `<@${announcement.userId}> ${label} unlocked: ${entries.join(", ")}. ${roleLabel}: ${roleNames}. Role-gated channels or access may now be available.${unlockTextSuffix}`;
};

export const publishAchievementAnnouncements = async ({
  client,
  announcements,
  roleRewardGrants = [],
  config = achievementsChannelConfig,
  logger = console,
}: {
  client: Client;
  announcements: readonly AchievementAnnouncement[];
  roleRewardGrants?: readonly AchievementRoleRewardGrant[];
  config?: AchievementsChannelConfig;
  logger?: AchievementAnnouncementsLogger;
}): Promise<void> => {
  if (!config.enabled || !config.channelId || announcements.length < 1) {
    return;
  }

  let channel: SendableMessageChannel;
  try {
    channel = await resolveAchievementsChannel(client, config.channelId);
  } catch (error) {
    logger.warn("[achievements] Failed to resolve achievements channel.", error);
    return;
  }

  for (const announcement of mergeAchievementAnnouncements(announcements)) {
    try {
      await channel.send({
        content: formatAchievementAnnouncementContent(announcement, roleRewardGrants ?? []),
        allowedMentions: {
          parse: [],
          users: [announcement.userId],
        },
      });
    } catch (error) {
      logger.warn("[achievements] Failed to publish achievement announcement.", error);
    }
  }
};
