import type { Client, Guild, GuildMember, Role } from "discord.js";
import type { AchievementAnnouncement } from "../../dice/progression/application/achievement-announcements";
import { mergeAchievementAnnouncements } from "../../dice/progression/application/achievement-announcements";
import {
  getDiceAchievementRoleRewardId,
  getDiceAchievementRoleRewardUnlockText,
} from "../../dice/progression/domain/achievements";

type AchievementRoleRewardsLogger = {
  warn: (...args: unknown[]) => void;
};

export type AchievementRoleRewardGrant = {
  userId: string;
  roleId: string;
  roleName: string;
  unlockText?: string;
};

type AchievementRoleRewardDefinition = {
  roleRewardId: string;
  unlockText?: string;
};

const unknownRoleErrorCode = 10011;
const unknownMemberErrorCode = 10007;

const isDiscordErrorCode = (error: unknown, code: number): boolean => {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
};

const resolveRoleFromGuild = async (guild: Guild, roleId: string): Promise<Role | null> => {
  try {
    return await guild.roles.fetch(roleId);
  } catch (error) {
    if (isDiscordErrorCode(error, unknownRoleErrorCode)) {
      return null;
    }

    throw error;
  }
};

const findRole = async (client: Client, roleId: string): Promise<Role | null> => {
  for (const guild of client.guilds.cache.values()) {
    const role = await resolveRoleFromGuild(guild, roleId);
    if (role) {
      return role;
    }
  }

  return null;
};

const resolveMember = async (guild: Guild, userId: string): Promise<GuildMember | null> => {
  try {
    return await guild.members.fetch(userId);
  } catch (error) {
    if (isDiscordErrorCode(error, unknownMemberErrorCode)) {
      return null;
    }

    throw error;
  }
};

const collectRoleRewardDefinitions = (
  announcement: AchievementAnnouncement,
): AchievementRoleRewardDefinition[] => {
  const rewardDefinitionsByRoleId = new Map<string, AchievementRoleRewardDefinition>();

  for (const achievementId of announcement.achievementIds) {
    const roleRewardId = getDiceAchievementRoleRewardId(achievementId);
    if (!roleRewardId || rewardDefinitionsByRoleId.has(roleRewardId)) {
      continue;
    }

    rewardDefinitionsByRoleId.set(roleRewardId, {
      roleRewardId,
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
  const grantedRewards: AchievementRoleRewardGrant[] = [];

  for (const announcement of mergeAchievementAnnouncements(announcements)) {
    const roleRewardDefinitions = collectRoleRewardDefinitions(announcement);
    if (roleRewardDefinitions.length < 1) {
      continue;
    }

    for (const { roleRewardId, unlockText } of roleRewardDefinitions) {
      try {
        const role = await findRole(client, roleRewardId);
        if (!role) {
          logger.warn(
            `[achievements] Failed to resolve role reward ${roleRewardId} for user ${announcement.userId}.`,
          );
          continue;
        }

        const member = await resolveMember(role.guild, announcement.userId);
        if (!member) {
          logger.warn(
            `[achievements] Failed to resolve guild member ${announcement.userId} for role reward ${roleRewardId}.`,
          );
          continue;
        }

        if (member.roles.cache.has(role.id)) {
          continue;
        }

        await member.roles.add(role);
        grantedRewards.push({
          userId: announcement.userId,
          roleId: role.id,
          roleName: role.name,
          unlockText,
        });
      } catch (error) {
        logger.warn("[achievements] Failed to publish achievement role reward.", error);
      }
    }
  }

  return grantedRewards;
};
