import { Collection } from "discord.js";
import type {
  ActionRowBuilder,
  Client,
  Message,
  MessageActionRowComponentBuilder,
} from "discord.js";
import type { ContractMasterPanelPublisher } from "../contract-master-panel-sync";
import { contractMasterButtonPrefix } from "../../interfaces/discord/buttons/contract-master-buttons";

type SendableMessageChannel = {
  id: string;
  send: (options: {
    content: string;
    components: ActionRowBuilder<MessageActionRowComponentBuilder>[];
  }) => Promise<Message>;
  messages: {
    fetch: {
      (messageId: string): Promise<Message>;
      (options: { limit: number }): Promise<Collection<string, Message>>;
    };
  };
};

const panelHistoryFetchLimit = 50;

const isUnknownMessageError = (error: unknown): boolean => {
  return typeof error === "object" && error !== null && "code" in error && error.code === 10008;
};

const isSendableMessageChannel = (value: unknown): value is SendableMessageChannel => {
  if (typeof value !== "object" || value === null || !("messages" in value) || !("send" in value)) {
    return false;
  }

  const channel = value as {
    send?: unknown;
    messages?: unknown;
  };
  if (typeof channel.send !== "function") {
    return false;
  }

  const { messages } = channel;
  if (typeof messages !== "object" || messages === null || !("fetch" in messages)) {
    return false;
  }

  return typeof (messages as { fetch?: unknown }).fetch === "function";
};

const resolveSendableMessageChannel = async (
  client: Client,
  channelId: string,
): Promise<SendableMessageChannel> => {
  const channel = await client.channels.fetch(channelId);

  if (!channel || !channel.isTextBased() || !isSendableMessageChannel(channel)) {
    throw new Error(
      `CONTRACT_MASTER_CHANNEL_ID must reference a sendable text channel. Received ${channelId}.`,
    );
  }

  return channel;
};

const isContractMasterPanelMessage = (message: Message, botUserId: string): boolean => {
  if (message.author.id !== botUserId) {
    return false;
  }

  return message.components.some((row) => {
    if (!("components" in row) || !Array.isArray(row.components)) {
      return false;
    }

    return row.components.some((component: unknown) => {
      return (
        typeof component === "object" &&
        component !== null &&
        "customId" in component &&
        typeof component.customId === "string" &&
        component.customId.startsWith(contractMasterButtonPrefix)
      );
    });
  });
};

export const createDiscordContractMasterPanelPublisher = (
  client: Client,
): ContractMasterPanelPublisher => {
  return {
    assertSendableChannel: async (channelId) => {
      await resolveSendableMessageChannel(client, channelId);
    },
    listPanelMessages: async (channelId) => {
      const channel = await resolveSendableMessageChannel(client, channelId);
      const botUserId = client.user?.id;
      if (!botUserId) {
        return [];
      }

      const messages = await channel.messages.fetch({ limit: panelHistoryFetchLimit });

      return [...messages.values()]
        .filter((message) => isContractMasterPanelMessage(message, botUserId))
        .map((message) => ({
          messageId: message.id,
          createdTimestamp: message.createdTimestamp,
        }));
    },
    createMessage: async ({ channelId, content, components }) => {
      const channel = await resolveSendableMessageChannel(client, channelId);
      const message = await channel.send({
        content,
        components: components as ActionRowBuilder<MessageActionRowComponentBuilder>[],
      });

      return { messageId: message.id };
    },
    editMessage: async ({ channelId, messageId, content, components }) => {
      const channel = await resolveSendableMessageChannel(client, channelId);
      const message = await channel.messages.fetch(messageId);
      await message.edit({
        content,
        components: components as ActionRowBuilder<MessageActionRowComponentBuilder>[],
      });
    },
    deleteMessage: async ({ channelId, messageId }) => {
      try {
        const channel = await resolveSendableMessageChannel(client, channelId);
        const message = await channel.messages.fetch(messageId);
        await message.delete();
      } catch (error) {
        if (isUnknownMessageError(error)) {
          return;
        }

        throw error;
      }
    },
  };
};
