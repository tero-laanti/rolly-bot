import type { IntroPostsConfig } from "../../../../shared/config";
import type {
  IntroPostsContentSource,
  IntroPostsPublisher,
  ManagedIntroPostRecord,
  ManagedIntroPostsRepository,
} from "../ports";

export type SyncManagedIntroPostsResult =
  | {
      status: "skipped";
      reason: string;
    }
  | {
      status: "synced";
      channelId: string;
      createdCount: number;
      editedCount: number;
      deletedCount: number;
      syncedCount: number;
    };

type CreateSyncManagedIntroPostsUseCaseDependencies = {
  config: IntroPostsConfig;
  contentSource: IntroPostsContentSource;
  publisher: IntroPostsPublisher;
  repository: ManagedIntroPostsRepository;
};

const bySlotIndex = (left: ManagedIntroPostRecord, right: ManagedIntroPostRecord): number => {
  return left.slotIndex - right.slotIndex;
};

export const createSyncManagedIntroPostsUseCase = ({
  config,
  contentSource,
  publisher,
  repository,
}: CreateSyncManagedIntroPostsUseCaseDependencies) => {
  return async (): Promise<SyncManagedIntroPostsResult> => {
    if (!config.enabled || !config.channelId) {
      return {
        status: "skipped",
        reason: config.inactiveReason ?? "INTRO_POST_CHANNEL_ID is not set.",
      };
    }

    await publisher.assertSendableChannel(config.channelId);

    const trackedPosts = repository.listManagedIntroPosts().sort(bySlotIndex);
    const managedMessages = contentSource.getMessages();

    let deletedCount = 0;
    let createdCount = 0;
    let editedCount = 0;

    const deleteTrackedPost = async (trackedPost: ManagedIntroPostRecord): Promise<void> => {
      try {
        await publisher.deleteMessage({
          channelId: trackedPost.channelId,
          messageId: trackedPost.messageId,
        });
      } catch {
        // Missing or inaccessible historical messages should not block startup sync.
      }

      repository.deleteManagedIntroPost(trackedPost.slotIndex);
      deletedCount += 1;
    };

    const staleTrackedPosts = trackedPosts.filter(
      (trackedPost) => trackedPost.channelId !== config.channelId,
    );
    for (const trackedPost of staleTrackedPosts) {
      await deleteTrackedPost(trackedPost);
    }

    const currentTrackedPosts = trackedPosts
      .filter((trackedPost) => trackedPost.channelId === config.channelId)
      .sort(bySlotIndex);
    const trackedPostsBySlot = new Map(
      currentTrackedPosts.map((trackedPost) => [trackedPost.slotIndex, trackedPost] as const),
    );

    let rebuildStartSlot: number | null = null;
    for (let slotIndex = 0; slotIndex < managedMessages.length; slotIndex += 1) {
      const trackedPost = trackedPostsBySlot.get(slotIndex);
      if (!trackedPost) {
        rebuildStartSlot = slotIndex;
        break;
      }

      const exists = await publisher.hasMessage({
        channelId: trackedPost.channelId,
        messageId: trackedPost.messageId,
      });
      if (!exists) {
        rebuildStartSlot = slotIndex;
        break;
      }
    }

    const slotsDeletedDuringRebuild = new Set<number>();
    if (rebuildStartSlot !== null) {
      for (const trackedPost of currentTrackedPosts) {
        if (trackedPost.slotIndex < rebuildStartSlot) {
          continue;
        }

        await deleteTrackedPost(trackedPost);
        slotsDeletedDuringRebuild.add(trackedPost.slotIndex);
      }
    }

    for (let slotIndex = 0; slotIndex < managedMessages.length; slotIndex += 1) {
      const managedMessage = managedMessages[slotIndex];
      if (!managedMessage) {
        continue;
      }

      if (rebuildStartSlot !== null && slotIndex >= rebuildStartSlot) {
        const createdMessage = await publisher.createMessage({
          channelId: config.channelId,
          content: managedMessage.content,
        });
        repository.saveManagedIntroPost({
          slotIndex,
          channelId: config.channelId,
          messageId: createdMessage.messageId,
        });
        createdCount += 1;
        continue;
      }

      const trackedPost = trackedPostsBySlot.get(slotIndex);
      if (!trackedPost) {
        throw new Error(`Missing tracked intro post for slot ${slotIndex}.`);
      }

      await publisher.editMessage({
        channelId: trackedPost.channelId,
        messageId: trackedPost.messageId,
        content: managedMessage.content,
      });
      editedCount += 1;
    }

    for (const trackedPost of currentTrackedPosts) {
      if (trackedPost.slotIndex < managedMessages.length) {
        continue;
      }

      if (slotsDeletedDuringRebuild.has(trackedPost.slotIndex)) {
        continue;
      }

      await deleteTrackedPost(trackedPost);
    }

    return {
      status: "synced",
      channelId: config.channelId,
      createdCount,
      editedCount,
      deletedCount,
      syncedCount: managedMessages.length,
    };
  };
};
