import type {
  ActionRowBuilder,
  Client,
  Message,
  MessageActionRowComponentBuilder,
} from "discord.js";
import { renderActionView } from "../../../../app/discord/render-action-result";
import type { ActionView } from "../../../../shared-kernel/application/action-view";
import type { RaidButtonAction } from "../../application/manage-lobby/actions";
import { encodeRaidButtonAction } from "../../interfaces/discord/buttons/raid-buttons";

type SendableMessageChannel = {
  id: string;
  send: (options: {
    content: string;
    components: ActionRowBuilder<MessageActionRowComponentBuilder>[];
  }) => Promise<Message>;
  messages: {
    fetch: (messageId: string) => Promise<Message>;
  };
};

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
      `Raid status channel must reference a sendable text channel. Received ${channelId}.`,
    );
  }

  return channel;
};

const publishViewMessage = async ({
  client,
  channelId,
  view,
}: {
  client: Client;
  channelId: string;
  view: ActionView<RaidButtonAction>;
}) => {
  const channel = await resolveSendableMessageChannel(client, channelId);
  const rendered = renderActionView(view, encodeRaidButtonAction);
  const message = await channel.send({
    content: rendered.content ?? "",
    components: rendered.components as ActionRowBuilder<MessageActionRowComponentBuilder>[],
  });

  const deletePublishedMessage = async (): Promise<void> => {
    try {
      const publishedChannel = await resolveSendableMessageChannel(client, channelId);
      const publishedMessage = await publishedChannel.messages.fetch(message.id);
      await publishedMessage.delete();
    } catch (error) {
      if (isUnknownMessageError(error)) {
        return;
      }

      throw error;
    }
  };

  return {
    messageId: message.id,
    url: message.url,
    deletePublishedMessage,
  };
};

export const createDiscordRaidStatusPublisher = (client: Client) => {
  return {
    publishRecruitment: async ({
      channelId,
      view,
    }: {
      channelId: string;
      view: ActionView<RaidButtonAction>;
    }) => publishViewMessage({ client, channelId, view }),
    publishStatusMessage: async ({
      channelId,
      view,
    }: {
      channelId: string;
      view: ActionView<RaidButtonAction>;
    }) => {
      const published = await publishViewMessage({ client, channelId, view });
      return {
        messageId: published.messageId,
        deletePublishedMessage: published.deletePublishedMessage,
      };
    },
    updateStatusMessage: async ({
      channelId,
      messageId,
      view,
    }: {
      channelId: string;
      messageId: string;
      view: ActionView<RaidButtonAction>;
    }) => {
      const channel = await resolveSendableMessageChannel(client, channelId);
      const message = await channel.messages.fetch(messageId);
      const rendered = renderActionView(view, encodeRaidButtonAction);
      await message.edit({
        content: rendered.content ?? "",
        components: rendered.components as ActionRowBuilder<MessageActionRowComponentBuilder>[],
      });
    },
  };
};
