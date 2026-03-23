import type { Client, Message } from "discord.js";
import type { IntroPostsPublisher } from "../../application/ports";

type SendableMessageChannel = {
  id: string;
  send: (options: { content: string }) => Promise<Message>;
  messages: {
    fetch: (messageId: string) => Promise<Message>;
  };
};

const isUnknownMessageError = (error: unknown): boolean => {
  return typeof error === "object" && error !== null && "code" in error && error.code === 10008;
};

const isSendableMessageChannel = (value: unknown): value is SendableMessageChannel => {
  if (typeof value !== "object" || value === null || !("id" in value) || !("messages" in value)) {
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
  if (typeof messages !== "object" || messages === null) {
    return false;
  }

  const messageManager = messages as {
    fetch?: unknown;
  };
  return typeof messageManager.fetch === "function";
};

const resolveSendableMessageChannel = async (
  client: Client,
  channelId: string,
): Promise<SendableMessageChannel> => {
  const channel = await client.channels.fetch(channelId);

  if (!channel || !channel.isTextBased() || !isSendableMessageChannel(channel)) {
    throw new Error(
      `INTRO_POST_CHANNEL_ID must reference a sendable text channel. Received ${channelId}.`,
    );
  }

  return channel;
};

export const createDiscordIntroPostsPublisher = (client: Client): IntroPostsPublisher => {
  return {
    assertSendableChannel: async (channelId) => {
      await resolveSendableMessageChannel(client, channelId);
    },
    hasMessage: async ({ channelId, messageId }) => {
      try {
        const channel = await resolveSendableMessageChannel(client, channelId);
        await channel.messages.fetch(messageId);
        return true;
      } catch (error) {
        if (isUnknownMessageError(error)) {
          return false;
        }

        throw error;
      }
    },
    createMessage: async ({ channelId, content }) => {
      const channel = await resolveSendableMessageChannel(client, channelId);
      const message = await channel.send({ content });
      return { messageId: message.id };
    },
    editMessage: async ({ channelId, messageId, content }) => {
      const channel = await resolveSendableMessageChannel(client, channelId);
      const message = await channel.messages.fetch(messageId);
      await message.edit({ content });
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
