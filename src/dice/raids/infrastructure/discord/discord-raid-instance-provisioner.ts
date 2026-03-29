import { ChannelType, PermissionFlagsBits, type Client, type GuildBasedChannel } from "discord.js";
import type { RaidsConfig } from "../../../../shared/config";
import type { RaidInstanceProvisioner } from "../../application/ports";
import { createDiscordRaidRecoveryInspector } from "./discord-raid-recovery-inspector";

const maxDiscordNameLength = 100;

const slugifyNamePart = (value: string): string => {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized.length > 0 ? normalized : "raid";
};

const truncateName = (value: string): string => {
  return value.slice(0, maxDiscordNameLength);
};

const buildRaidRoleName = (tierName: string, bossName: string, runId: string): string => {
  return truncateName(`Raid ${tierName} ${bossName} ${runId.slice(0, 6)}`);
};

const buildRaidChannelName = (tierName: string, bossName: string, runId: string): string => {
  return truncateName(
    `raid-${slugifyNamePart(tierName)}-${slugifyNamePart(bossName)}-${runId.slice(0, 6).toLowerCase()}`,
  );
};

const resolveGuildChannel = async (
  client: Client,
  channelId: string,
): Promise<GuildBasedChannel | null> => {
  const channel = await client.channels.fetch(channelId);
  if (!channel || !("guild" in channel)) {
    return null;
  }

  return channel;
};

export const createDiscordRaidInstanceProvisioner = ({
  client,
  config,
}: {
  client: Client;
  config: RaidsConfig;
}): RaidInstanceProvisioner => {
  const inspector = createDiscordRaidRecoveryInspector(client);

  return {
    provisionRaidInstance: async ({
      runId,
      publicChannelId,
      participantUserIds,
      tierName,
      bossName,
    }) => {
      if (!config.instanceCategoryId) {
        return {
          ok: false,
          reason: "RAIDS_INSTANCE_CATEGORY_ID is not set.",
        };
      }

      const publicChannel = await resolveGuildChannel(client, publicChannelId);
      if (!publicChannel) {
        return {
          ok: false,
          reason: "Raid public channel is unavailable.",
        };
      }

      const guild = publicChannel.guild;
      const category = await guild.channels.fetch(config.instanceCategoryId);
      if (!category || category.type !== ChannelType.GuildCategory) {
        return {
          ok: false,
          reason: "RAIDS_INSTANCE_CATEGORY_ID must reference a guild category.",
        };
      }

      let participantRoleId: string | null = null;
      let privateChannelId: string | null = null;

      try {
        const participantRole = await guild.roles.create({
          name: buildRaidRoleName(tierName, bossName, runId),
          mentionable: false,
        });
        participantRoleId = participantRole.id;

        const privateChannel = await guild.channels.create({
          name: buildRaidChannelName(tierName, bossName, runId),
          type: ChannelType.GuildText,
          parent: category.id,
          permissionOverwrites: [
            {
              id: guild.roles.everyone.id,
              deny: [PermissionFlagsBits.ViewChannel],
            },
            {
              id: participantRole.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
              ],
            },
          ],
        });
        privateChannelId = privateChannel.id;

        for (const participantUserId of participantUserIds) {
          const member = await guild.members.fetch(participantUserId);
          await member.roles.add(participantRole);
        }

        return {
          ok: true,
          privateChannelId,
          participantRoleId,
        };
      } catch (error) {
        return {
          ok: false,
          reason: error instanceof Error ? error.message : String(error),
          privateChannelId,
          participantRoleId,
        };
      }
    },
    cleanupRaidInstance: async ({ privateChannelId, participantRoleId }) => {
      await inspector.cleanupProvisionedRunResources({
        privateChannelId,
        participantRoleId,
      });
    },
  };
};
