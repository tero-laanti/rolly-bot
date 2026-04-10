import type { Client } from "discord.js";
import type { AchievementsChannelConfig } from "../../shared/config";
import { achievementsChannelConfig } from "../../shared/config";
import type { AchievementAnnouncement } from "../../dice/progression/application/achievement-announcements";
import { mergeAchievementAnnouncements } from "../../dice/progression/application/achievement-announcements";
import { getDiceAchievement } from "../../dice/progression/domain/achievements";
import type { AchievementRoleRewardGrant } from "./achievement-role-rewards";
import { publishAchievementsChannelMessages } from "./achievements-channel";

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

  return `<@${announcement.userId}> ${label} unlocked: ${entries.join(", ")}. ${roleLabel}: ${roleNames}.${unlockTextSuffix}`;
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
  if (announcements.length < 1) {
    return;
  }

  await publishAchievementsChannelMessages({
    client,
    messages: mergeAchievementAnnouncements(announcements).map((announcement) => ({
      content: formatAchievementAnnouncementContent(announcement, roleRewardGrants ?? []),
      mentionedUserIds: [announcement.userId],
    })),
    config,
    logger,
  });
};
