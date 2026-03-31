import type { Client } from "discord.js";
import type { AchievementAnnouncement } from "../../dice/progression/application/achievement-announcements";
import { mergeAchievementAnnouncements } from "../../dice/progression/application/achievement-announcements";
import {
  getDiceAchievementRoleRewardId,
  getDiceAchievementRoleRewardUnlockText,
} from "../../dice/progression/domain/achievements";
import {
  grantDiscordRoleRewards,
  type DiscordRoleRewardGrant,
  type DiscordRoleReward,
} from "./role-rewards";

type AchievementRoleRewardsLogger = {
  warn: (...args: unknown[]) => void;
};

export type AchievementRoleRewardGrant = DiscordRoleRewardGrant;

const collectRoleRewards = (announcement: AchievementAnnouncement): DiscordRoleReward[] => {
  const rewardDefinitionsByRoleId = new Map<string, DiscordRoleReward>();

  for (const achievementId of announcement.achievementIds) {
    const roleRewardId = getDiceAchievementRoleRewardId(achievementId);
    if (!roleRewardId || rewardDefinitionsByRoleId.has(roleRewardId)) {
      continue;
    }

    rewardDefinitionsByRoleId.set(roleRewardId, {
      userId: announcement.userId,
      roleId: roleRewardId,
      unlockText: getDiceAchievementRoleRewardUnlockText(achievementId),
    });
  }

  return [...rewardDefinitionsByRoleId.values()];
};

export const publishAchievementRoleRewards = async ({
  client,
  announcements,
  logger = console,
}: {
  client: Client;
  announcements: readonly AchievementAnnouncement[];
  logger?: AchievementRoleRewardsLogger;
}): Promise<AchievementRoleRewardGrant[]> => {
  return grantDiscordRoleRewards({
    client,
    rewards: mergeAchievementAnnouncements(announcements).flatMap(collectRoleRewards),
    logger,
    logPrefix: "[achievements]",
  });
};
