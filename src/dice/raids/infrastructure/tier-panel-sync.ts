import type { Client } from "discord.js";
import { renderActionView } from "../../../app/discord/render-action-result";
import {
  assertConfiguredRaidTierBindings,
  createRollyDataRaidCatalogReader,
} from "./catalog-reader";
import { createSqliteManageRaidLobbyUseCase } from "./sqlite/services";
import { encodeRaidButtonAction } from "../interfaces/discord/buttons/raid-buttons";
import { createDiscordRaidTierPanelPublisher } from "./discord/discord-raid-tier-panel-publisher";
import type { RaidsConfig } from "../../../shared/config";
import type { SqliteDatabase } from "../../../shared/db";

export type RaidTierPanelSyncMessage = {
  messageId: string;
  createdTimestamp: number;
};

export interface RaidTierPanelPublisher {
  assertSendableChannel(channelId: string): Promise<void>;
  listPanelMessages(channelId: string): Promise<RaidTierPanelSyncMessage[]>;
  createMessage(input: {
    channelId: string;
    content: string;
    components: unknown[];
  }): Promise<{ messageId: string }>;
  editMessage(input: {
    channelId: string;
    messageId: string;
    content: string;
    components: unknown[];
  }): Promise<void>;
  deleteMessage(input: { channelId: string; messageId: string }): Promise<void>;
}

export type SyncRaidTierPanelsResult =
  | {
      status: "skipped";
      reason: string;
    }
  | {
      status: "synced";
      syncedCount: number;
      createdCount: number;
      editedCount: number;
      deletedCount: number;
      channelCount: number;
    };

type CreateSyncRaidTierPanelsUseCaseDependencies = {
  config: RaidsConfig;
  listPanelPayloads: () => Array<{
    tierId: string;
    channelId: string;
    content: string;
    components: unknown[];
  }>;
  publisher: RaidTierPanelPublisher;
};

const byNewestFirst = (
  left: RaidTierPanelSyncMessage,
  right: RaidTierPanelSyncMessage,
): number => right.createdTimestamp - left.createdTimestamp;

export const createSyncRaidTierPanelsUseCase = ({
  config,
  listPanelPayloads,
  publisher,
}: CreateSyncRaidTierPanelsUseCaseDependencies) => {
  return async (): Promise<SyncRaidTierPanelsResult> => {
    if (!config.enabled) {
      return {
        status: "skipped",
        reason: config.inactiveReason ?? "Raids runtime config is incomplete.",
      };
    }

    const panelPayloads = listPanelPayloads();
    if (panelPayloads.length === 0) {
      return {
        status: "skipped",
        reason: "No configured raid tier panels were found.",
      };
    }

    let createdCount = 0;
    let editedCount = 0;
    let deletedCount = 0;

    for (const panel of panelPayloads) {
      await publisher.assertSendableChannel(panel.channelId);

      const existingPanels = (await publisher.listPanelMessages(panel.channelId)).sort(byNewestFirst);
      const currentPanel = existingPanels[0] ?? null;
      const stalePanels = currentPanel ? existingPanels.slice(1) : existingPanels;

      if (currentPanel) {
        await publisher.editMessage({
          channelId: panel.channelId,
          messageId: currentPanel.messageId,
          content: panel.content,
          components: panel.components,
        });
        editedCount += 1;
      } else {
        await publisher.createMessage({
          channelId: panel.channelId,
          content: panel.content,
          components: panel.components,
        });
        createdCount += 1;
      }

      for (const stalePanel of stalePanels) {
        await publisher.deleteMessage({
          channelId: panel.channelId,
          messageId: stalePanel.messageId,
        });
        deletedCount += 1;
      }
    }

    return {
      status: "synced",
      syncedCount: panelPayloads.length,
      createdCount,
      editedCount,
      deletedCount,
      channelCount: panelPayloads.length,
    };
  };
};

type RaidPanelStartupLogger = {
  log: (...args: unknown[]) => void;
};

export const syncRaidTierPanelsOnStartup = async ({
  client,
  config,
  db,
  logger,
}: {
  client: Client;
  config: RaidsConfig;
  db: SqliteDatabase;
  logger: RaidPanelStartupLogger;
}): Promise<void> => {
  const catalogReader = createRollyDataRaidCatalogReader();
  assertConfiguredRaidTierBindings(catalogReader, config.tierBindings);
  const manageLobby = createSqliteManageRaidLobbyUseCase({
    db,
    catalogReader,
    provisioner: {
      provisionRaidInstance: async () => ({
        ok: false,
        reason: "panel-sync-unavailable",
      }),
      cleanupRaidInstance: async () => {},
    },
  });

  const syncRaidTierPanels = createSyncRaidTierPanelsUseCase({
    config,
    listPanelPayloads: () =>
      catalogReader.listRaidTiers().flatMap((tier) => {
        const binding = config.tierBindings[tier.tierId];
        if (!binding) {
          return [];
        }

        const rendered = renderActionView(
          manageLobby.buildTierPanelView(tier.tierId),
          encodeRaidButtonAction,
        );

        return [
          {
            tierId: tier.tierId,
            channelId: binding.panelChannelId,
            content: rendered.content ?? "",
            components: rendered.components ?? [],
          },
        ];
      }),
    publisher: createDiscordRaidTierPanelPublisher(client),
  });

  const result = await syncRaidTierPanels();
  if (result.status === "skipped") {
    logger.log(`[raids] Tier panel sync inactive. ${result.reason}`);
    return;
  }

  logger.log(
    `[raids] Tier panel sync finished. synced=${result.syncedCount} channels=${result.channelCount} created=${result.createdCount} edited=${result.editedCount} deleted=${result.deletedCount}`,
  );
};
