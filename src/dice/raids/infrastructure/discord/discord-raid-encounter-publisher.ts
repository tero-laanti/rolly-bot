import type { BaseMessageOptions, Client, Message } from "discord.js";

type SendableMessageChannel = {
  id: string;
  send: (options: BaseMessageOptions) => Promise<Message>;
  messages: {
    fetch: (messageId: string) => Promise<Message>;
  };
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
      `Raid encounter channel must be a sendable text channel. Received ${channelId}.`,
    );
  }

  return channel;
};

export const createDiscordRaidEncounterPublisher = (client: Client) => {
  return {
    publishEncounterMessage: async ({
      channelId,
      prompt,
    }: {
      channelId: string;
      prompt: BaseMessageOptions;
    }) => {
      const channel = await resolveSendableMessageChannel(client, channelId);
      const message = await channel.send(prompt);
      return {
        messageId: message.id,
      };
    },
    updateEncounterMessage: async ({
      channelId,
      messageId,
      prompt,
    }: {
      channelId: string;
      messageId: string;
      prompt: BaseMessageOptions;
    }) => {
      const channel = await resolveSendableMessageChannel(client, channelId);
      const message = await channel.messages.fetch(messageId);
      await message.edit(prompt);
    },
    sendChannelMessage: async ({ channelId, content }: { channelId: string; content: string }) => {
      const channel = await resolveSendableMessageChannel(client, channelId);
      await channel.send({ content });
    },
  };
};
