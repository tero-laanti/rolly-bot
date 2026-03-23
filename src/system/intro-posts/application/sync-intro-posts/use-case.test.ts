import assert from "node:assert/strict";
import test from "node:test";
import type { IntroPostsConfig } from "../../../../shared/config";
import type {
  IntroPostsPublisher,
  ManagedIntroPostRecord,
  ManagedIntroPostsRepository,
} from "../ports";
import { createSyncManagedIntroPostsUseCase } from "./use-case";

const activeConfig: IntroPostsConfig = {
  enabled: true,
  inactiveReason: null,
  channelId: "channel-1",
};

const createRepository = (
  initialRecords: ManagedIntroPostRecord[] = [],
): ManagedIntroPostsRepository => {
  const records = new Map(initialRecords.map((record) => [record.slotIndex, { ...record }]));

  return {
    listManagedIntroPosts: () =>
      [...records.values()].sort((left, right) => left.slotIndex - right.slotIndex),
    saveManagedIntroPost: ({ slotIndex, channelId, messageId }) => {
      const existing = records.get(slotIndex);
      const timestamp = new Date().toISOString();
      records.set(slotIndex, {
        slotIndex,
        channelId,
        messageId,
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
      });
    },
    deleteManagedIntroPost: (slotIndex) => {
      records.delete(slotIndex);
    },
  };
};

type FakePublisherState = {
  sendableChannels?: Set<string>;
  messages?: Map<string, string>;
};

const createMessageKey = (channelId: string, messageId: string): string =>
  `${channelId}:${messageId}`;

const createPublisher = ({
  sendableChannels = new Set(["channel-1", "channel-2"]),
  messages = new Map<string, string>(),
}: FakePublisherState = {}): IntroPostsPublisher & {
  created: Array<{ channelId: string; content: string; messageId: string }>;
  edited: Array<{ channelId: string; messageId: string; content: string }>;
  deleted: Array<{ channelId: string; messageId: string }>;
} => {
  let nextMessageId = 1;
  const created: Array<{ channelId: string; content: string; messageId: string }> = [];
  const edited: Array<{ channelId: string; messageId: string; content: string }> = [];
  const deleted: Array<{ channelId: string; messageId: string }> = [];

  return {
    created,
    edited,
    deleted,
    assertSendableChannel: async (channelId) => {
      if (!sendableChannels.has(channelId)) {
        throw new Error(
          `INTRO_POST_CHANNEL_ID must reference a sendable text channel. Received ${channelId}.`,
        );
      }
    },
    hasMessage: async ({ channelId, messageId }) => {
      return messages.has(createMessageKey(channelId, messageId));
    },
    createMessage: async ({ channelId, content }) => {
      const messageId = `message-${nextMessageId}`;
      nextMessageId += 1;
      messages.set(createMessageKey(channelId, messageId), content);
      created.push({ channelId, content, messageId });
      return { messageId };
    },
    editMessage: async ({ channelId, messageId, content }) => {
      const key = createMessageKey(channelId, messageId);
      if (!messages.has(key)) {
        throw new Error(`Cannot edit missing message ${key}.`);
      }

      messages.set(key, content);
      edited.push({ channelId, messageId, content });
    },
    deleteMessage: async ({ channelId, messageId }) => {
      deleted.push({ channelId, messageId });
      messages.delete(createMessageKey(channelId, messageId));
    },
  };
};

test("syncManagedIntroPosts creates all messages on first sync", async () => {
  const repository = createRepository();
  const publisher = createPublisher();
  const sync = createSyncManagedIntroPostsUseCase({
    config: activeConfig,
    contentSource: {
      getMessages: () => [{ content: "Welcome" }, { content: "Use /roll" }],
    },
    publisher,
    repository,
  });

  const result = await sync();

  assert.deepEqual(result, {
    status: "synced",
    channelId: "channel-1",
    createdCount: 2,
    editedCount: 0,
    deletedCount: 0,
    syncedCount: 2,
  });
  assert.equal(repository.listManagedIntroPosts().length, 2);
  assert.deepEqual(
    publisher.created.map(({ content }) => content),
    ["Welcome", "Use /roll"],
  );
});

test("syncManagedIntroPosts edits existing tracked messages on later sync", async () => {
  const repository = createRepository([
    {
      slotIndex: 0,
      channelId: "channel-1",
      messageId: "message-a",
      createdAt: "2026-03-23T08:00:00.000Z",
      updatedAt: "2026-03-23T08:00:00.000Z",
    },
    {
      slotIndex: 1,
      channelId: "channel-1",
      messageId: "message-b",
      createdAt: "2026-03-23T08:00:00.000Z",
      updatedAt: "2026-03-23T08:00:00.000Z",
    },
  ]);
  const publisher = createPublisher({
    messages: new Map([
      [createMessageKey("channel-1", "message-a"), "Old welcome"],
      [createMessageKey("channel-1", "message-b"), "Old help"],
    ]),
  });
  const sync = createSyncManagedIntroPostsUseCase({
    config: activeConfig,
    contentSource: {
      getMessages: () => [{ content: "New welcome" }, { content: "New help" }],
    },
    publisher,
    repository,
  });

  const result = await sync();

  assert.equal(result.status, "synced");
  assert.equal(result.createdCount, 0);
  assert.equal(result.editedCount, 2);
  assert.deepEqual(
    publisher.edited.map(({ messageId, content }) => ({ messageId, content })),
    [
      { messageId: "message-a", content: "New welcome" },
      { messageId: "message-b", content: "New help" },
    ],
  );
});

