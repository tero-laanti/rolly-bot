import type { Client, Guild, GuildMember, Role } from "discord.js";
import type { AchievementAnnouncement } from "../../dice/progression/application/achievement-announcements";
import { mergeAchievementAnnouncements } from "../../dice/progression/application/achievement-announcements";
import { getDiceAchievementRoleRewardId } from "../../dice/progression/domain/achievements";

type AchievementRoleRewardsLogger = {
  warn: (...args: unknown[]) => void;
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

const collectRoleRewardIds = (announcement: AchievementAnnouncement): string[] => {
  const roleRewardIds = announcement.achievementIds.flatMap((achievementId) => {
    const roleRewardId = getDiceAchievementRoleRewardId(achievementId);
    return roleRewardId ? [roleRewardId] : [];
  });

  return [...new Set(roleRewardIds)];
};

export const publishAchievementRoleRewards = async ({
  client,
  announcements,
  logger = console,
}: {
  client: Client;
  announcements: readonly AchievementAnnouncement[];
  logger?: AchievementRoleRewardsLogger;
}): Promise<void> => {
  for (const announcement of mergeAchievementAnnouncements(announcements)) {
    const roleRewardIds = collectRoleRewardIds(announcement);
    if (roleRewardIds.length < 1) {
      continue;
    }

    for (const roleRewardId of roleRewardIds) {
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
      } catch (error) {
        logger.warn("[achievements] Failed to publish achievement role reward.", error);
      }
    }
  }
};
