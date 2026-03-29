import type { Client, Guild, GuildBasedChannel, Role } from "discord.js";
import type { RaidRecoveryInspector } from "../../application/ports";

const unknownMessageErrorCode = 10008;
const unknownChannelErrorCode = 10003;
const unknownRoleErrorCode = 10011;
const unknownMemberErrorCode = 10007;

const isDiscordErrorCode = (error: unknown, code: number): boolean => {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
};

const isUnknownMessageError = (error: unknown): boolean => {
  return isDiscordErrorCode(error, unknownMessageErrorCode);
};

const isUnknownChannelError = (error: unknown): boolean => {
  return isDiscordErrorCode(error, unknownChannelErrorCode);
};

const isUnknownRoleError = (error: unknown): boolean => {
  return isDiscordErrorCode(error, unknownRoleErrorCode);
};

const isUnknownMemberError = (error: unknown): boolean => {
  return isDiscordErrorCode(error, unknownMemberErrorCode);
};

const resolveGuildChannel = async (
  client: Client,
  channelId: string | null,
): Promise<GuildBasedChannel | null> => {
  if (!channelId) {
    return null;
  }

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !("guild" in channel)) {
      return null;
    }

    return channel;
  } catch (error) {
    if (isUnknownChannelError(error)) {
      return null;
    }

    throw error;
  }
};

const resolveRoleFromGuild = async (guild: Guild, roleId: string | null): Promise<Role | null> => {
  if (!roleId) {
    return null;
  }

  try {
    return await guild.roles.fetch(roleId);
  } catch (error) {
    if (isUnknownRoleError(error)) {
      return null;
    }

    throw error;
  }
};

const findGuildForRole = async (client: Client, roleId: string | null): Promise<Guild | null> => {
  if (!roleId) {
    return null;
  }

  for (const guild of client.guilds.cache.values()) {
    const role = await resolveRoleFromGuild(guild, roleId);
    if (role) {
      return guild;
    }
  }

  return null;
};

const deletePrivateChannel = async (
  client: Client,
  channelId: string | null,
): Promise<Guild | null> => {
  const channel = await resolveGuildChannel(client, channelId);
  if (!channel || !("delete" in channel) || typeof channel.delete !== "function") {
    return channel?.guild ?? null;
  }

  await channel.delete();
  return channel.guild;
};

const deleteParticipantRole = async (
  client: Client,
  guild: Guild | null,
  roleId: string | null,
): Promise<void> => {
  if (!roleId) {
    return;
  }

  const targetGuild = guild ?? (await findGuildForRole(client, roleId));
  if (!targetGuild) {
    return;
  }

  const role = await resolveRoleFromGuild(targetGuild, roleId);
  if (!role) {
    return;
  }

  await role.delete();
};

export const createDiscordRaidRecoveryInspector = (client: Client): RaidRecoveryInspector => {
  return {
    hasPublicStatusMessage: async ({ channelId, messageId }) => {
      try {
        const channel = await client.channels.fetch(channelId);
        if (
          !channel ||
          !channel.isTextBased() ||
          !("messages" in channel) ||
          typeof channel.messages !== "object" ||
          channel.messages === null ||
          !("fetch" in channel.messages) ||
          typeof channel.messages.fetch !== "function"
        ) {
          return false;
        }

        await channel.messages.fetch(messageId);
        return true;
      } catch (error) {
        if (isUnknownMessageError(error) || isUnknownChannelError(error)) {
          return false;
        }

        throw error;
      }
    },
    deletePublicStatusMessage: async ({ channelId, messageId }) => {
      try {
        const channel = await client.channels.fetch(channelId);
        if (
          !channel ||
          !channel.isTextBased() ||
          !("messages" in channel) ||
          typeof channel.messages !== "object" ||
          channel.messages === null ||
          !("fetch" in channel.messages) ||
          typeof channel.messages.fetch !== "function"
        ) {
          return;
        }

        const message = await channel.messages.fetch(messageId);
        await message.delete();
      } catch (error) {
        if (isUnknownMessageError(error) || isUnknownChannelError(error)) {
          return;
        }

        throw error;
      }
    },
    inspectProvisionedRunResources: async ({
      privateChannelId,
      participantRoleId,
      participantUserIds,
    }) => {
      const privateChannel = await resolveGuildChannel(client, privateChannelId);
      const privateChannelExists = privateChannel !== null;
      const channelGuild = privateChannel?.guild ?? null;
      const roleGuild = channelGuild ?? (await findGuildForRole(client, participantRoleId));
      const participantRole =
        roleGuild === null ? null : await resolveRoleFromGuild(roleGuild, participantRoleId);
      const participantRoleExists = participantRole !== null;

      if (!privateChannelExists || !participantRoleExists || !channelGuild) {
        return {
          privateChannelExists,
          participantRoleExists,
          participantAssignmentsValid: false,
        };
      }

      if (participantRole.guild.id !== channelGuild.id) {
        return {
          privateChannelExists,
          participantRoleExists,
          participantAssignmentsValid: false,
        };
      }

      for (const userId of participantUserIds) {
        try {
          const member = await channelGuild.members.fetch(userId);
          if (!member.roles.cache.has(participantRole.id)) {
            return {
              privateChannelExists,
              participantRoleExists,
              participantAssignmentsValid: false,
            };
          }
        } catch (error) {
          if (isUnknownMemberError(error)) {
            return {
              privateChannelExists,
              participantRoleExists,
              participantAssignmentsValid: false,
            };
          }

          throw error;
        }
      }

      return {
        privateChannelExists,
        participantRoleExists,
        participantAssignmentsValid: true,
      };
    },
    cleanupProvisionedRunResources: async ({ privateChannelId, participantRoleId }) => {
      const guild = await deletePrivateChannel(client, privateChannelId);
      await deleteParticipantRole(client, guild, participantRoleId);
    },
  };
};