test("syncManagedIntroPosts recreates trailing messages when a tracked message is missing", async () => {
  const repository = createRepository([
    {
      slotIndex: 0,
      channelId: "channel-1",
      messageId: "message-a",
      createdAt: "2026-03-23T08:00:00.000Z",
      updatedAt: "2026-03-23T08:00:00.000Z",
    },
    {
      slotIndex: 1,
      channelId: "channel-1",
      messageId: "message-b",
      createdAt: "2026-03-23T08:00:00.000Z",
      updatedAt: "2026-03-23T08:00:00.000Z",
    },
    {
      slotIndex: 2,
      channelId: "channel-1",
      messageId: "message-c",
      createdAt: "2026-03-23T08:00:00.000Z",
      updatedAt: "2026-03-23T08:00:00.000Z",
    },
  ]);
  const publisher = createPublisher({
    messages: new Map([
      [createMessageKey("channel-1", "message-a"), "First old"],
      [createMessageKey("channel-1", "message-c"), "Third old"],
    ]),
  });
  const sync = createSyncManagedIntroPostsUseCase({
    config: activeConfig,
    contentSource: {
      getMessages: () => [
        { content: "First new" },
        { content: "Second new" },
        { content: "Third new" },
      ],
    },
    publisher,
    repository,
  });

  const result = await sync();

  assert.equal(result.status, "synced");
  assert.equal(result.editedCount, 1);
  assert.equal(result.createdCount, 2);
  assert.equal(result.deletedCount, 2);
  assert.deepEqual(publisher.deleted, [
    { channelId: "channel-1", messageId: "message-b" },
    { channelId: "channel-1", messageId: "message-c" },
  ]);
  assert.deepEqual(
    repository.listManagedIntroPosts().map(({ slotIndex }) => slotIndex),
    [0, 1, 2],
  );
});

test("syncManagedIntroPosts deletes extra tracked messages when authored message count shrinks", async () => {
  const repository = createRepository([
    {
      slotIndex: 0,
      channelId: "channel-1",
      messageId: "message-a",
      createdAt: "2026-03-23T08:00:00.000Z",
      updatedAt: "2026-03-23T08:00:00.000Z",
    },
    {
      slotIndex: 1,
      channelId: "channel-1",
      messageId: "message-b",
      createdAt: "2026-03-23T08:00:00.000Z",
      updatedAt: "2026-03-23T08:00:00.000Z",
    },
  ]);
  const publisher = createPublisher({
    messages: new Map([
      [createMessageKey("channel-1", "message-a"), "Old welcome"],
      [createMessageKey("channel-1", "message-b"), "Old help"],
    ]),
  });
  const sync = createSyncManagedIntroPostsUseCase({
    config: activeConfig,
    contentSource: {
      getMessages: () => [{ content: "Only one message now" }],
    },
    publisher,
    repository,
  });

  const result = await sync();

  assert.equal(result.status, "synced");
  assert.equal(result.editedCount, 1);
  assert.equal(result.deletedCount, 1);
  assert.deepEqual(
    repository.listManagedIntroPosts().map(({ slotIndex }) => slotIndex),
    [0],
  );
});

test("syncManagedIntroPosts cleans up old tracked messages when the channel changes", async () => {
  const repository = createRepository([
    {
      slotIndex: 0,
      channelId: "channel-2",
      messageId: "message-old",
      createdAt: "2026-03-23T08:00:00.000Z",
      updatedAt: "2026-03-23T08:00:00.000Z",
    },
  ]);
  const publisher = createPublisher({
    messages: new Map([[createMessageKey("channel-2", "message-old"), "Old channel welcome"]]),
  });
  const sync = createSyncManagedIntroPostsUseCase({
    config: activeConfig,
    contentSource: {
      getMessages: () => [{ content: "Fresh welcome" }],
    },
    publisher,
    repository,
  });

  const result = await sync();

  assert.equal(result.status, "synced");
  assert.equal(result.deletedCount, 1);
  assert.equal(result.createdCount, 1);
  assert.deepEqual(publisher.deleted, [{ channelId: "channel-2", messageId: "message-old" }]);
  assert.deepEqual(
    repository.listManagedIntroPosts().map(({ channelId }) => channelId),
    ["channel-1"],
  );
});

test("syncManagedIntroPosts skips cleanly when the env var is unset", async () => {
  const sync = createSyncManagedIntroPostsUseCase({
    config: {
      enabled: false,
      inactiveReason: "INTRO_POST_CHANNEL_ID is not set.",
      channelId: null,
    },
    contentSource: {
      getMessages: () => [{ content: "Welcome" }],
    },
    publisher: createPublisher(),
    repository: createRepository(),
  });

  const result = await sync();

  assert.deepEqual(result, {
    status: "skipped",
    reason: "INTRO_POST_CHANNEL_ID is not set.",
  });
});

test("syncManagedIntroPosts fails clearly when the configured channel is not sendable", async () => {
  const sync = createSyncManagedIntroPostsUseCase({
    config: activeConfig,
    contentSource: {
      getMessages: () => [{ content: "Welcome" }],
    },
    publisher: createPublisher({
      sendableChannels: new Set(["channel-2"]),
    }),
    repository: createRepository(),
  });

  await assert.rejects(
    () => sync(),
    /INTRO_POST_CHANNEL_ID must reference a sendable text channel/i,
  );
});
