import type { Client, Guild, GuildMember, Role } from "discord.js";

type RoleRewardsLogger = {
  warn?: (...args: unknown[]) => void;
};

export type DiscordRoleReward = {
  userId: string;
  roleId: string;
  unlockText?: string;
};

export type DiscordRoleRewardGrant = {
  userId: string;
  roleId: string;
  roleName: string;
  unlockText?: string;
};

export type DiscordGuildRoleGrantStatus =
  | "granted"
  | "already-had-role"
  | "missing-guild"
  | "missing-role"
  | "missing-member"
  | "failed";

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

const resolveGuild = async (client: Client, guildId: string): Promise<Guild | null> => {
  const cached = client.guilds.cache.get(guildId);
  if (cached) {
    return cached;
  }

  try {
    return await client.guilds.fetch(guildId);
  } catch {
    return null;
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

const dedupeRewards = (rewards: readonly DiscordRoleReward[]): DiscordRoleReward[] => {
  const dedupedByUserRole = new Map<string, DiscordRoleReward>();

  for (const reward of rewards) {
    const key = `${reward.userId}:${reward.roleId}`;
    if (dedupedByUserRole.has(key)) {
      continue;
    }

    dedupedByUserRole.set(key, reward);
  }

  return [...dedupedByUserRole.values()];
};

export const grantDiscordRoleRewards = async ({
  client,
  rewards,
  logger = console,
  logPrefix = "[roles]",
}: {
  client: Client;
  rewards: readonly DiscordRoleReward[];
  logger?: RoleRewardsLogger;
  logPrefix?: string;
}): Promise<DiscordRoleRewardGrant[]> => {
  const grantedRewards: DiscordRoleRewardGrant[] = [];

  for (const reward of dedupeRewards(rewards)) {
    try {
      const role = await findRole(client, reward.roleId);
      if (!role) {
        logger.warn?.(
          `${logPrefix} Failed to resolve role reward ${reward.roleId} for user ${reward.userId}.`,
        );
        continue;
      }

      const member = await resolveMember(role.guild, reward.userId);
      if (!member) {
        logger.warn?.(
          `${logPrefix} Failed to resolve guild member ${reward.userId} for role reward ${reward.roleId}.`,
        );
        continue;
      }

      if (member.roles.cache.has(role.id)) {
        continue;
      }

      await member.roles.add(role);
      grantedRewards.push({
        userId: reward.userId,
        roleId: role.id,
        roleName: role.name,
        unlockText: reward.unlockText,
      });
    } catch (error) {
      logger.warn?.(`${logPrefix} Failed to grant role reward.`, error);
    }
  }

  return grantedRewards;
};

export const grantDiscordRoleRewardInGuild = async ({
  client,
  guildId,
  userId,
  roleId,
  logger = console,
  logPrefix = "[roles]",
}: {
  client: Client;
  guildId: string;
  userId: string;
  roleId: string;
  logger?: RoleRewardsLogger;
  logPrefix?: string;
}): Promise<DiscordGuildRoleGrantStatus> => {
  try {
    const guild = await resolveGuild(client, guildId);
    if (!guild) {
      logger.warn?.(`${logPrefix} Failed to resolve guild ${guildId} for role reward ${roleId}.`);
      return "missing-guild";
    }

    const role = await resolveRoleFromGuild(guild, roleId);
    if (!role) {
      logger.warn?.(`${logPrefix} Failed to resolve role reward ${roleId} in guild ${guildId}.`);
      return "missing-role";
    }

    const member = await resolveMember(guild, userId);
    if (!member) {
      logger.warn?.(
        `${logPrefix} Failed to resolve guild member ${userId} in guild ${guildId} for role reward ${roleId}.`,
      );
      return "missing-member";
    }

    if (member.roles.cache.has(role.id)) {
      return "already-had-role";
    }

    await member.roles.add(role);
    return "granted";
  } catch (error) {
    logger.warn?.(`${logPrefix} Failed to grant guild-scoped role reward.`, error);
    return "failed";
  }
};
