import type { Client } from "discord.js";
import {
  publishAchievementsChannelMessages,
  type AchievementsChannelMessage,
} from "../../../app/discord/achievements-channel";
import { grantDiscordRoleRewards } from "../../../app/discord/role-rewards";
import type { RaidTierDefinition } from "../domain/catalog";
import { getActiveRaidRunMembers, type RaidRunAggregate } from "../domain/raid-run";

type RaidTierRoleRewardsLogger = {
  warn?: (...args: unknown[]) => void;
};

export const grantRaidTierRoleRewards = async ({
  client,
  raidRun,
  tier,
  logger = console,
}: {
  client: Client;
  raidRun: RaidRunAggregate;
  tier: RaidTierDefinition;
  logger?: RaidTierRoleRewardsLogger;
}): Promise<void> => {
  if (!tier.roleReward) {
    return;
  }

  const grantedRewards = await grantDiscordRoleRewards({
    client,
    rewards: getActiveRaidRunMembers(raidRun).map((member) => ({
      userId: member.userId,
      roleId: tier.roleReward!.roleRewardId,
      unlockText: tier.roleReward!.unlockAnnouncementText,
    })),
    logger,
    logPrefix: "[raids]",
  });
  if (grantedRewards.length < 1) {
    return;
  }

  const messages: AchievementsChannelMessage[] = grantedRewards.map((grant) => ({
    content: `<@${grant.userId}> New raid role unlocked: ${grant.roleName}. ${grant.unlockText ?? "New raid-tier access may now be available."}`,
    mentionedUserIds: [grant.userId],
  }));
  await publishAchievementsChannelMessages({
    client,
    messages,
    logger,
  });
};
