import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const moduleRequire = createRequire(__filename);

const loadConfig = () => {
  const modulePath = moduleRequire.resolve("./config");
  delete require.cache[modulePath];
  return moduleRequire("./config") as typeof import("./config");
};

const withEnv = (overrides: Record<string, string | undefined>, run: () => void) => {
  const previous = { ...process.env };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    run();
  } finally {
    process.env = previous;
  }
};

test("achievements channel config stays inactive when the env var is unset", () => {
  withEnv({ ACHIEVEMENTS_CHANNEL_ID: undefined }, () => {
    const { achievementsChannelConfig } = loadConfig();
    assert.equal(achievementsChannelConfig.enabled, false);
    assert.equal(achievementsChannelConfig.channelId, null);
    assert.equal(achievementsChannelConfig.inactiveReason, "ACHIEVEMENTS_CHANNEL_ID is not set.");
  });
});

test("achievements channel config activates when the env var is set", () => {
  withEnv({ ACHIEVEMENTS_CHANNEL_ID: "1234567890" }, () => {
    const { achievementsChannelConfig } = loadConfig();
    assert.equal(achievementsChannelConfig.enabled, true);
    assert.equal(achievementsChannelConfig.channelId, "1234567890");
    assert.equal(achievementsChannelConfig.inactiveReason, null);
  });
});

test("contract master config stays inactive when the env var is unset", () => {
  withEnv({ CONTRACT_MASTER_CHANNEL_ID: undefined }, () => {
    const { contractMasterConfig } = loadConfig();
    assert.equal(contractMasterConfig.enabled, false);
    assert.equal(contractMasterConfig.channelId, null);
    assert.equal(contractMasterConfig.inactiveReason, "CONTRACT_MASTER_CHANNEL_ID is not set.");
  });
});

test("contract master config activates when the env var is set", () => {
  withEnv({ CONTRACT_MASTER_CHANNEL_ID: "0987654321" }, () => {
    const { contractMasterConfig } = loadConfig();
    assert.equal(contractMasterConfig.enabled, true);
    assert.equal(contractMasterConfig.channelId, "0987654321");
    assert.equal(contractMasterConfig.inactiveReason, null);
  });
});

test("raids config stays inactive when the instance category id is unset", () => {
  withEnv(
    {
      RAIDS_INSTANCE_CATEGORY_ID: undefined,
      RAIDS_TIER_BINDINGS_JSON: JSON.stringify({
        bronze: {
          panelChannelId: "111",
          accessRoleId: "222",
        },
      }),
    },
    () => {
      const { raidsConfig } = loadConfig();
      assert.equal(raidsConfig.enabled, false);
      assert.equal(raidsConfig.instanceCategoryId, null);
      assert.equal(raidsConfig.inactiveReason, "RAIDS_INSTANCE_CATEGORY_ID is not set.");
      assert.deepEqual(raidsConfig.tierBindings, {
        bronze: {
          panelChannelId: "111",
          accessRoleId: "222",
        },
      });
    },
  );
});

test("raids config stays inactive when tier bindings are unset", () => {
  withEnv(
    {
      RAIDS_INSTANCE_CATEGORY_ID: "category-1",
      RAIDS_TIER_BINDINGS_JSON: undefined,
    },
    () => {
      const { raidsConfig } = loadConfig();
      assert.equal(raidsConfig.enabled, false);
      assert.equal(raidsConfig.instanceCategoryId, "category-1");
      assert.equal(raidsConfig.inactiveReason, "RAIDS_TIER_BINDINGS_JSON is not set.");
      assert.deepEqual(raidsConfig.tierBindings, {});
    },
  );
});

test("raids config parses tier bindings when both env vars are set", () => {
  withEnv(
    {
      RAIDS_INSTANCE_CATEGORY_ID: "category-1",
      RAIDS_TIER_BINDINGS_JSON: JSON.stringify({
        bronze: {
          panelChannelId: "111",
          accessRoleId: "222",
        },
        silver: {
          panelChannelId: "333",
          accessRoleId: "444",
        },
      }),
    },
    () => {
      const { raidsConfig } = loadConfig();
      assert.equal(raidsConfig.enabled, true);
      assert.equal(raidsConfig.instanceCategoryId, "category-1");
      assert.equal(raidsConfig.inactiveReason, null);
      assert.deepEqual(raidsConfig.tierBindings, {
        bronze: {
          panelChannelId: "111",
          accessRoleId: "222",
        },
        silver: {
          panelChannelId: "333",
          accessRoleId: "444",
        },
      });
    },
  );
});

test("raids config rejects invalid tier binding json", () => {
  withEnv(
    {
      RAIDS_INSTANCE_CATEGORY_ID: "category-1",
      RAIDS_TIER_BINDINGS_JSON: "{not-json",
    },
    () => {
      assert.throws(() => loadConfig(), /RAIDS_TIER_BINDINGS_JSON must be valid JSON/i);
    },
  );
});

test("raids config rejects reused panel channel ids", () => {
  withEnv(
    {
      RAIDS_INSTANCE_CATEGORY_ID: "category-1",
      RAIDS_TIER_BINDINGS_JSON: JSON.stringify({
        bronze: {
          panelChannelId: "shared-channel",
          accessRoleId: "role-1",
        },
        silver: {
          panelChannelId: "shared-channel",
          accessRoleId: "role-2",
        },
      }),
    },
    () => {
      assert.throws(() => loadConfig(), /reuses panelChannelId shared-channel/i);
    },
  );
});

test("raids config rejects blank binding ids", () => {
  withEnv(
    {
      RAIDS_INSTANCE_CATEGORY_ID: "category-1",
      RAIDS_TIER_BINDINGS_JSON: JSON.stringify({
        bronze: {
          panelChannelId: "   ",
          accessRoleId: "role-1",
        },
      }),
    },
    () => {
      assert.throws(
        () => loadConfig(),
        /RAIDS_TIER_BINDINGS_JSON\.bronze\.panelChannelId must not be empty/i,
      );
    },
  );
});
