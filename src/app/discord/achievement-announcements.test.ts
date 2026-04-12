import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const moduleRequire = createRequire(__filename);

const loadModule = <T>(modulePath: string): T => {
  const resolved = moduleRequire.resolve(modulePath);
  delete require.cache[resolved];
  return moduleRequire(modulePath) as T;
};

const withExampleRollyData = <T>(run: () => T): T => {
  const previous = process.env.ROLLY_DATA_DIR;
  process.env.ROLLY_DATA_DIR = `${process.cwd()}/example-data/rolly-data`;

  try {
    loadModule("../../rolly-data/load");
    loadModule("../../dice/progression/domain/achievements");
    return run();
  } finally {
    if (previous === undefined) {
      delete process.env.ROLLY_DATA_DIR;
    } else {
      process.env.ROLLY_DATA_DIR = previous;
    }
  }
};

test("formatter hides detail for hidden achievements and keeps visible detail for normal ones", () => {
  const content = withExampleRollyData(() => {
    const { formatAchievementAnnouncementContent } = loadModule<
      typeof import("./achievement-announcements")
    >("./achievement-announcements");
    return formatAchievementAnnouncementContent({
      userId: "user-1",
      achievementIds: ["example-manual-achievement", "example-pair"],
    });
  });

  assert.match(content, /^<@user-1> Achievements unlocked: /);
  assert.match(content, /Example Manual Achievement/);
  assert.doesNotMatch(content, /Example Manual Achievement \(/);
  assert.match(content, /Example Pair, \+3 pips/);
});

test("formatter includes role unlock details when a new role reward is granted", () => {
  const content = withExampleRollyData(() => {
    const { formatAchievementAnnouncementContent } = loadModule<
      typeof import("./achievement-announcements")
    >("./achievement-announcements");
    return formatAchievementAnnouncementContent(
      {
        userId: "user-1",
        achievementIds: ["example-beginner-roller"],
      },
      [
        {
          userId: "user-1",
          roleId: "example-beginner-role",
          roleName: "Beginner",
          unlockText: "TODO: This role will unlock channels in the future.",
        },
      ],
    );
  });

  assert.match(content, /New role unlocked: Beginner\./);
  assert.doesNotMatch(content, /Role-gated channels or access may now be available\./);
  assert.match(content, /TODO: This role will unlock channels in the future\./);
});

test("publisher skips channel lookup cleanly when disabled", async () => {
  let fetchCalled = false;
  const { publishAchievementAnnouncements } = loadModule<
    typeof import("./achievement-announcements")
  >("./achievement-announcements");

  await publishAchievementAnnouncements({
    client: {
      channels: {
        fetch: async () => {
          fetchCalled = true;
          return null;
        },
      },
    } as never,
    announcements: [
      {
        userId: "user-1",
        achievementIds: ["prestige-1"],
      },
    ],
    config: {
      enabled: false,
      inactiveReason: "disabled for test",
      channelId: null,
    },
    logger: {
      warn: () => undefined,
    },
  });

  assert.equal(fetchCalled, false);
});
