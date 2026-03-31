import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const moduleRequire = createRequire(__filename);

const loadModule = <T>(modulePath: string): T => {
  const resolved = moduleRequire.resolve(modulePath);
  delete require.cache[resolved];
  return moduleRequire(modulePath) as T;
};

const withExampleRollyData = async <T>(run: () => Promise<T>): Promise<T> => {
  const previous = process.env.ROLLY_DATA_DIR;
  process.env.ROLLY_DATA_DIR = `${process.cwd()}/example-data/rolly-data`;

  try {
    loadModule("../../rolly-data/load");
    loadModule("../../dice/progression/domain/achievements");
    return await run();
  } finally {
    if (previous === undefined) {
      delete process.env.ROLLY_DATA_DIR;
    } else {
      process.env.ROLLY_DATA_DIR = previous;
    }
  }
};

test("publisher grants each role reward once per user", async () => {
  await withExampleRollyData(async () => {
    let addCalls = 0;
    const role = { id: "example-beginner-role", name: "Beginner" } as const;
    const member = {
      roles: {
        cache: new Map<string, { id: string }>(),
        add: async (resolvedRole: { id: string }) => {
          addCalls += 1;
          member.roles.cache.set(resolvedRole.id, resolvedRole);
        },
      },
    };
    const guild = {
      roles: {
        fetch: async (roleId: string) => (roleId === role.id ? { ...role, guild } : null),
      },
      members: {
        fetch: async (userId: string) => {
          assert.equal(userId, "user-1");
          return member;
        },
      },
    };
    const { publishAchievementRoleRewards } = loadModule<
      typeof import("./achievement-role-rewards")
    >("./achievement-role-rewards");

    const client = {
      guilds: {
        cache: new Map([["guild-1", guild]]),
      },
    } as never;

    const firstPublish = await publishAchievementRoleRewards({
      client,
      announcements: [
        {
          userId: "user-1",
          achievementIds: ["example-beginner-roller", "example-beginner-roller"],
        },
      ],
    });
    const secondPublish = await publishAchievementRoleRewards({
      client,
      announcements: [
        {
          userId: "user-1",
          achievementIds: ["example-beginner-roller"],
        },
      ],
    });

    assert.equal(addCalls, 1);
    assert.equal(member.roles.cache.has(role.id), true);
    assert.deepEqual(firstPublish, [
      {
        userId: "user-1",
        roleId: "example-beginner-role",
        roleName: "Beginner",
        unlockText: "TODO: This role will unlock channels in the future.",
      },
    ]);
    assert.deepEqual(secondPublish, []);
  });
});

test("publisher logs and continues when a role reward target is missing", async () => {
  await withExampleRollyData(async () => {
    const warnings: string[] = [];
    const { publishAchievementRoleRewards } = loadModule<
      typeof import("./achievement-role-rewards")
    >("./achievement-role-rewards");

    await publishAchievementRoleRewards({
      client: {
        guilds: {
          cache: new Map([
            [
              "guild-1",
              {
                roles: {
                  fetch: async () => null,
                },
                members: {
                  fetch: async () => null,
                },
              },
            ],
          ]),
        },
      } as never,
      announcements: [
        {
          userId: "user-2",
          achievementIds: ["example-beginner-roller"],
        },
      ],
      logger: {
        warn: (message: unknown) => warnings.push(String(message)),
      },
    });

    assert.equal(warnings.length, 1);
    assert.match(warnings[0] ?? "", /Failed to resolve role reward example-beginner-role/);
  });
});
