import type { Client } from "discord.js";
import type { SqliteDatabase } from "../../../shared/db";
import type { IntroPostsConfig } from "../../../shared/config";
import { getIntroPostsV1Data } from "../../../rolly-data/load";
import { createSyncManagedIntroPostsUseCase } from "../application/sync-intro-posts/use-case";
import { createDiscordIntroPostsPublisher } from "./discord/discord-intro-posts-publisher";
import { createSqliteManagedIntroPostsRepository } from "./sqlite/managed-intro-posts-repository";

type IntroPostsStartupLogger = {
  error: (...args: unknown[]) => void;
  log: (...args: unknown[]) => void;
};

type SyncIntroPostsOnStartupDependencies = {
  client: Client;
  config: IntroPostsConfig;
  db: SqliteDatabase;
  logger: IntroPostsStartupLogger;
};

export const syncIntroPostsOnStartup = async ({
  client,
  config,
  db,
  logger,
}: SyncIntroPostsOnStartupDependencies): Promise<void> => {
  const syncManagedIntroPosts = createSyncManagedIntroPostsUseCase({
    config,
    contentSource: {
      getMessages: () => getIntroPostsV1Data().messages,
    },
    publisher: createDiscordIntroPostsPublisher(client),
    repository: createSqliteManagedIntroPostsRepository(db),
  });

  const result = await syncManagedIntroPosts();
  if (result.status === "skipped") {
    logger.log(`[intro-posts] Startup sync inactive. ${result.reason}`);
    return;
  }

  logger.log(
    `[intro-posts] Startup sync finished for channel ${result.channelId}. synced=${result.syncedCount} created=${result.createdCount} edited=${result.editedCount} deleted=${result.deletedCount}`,
  );
};
