import type { APIEmbed } from "discord.js";
import type { Client } from "discord.js";
import { renderActionView } from "../../../app/discord/render-action-result";
import type { ContractMasterConfig } from "../../../shared/config";
import type { SqliteDatabase } from "../../../shared/db";
import {
  encodeContractMasterButtonAction,
  type ContractMasterButtonAction,
} from "../interfaces/discord/buttons/contract-master-buttons";
import { createDiscordContractMasterPanelPublisher } from "./discord/discord-contract-master-panel-publisher";
import { createOptionalSqliteContractMasterService } from "./contract-master-service";

export type ContractMasterPanelMessage = {
  messageId: string;
  createdTimestamp: number;
};

export type ContractMasterPanelMessagePayload = {
  content: string;
  embeds: APIEmbed[];
  components: unknown[];
};

export interface ContractMasterPanelPublisher {
  assertSendableChannel(channelId: string): Promise<void>;
  listPanelMessages(channelId: string): Promise<ContractMasterPanelMessage[]>;
  createMessage(input: {
    channelId: string;
    content: string;
    embeds: APIEmbed[];
    components: unknown[];
  }): Promise<{ messageId: string }>;
  editMessage(input: {
    channelId: string;
    messageId: string;
    content: string;
    embeds: APIEmbed[];
    components: unknown[];
  }): Promise<void>;
  deleteMessage(input: { channelId: string; messageId: string }): Promise<void>;
}

export type SyncContractMasterPanelResult =
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

type CreateSyncContractMasterPanelUseCaseDependencies = {
  config: ContractMasterConfig;
  panelSource: {
    getPanelMessage: () => ContractMasterPanelMessagePayload | null;
  };
  publisher: ContractMasterPanelPublisher;
};

const byNewestFirst = (
  left: ContractMasterPanelMessage,
  right: ContractMasterPanelMessage,
): number => {
  return right.createdTimestamp - left.createdTimestamp;
};

export const createSyncContractMasterPanelUseCase = ({
  config,
  panelSource,
  publisher,
}: CreateSyncContractMasterPanelUseCaseDependencies) => {
  return async (): Promise<SyncContractMasterPanelResult> => {
    if (!config.enabled || !config.channelId) {
      return {
        status: "skipped",
        reason: config.inactiveReason ?? "CONTRACT_MASTER_CHANNEL_ID is not set.",
      };
    }

    const panelMessage = panelSource.getPanelMessage();
    if (!panelMessage) {
      return {
        status: "skipped",
        reason:
          "Contract Master panel is inactive because contracts.v2.json is missing from the active rolly-data source.",
      };
    }

    await publisher.assertSendableChannel(config.channelId);

    const existingPanels = (await publisher.listPanelMessages(config.channelId)).sort(
      byNewestFirst,
    );
    const currentPanel = existingPanels[0] ?? null;
    const stalePanels = currentPanel ? existingPanels.slice(1) : existingPanels;

    let createdCount = 0;
    let editedCount = 0;
    let deletedCount = 0;

    if (currentPanel) {
      await publisher.editMessage({
        channelId: config.channelId,
        messageId: currentPanel.messageId,
        content: panelMessage.content,
        embeds: panelMessage.embeds,
        components: panelMessage.components,
      });
      editedCount += 1;
    } else {
      await publisher.createMessage({
        channelId: config.channelId,
        content: panelMessage.content,
        embeds: panelMessage.embeds,
        components: panelMessage.components,
      });
      createdCount += 1;
    }

    for (const stalePanel of stalePanels) {
      await publisher.deleteMessage({
        channelId: config.channelId,
        messageId: stalePanel.messageId,
      });
      deletedCount += 1;
    }

    return {
      status: "synced",
      channelId: config.channelId,
      createdCount,
      editedCount,
      deletedCount,
      syncedCount: 1,
    };
  };
};

type ContractMasterStartupLogger = {
  error: (...args: unknown[]) => void;
  log: (...args: unknown[]) => void;
};

type SyncContractMasterPanelOnStartupDependencies = {
  client: Client;
  config: ContractMasterConfig;
  db: SqliteDatabase;
  logger: ContractMasterStartupLogger;
};

const createPanelSource = (
  db: SqliteDatabase,
): {
  getPanelMessage: () => ContractMasterPanelMessagePayload | null;
} => {
  return {
    getPanelMessage: () => {
      const service = createOptionalSqliteContractMasterService(db);
      if (!service) {
        return null;
      }

      const panelEmbeds = service.createPanelEmbeds();

      const rendered = renderActionView<ContractMasterButtonAction>(
        service.createPanelView(),
        encodeContractMasterButtonAction,
      );

      return {
        content: rendered.content ?? "",
        embeds: [
          {
            title: panelEmbeds.artwork.title,
            image: {
              url: panelEmbeds.artwork.imageUrl,
            },
          },
          {
            title: panelEmbeds.details.title,
            description: panelEmbeds.details.description,
          },
        ],
        components: rendered.components ?? [],
      };
    },
  };
};

export const syncContractMasterPanelOnStartup = async ({
  client,
  config,
  db,
  logger,
}: SyncContractMasterPanelOnStartupDependencies): Promise<void> => {
  const syncContractMasterPanel = createSyncContractMasterPanelUseCase({
    config,
    panelSource: createPanelSource(db),
    publisher: createDiscordContractMasterPanelPublisher(client),
  });

  const result = await syncContractMasterPanel();
  if (result.status === "skipped") {
    logger.log(`[contract-master] Startup sync inactive. ${result.reason}`);
    return;
  }

  logger.log(
    `[contract-master] Startup sync finished for channel ${result.channelId}. synced=${result.syncedCount} created=${result.createdCount} edited=${result.editedCount} deleted=${result.deletedCount}`,
  );
};
