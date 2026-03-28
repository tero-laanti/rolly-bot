import assert from "node:assert/strict";
import test from "node:test";
import { createSyncContractMasterPanelUseCase } from "./contract-master-panel-sync";

const createPublisher = (
  panelMessages: Array<{ messageId: string; createdTimestamp: number }> = [],
) => {
  const calls = {
    assertedChannelIds: [] as string[],
    created: [] as Array<{ channelId: string; content: string; components: unknown[] }>,
    edited: [] as Array<{
      channelId: string;
      messageId: string;
      content: string;
      components: unknown[];
    }>,
    deleted: [] as Array<{ channelId: string; messageId: string }>,
  };

  return {
    calls,
    publisher: {
      assertSendableChannel: async (channelId: string) => {
        calls.assertedChannelIds.push(channelId);
      },
      listPanelMessages: async () => panelMessages,
      createMessage: async (input: {
        channelId: string;
        content: string;
        components: unknown[];
      }) => {
        calls.created.push(input);
        return { messageId: "created-panel" };
      },
      editMessage: async (input: {
        channelId: string;
        messageId: string;
        content: string;
        components: unknown[];
      }) => {
        calls.edited.push(input);
      },
      deleteMessage: async (input: { channelId: string; messageId: string }) => {
        calls.deleted.push(input);
      },
    },
  };
};

test("contract master panel sync skips when the config is inactive", async () => {
  const { publisher, calls } = createPublisher();
  const sync = createSyncContractMasterPanelUseCase({
    config: {
      enabled: false,
      inactiveReason: "CONTRACT_MASTER_CHANNEL_ID is not set.",
      channelId: null,
    },
    panelSource: {
      getPanelMessage: () => ({
        content: "panel",
        components: [],
      }),
    },
    publisher,
  });

  const result = await sync();

  assert.deepEqual(result, {
    status: "skipped",
    reason: "CONTRACT_MASTER_CHANNEL_ID is not set.",
  });
  assert.deepEqual(calls.assertedChannelIds, []);
  assert.deepEqual(calls.created, []);
  assert.deepEqual(calls.edited, []);
  assert.deepEqual(calls.deleted, []);
});

test("contract master panel sync skips when authored contracts data is unavailable", async () => {
  const { publisher, calls } = createPublisher();
  const sync = createSyncContractMasterPanelUseCase({
    config: {
      enabled: true,
      inactiveReason: null,
      channelId: "12345",
    },
    panelSource: {
      getPanelMessage: () => null,
    },
    publisher,
  });

  const result = await sync();

  assert.equal(result.status, "skipped");
  assert.match(result.reason, /contracts\.v2\.json is missing/i);
  assert.deepEqual(calls.assertedChannelIds, []);
  assert.deepEqual(calls.created, []);
  assert.deepEqual(calls.edited, []);
  assert.deepEqual(calls.deleted, []);
});

test("contract master panel sync creates the panel when the channel has none", async () => {
  const { publisher, calls } = createPublisher();
  const sync = createSyncContractMasterPanelUseCase({
    config: {
      enabled: true,
      inactiveReason: null,
      channelId: "contract-channel",
    },
    panelSource: {
      getPanelMessage: () => ({
        content: "panel",
        components: ["buttons"],
      }),
    },
    publisher,
  });

  const result = await sync();

  assert.deepEqual(result, {
    status: "synced",
    channelId: "contract-channel",
    createdCount: 1,
    editedCount: 0,
    deletedCount: 0,
    syncedCount: 1,
  });
  assert.deepEqual(calls.assertedChannelIds, ["contract-channel"]);
  assert.deepEqual(calls.created, [
    {
      channelId: "contract-channel",
      content: "panel",
      components: ["buttons"],
    },
  ]);
  assert.deepEqual(calls.edited, []);
  assert.deepEqual(calls.deleted, []);
});

test("contract master panel sync edits the newest panel and deletes older duplicates", async () => {
  const { publisher, calls } = createPublisher([
    { messageId: "older-panel", createdTimestamp: 10 },
    { messageId: "newer-panel", createdTimestamp: 20 },
    { messageId: "stale-panel", createdTimestamp: 5 },
  ]);
  const sync = createSyncContractMasterPanelUseCase({
    config: {
      enabled: true,
      inactiveReason: null,
      channelId: "contract-channel",
    },
    panelSource: {
      getPanelMessage: () => ({
        content: "fresh panel",
        components: ["buttons"],
      }),
    },
    publisher,
  });

  const result = await sync();

  assert.deepEqual(result, {
    status: "synced",
    channelId: "contract-channel",
    createdCount: 0,
    editedCount: 1,
    deletedCount: 2,
    syncedCount: 1,
  });
  assert.deepEqual(calls.edited, [
    {
      channelId: "contract-channel",
      messageId: "newer-panel",
      content: "fresh panel",
      components: ["buttons"],
    },
  ]);
  assert.deepEqual(calls.deleted, [
    { channelId: "contract-channel", messageId: "older-panel" },
    { channelId: "contract-channel", messageId: "stale-panel" },
  ]);
});
