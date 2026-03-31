import type { Client, Message, MessageMentionOptions } from "discord.js";
import type { AchievementsChannelConfig } from "../../shared/config";
import { achievementsChannelConfig } from "../../shared/config";

type SendableMessageChannel = {
  send: (options: { content: string; allowedMentions: MessageMentionOptions }) => Promise<Message>;
};

type AchievementsChannelLogger = {
  warn?: (...args: unknown[]) => void;
};

export type AchievementsChannelMessage = {
  content: string;
  mentionedUserIds?: readonly string[];
};

const isSendableMessageChannel = (value: unknown): value is SendableMessageChannel => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const channel = value as {
    send?: unknown;
  };
  return typeof channel.send === "function";
};

export const resolveAchievementsChannel = async (
  client: Client,
  channelId: string,
): Promise<SendableMessageChannel> => {
  const channel = await client.channels.fetch(channelId);
  if (!channel || !channel.isTextBased() || !isSendableMessageChannel(channel)) {
    throw new Error(
      `ACHIEVEMENTS_CHANNEL_ID must reference a sendable text channel. Received ${channelId}.`,
    );
  }

  return channel;
};

export const publishAchievementsChannelMessages = async ({
  client,
  messages,
  config = achievementsChannelConfig,
  logger = console,
}: {
  client: Client;
  messages: readonly AchievementsChannelMessage[];
  config?: AchievementsChannelConfig;
  logger?: AchievementsChannelLogger;
}): Promise<void> => {
  if (!config.enabled || !config.channelId || messages.length < 1) {
    return;
  }

  let channel: SendableMessageChannel;
  try {
    channel = await resolveAchievementsChannel(client, config.channelId);
  } catch (error) {
    logger.warn?.("[achievements] Failed to resolve achievements channel.", error);
    return;
  }

  for (const message of messages) {
    try {
      await channel.send({
        content: message.content,
        allowedMentions: {
          parse: [],
          users: [...new Set(message.mentionedUserIds ?? [])],
        },
      });
    } catch (error) {
      logger.warn?.("[achievements] Failed to publish achievements-channel message.", error);
    }
  }
};
