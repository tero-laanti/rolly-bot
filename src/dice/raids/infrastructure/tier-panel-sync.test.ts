import assert from "node:assert/strict";
import test from "node:test";
import { createSyncRaidTierPanelsUseCase } from "./tier-panel-sync";

const createPublisher = (
  panelMessagesByChannel: Record<
    string,
    Array<{ messageId: string; createdTimestamp: number }>
  > = {},
) => {
  const calls = {
    assertedChannelIds: [] as string[],
    created: [] as Array<{
      channelId: string;
      content: string;
      components: unknown[];
    }>,
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
      listPanelMessages: async (channelId: string) => panelMessagesByChannel[channelId] ?? [],
      createMessage: async (input: {
        channelId: string;
        content: string;
        components: unknown[];
      }) => {
        calls.created.push(input);
        return { messageId: `${input.channelId}-created` };
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

test("raid tier panel sync skips when raids are inactive", async () => {
  const { publisher, calls } = createPublisher();
  const syncPanels = createSyncRaidTierPanelsUseCase({
    config: {
      enabled: false,
      inactiveReason: "RAIDS_INSTANCE_CATEGORY_ID is not set.",
      instanceCategoryId: null,
      tierBindings: {},
    },
    listPanelPayloads: () => [],
    publisher,
  });

  const result = await syncPanels();

  assert.deepEqual(result, {
    status: "skipped",
    reason: "RAIDS_INSTANCE_CATEGORY_ID is not set.",
  });
  assert.deepEqual(calls.assertedChannelIds, []);
  assert.deepEqual(calls.created, []);
  assert.deepEqual(calls.edited, []);
  assert.deepEqual(calls.deleted, []);
});

test("raid tier panel sync creates one panel per configured channel when none exist", async () => {
  const { publisher, calls } = createPublisher();
  const syncPanels = createSyncRaidTierPanelsUseCase({
    config: {
      enabled: true,
      inactiveReason: null,
      instanceCategoryId: "category-1",
      tierBindings: {
        bronze: {
          panelChannelId: "channel-1",
          accessRoleId: "role-1",
        },
        silver: {
          panelChannelId: "channel-2",
          accessRoleId: "role-2",
        },
      },
    },
    listPanelPayloads: () => [
      {
        tierId: "bronze",
        channelId: "channel-1",
        content: "Bronze panel",
        components: ["bronze-buttons"],
      },
      {
        tierId: "silver",
        channelId: "channel-2",
        content: "Silver panel",
        components: ["silver-buttons"],
      },
    ],
    publisher,
  });

  const result = await syncPanels();

  assert.deepEqual(result, {
    status: "synced",
    syncedCount: 2,
    createdCount: 2,
    editedCount: 0,
    deletedCount: 0,
    channelCount: 2,
  });
  assert.deepEqual(calls.assertedChannelIds, ["channel-1", "channel-2"]);
  assert.deepEqual(calls.created, [
    {
      channelId: "channel-1",
      content: "Bronze panel",
      components: ["bronze-buttons"],
    },
    {
      channelId: "channel-2",
      content: "Silver panel",
      components: ["silver-buttons"],
    },
  ]);
});

test("raid tier panel sync edits the newest panel and deletes older duplicates", async () => {
  const { publisher, calls } = createPublisher({
    "channel-1": [
      { messageId: "older-panel", createdTimestamp: 10 },
      { messageId: "newer-panel", createdTimestamp: 20 },
      { messageId: "stale-panel", createdTimestamp: 5 },
    ],
  });
  const syncPanels = createSyncRaidTierPanelsUseCase({
    config: {
      enabled: true,
      inactiveReason: null,
      instanceCategoryId: "category-1",
      tierBindings: {
        bronze: {
          panelChannelId: "channel-1",
          accessRoleId: "role-1",
        },
      },
    },
    listPanelPayloads: () => [
      {
        tierId: "bronze",
        channelId: "channel-1",
        content: "Fresh bronze panel",
        components: ["buttons"],
      },
    ],
    publisher,
  });

  const result = await syncPanels();

  assert.deepEqual(result, {
    status: "synced",
    syncedCount: 1,
    createdCount: 0,
    editedCount: 1,
    deletedCount: 2,
    channelCount: 1,
  });
  assert.deepEqual(calls.edited, [
    {
      channelId: "channel-1",
      messageId: "newer-panel",
      content: "Fresh bronze panel",
      components: ["buttons"],
    },
  ]);
  assert.deepEqual(calls.deleted, [
    { channelId: "channel-1", messageId: "older-panel" },
    { channelId: "channel-1", messageId: "stale-panel" },
  ]);
});
