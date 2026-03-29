import assert from "node:assert/strict";
import test from "node:test";
import { ChannelType, PermissionFlagsBits } from "discord.js";
import { createDiscordRaidInstanceProvisioner } from "./discord-raid-instance-provisioner";

test("raid instance provisioner grants the bot explicit access to the private raid channel", async () => {
  let createdPermissionOverwrites: Array<{
    id: string;
    allow?: readonly bigint[];
    deny?: readonly bigint[];
  }> = [];

  const participantRole = {
    id: "participant-role-1",
  };

  const provisioner = createDiscordRaidInstanceProvisioner({
    client: {
      user: {
        id: "bot-user-1",
      },
      channels: {
        fetch: async (channelId: string) =>
          channelId === "public-channel-1"
            ? {
                guild: {
                  roles: {
                    everyone: {
                      id: "everyone-role",
                    },
                    create: async () => participantRole,
                  },
                  channels: {
                    fetch: async () => ({
                      id: "category-1",
                      type: ChannelType.GuildCategory,
                    }),
                    create: async (input: {
                      permissionOverwrites: Array<{
                        id: string;
                        allow?: readonly bigint[];
                        deny?: readonly bigint[];
                      }>;
                    }) => {
                      createdPermissionOverwrites = input.permissionOverwrites;
                      return {
                        id: "private-channel-1",
                      };
                    },
                  },
                  members: {
                    fetch: async () => ({
                      roles: {
                        add: async () => {},
                      },
                    }),
                  },
                },
              }
            : null,
      },
    } as never,
    config: {
      enabled: true,
      inactiveReason: null,
      instanceCategoryId: "category-1",
      tierBindings: {
        bronze: {
          panelChannelId: "public-channel-1",
          accessRoleId: "raid-role-1",
        },
      },
    },
  });

  const result = await provisioner.provisionRaidInstance({
    runId: "raid-run-1",
    publicChannelId: "public-channel-1",
    participantUserIds: ["leader-1", "user-2"],
    tierName: "Bronze Raids",
    bossName: "Bone Drake",
    leaderUserId: "leader-1",
  });

  assert.deepEqual(result, {
    ok: true,
    privateChannelId: "private-channel-1",
    participantRoleId: "participant-role-1",
  });

  const botOverwrite = createdPermissionOverwrites.find(
    (overwrite) => overwrite.id === "bot-user-1",
  );
  assert.ok(botOverwrite);
  assert.deepEqual(botOverwrite.allow, [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.ManageChannels,
  ]);
});
