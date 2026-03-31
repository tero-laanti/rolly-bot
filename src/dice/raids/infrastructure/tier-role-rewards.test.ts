import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const moduleRequire = createRequire(__filename);

const clearModules = (modulePaths: readonly string[]): void => {
  for (const modulePath of modulePaths) {
    const resolved = moduleRequire.resolve(modulePath);
    delete require.cache[resolved];
  }
};

test("grantRaidTierRoleRewards grants the tier role to active raiders and publishes the unlock copy", async () => {
  const modulePaths = [
    "../../../app/discord/achievements-channel",
    "../../../app/discord/role-rewards",
    "./tier-role-rewards",
  ] as const;
  clearModules(modulePaths);

  const achievementsChannelModule = moduleRequire(
    "../../../app/discord/achievements-channel",
  ) as typeof import("../../../app/discord/achievements-channel");
  const originalPublishAchievementsChannelMessages =
    achievementsChannelModule.publishAchievementsChannelMessages;
  const roleRewardsModule = moduleRequire(
    "../../../app/discord/role-rewards",
  ) as typeof import("../../../app/discord/role-rewards");
  const originalGrantDiscordRoleRewards = roleRewardsModule.grantDiscordRoleRewards;

  const publishedMessages: string[] = [];
  const roleRewardRequests: Array<{ userId: string; roleId: string; unlockText?: string }> = [];

  try {
    (
      roleRewardsModule as {
        grantDiscordRoleRewards: typeof roleRewardsModule.grantDiscordRoleRewards;
      }
    ).grantDiscordRoleRewards = async ({ rewards }) => {
      roleRewardRequests.push(...rewards);
      return rewards.map((reward) => ({
        userId: reward.userId,
        roleId: reward.roleId,
        roleName: "Bronze Raider",
        unlockText: reward.unlockText,
      }));
    };
    (
      achievementsChannelModule as {
        publishAchievementsChannelMessages: typeof achievementsChannelModule.publishAchievementsChannelMessages;
      }
    ).publishAchievementsChannelMessages = async ({ messages }) => {
      publishedMessages.push(...messages.map((message) => message.content));
    };

    const { grantRaidTierRoleRewards } = moduleRequire(
      "./tier-role-rewards",
    ) as typeof import("./tier-role-rewards");

    await grantRaidTierRoleRewards({
      client: {} as never,
      raidRun: {
        run: {
          runId: "raid-run-1",
        },
        members: [
          {
            runId: "raid-run-1",
            userId: "leader-1",
            isLeader: true,
            active: true,
            joinedAt: new Date("2026-03-31T10:00:00.000Z"),
            updatedAt: new Date("2026-03-31T10:00:00.000Z"),
          },
          {
            runId: "raid-run-1",
            userId: "user-2",
            isLeader: false,
            active: true,
            joinedAt: new Date("2026-03-31T10:01:00.000Z"),
            updatedAt: new Date("2026-03-31T10:01:00.000Z"),
          },
          {
            runId: "raid-run-1",
            userId: "user-3",
            isLeader: false,
            active: false,
            joinedAt: new Date("2026-03-31T10:02:00.000Z"),
            updatedAt: new Date("2026-03-31T10:03:00.000Z"),
          },
        ],
      } as never,
      tier: {
        tierId: "bronze",
        name: "Bronze Raids",
        summary: "Entry raids.",
        bosses: [],
        roleReward: {
          roleRewardId: "example-bronze-raider-role",
          unlockAnnouncementText:
            "Congratulations on clearing your first Bronze raid. You have now unlocked the next raid tier!",
        },
      },
    });

    assert.deepEqual(roleRewardRequests, [
      {
        userId: "leader-1",
        roleId: "example-bronze-raider-role",
        unlockText:
          "Congratulations on clearing your first Bronze raid. You have now unlocked the next raid tier!",
      },
      {
        userId: "user-2",
        roleId: "example-bronze-raider-role",
        unlockText:
          "Congratulations on clearing your first Bronze raid. You have now unlocked the next raid tier!",
      },
    ]);
    assert.deepEqual(publishedMessages, [
      "<@leader-1> New raid role unlocked: Bronze Raider. Congratulations on clearing your first Bronze raid. You have now unlocked the next raid tier!",
      "<@user-2> New raid role unlocked: Bronze Raider. Congratulations on clearing your first Bronze raid. You have now unlocked the next raid tier!",
    ]);
  } finally {
    (
      achievementsChannelModule as {
        publishAchievementsChannelMessages: typeof achievementsChannelModule.publishAchievementsChannelMessages;
      }
    ).publishAchievementsChannelMessages = originalPublishAchievementsChannelMessages;
    (
      roleRewardsModule as {
        grantDiscordRoleRewards: typeof roleRewardsModule.grantDiscordRoleRewards;
      }
    ).grantDiscordRoleRewards = originalGrantDiscordRoleRewards;
    clearModules(modulePaths);
  }
});
