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
