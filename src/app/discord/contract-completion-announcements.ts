import type { Client, Message, MessageMentionOptions } from "discord.js";
import type { ContractCompletionAnnouncement } from "../../dice/contracts/application/completion-announcements";
import type { AchievementsChannelConfig } from "../../shared/config";
import { achievementsChannelConfig } from "../../shared/config";

type SendableMessageChannel = {
  send: (options: { content: string; allowedMentions: MessageMentionOptions }) => Promise<Message>;
};

type ContractAnnouncementsLogger = {
  warn: (...args: unknown[]) => void;
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

const resolveAchievementsChannel = async (
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

const getCadenceLabel = (cadence: ContractCompletionAnnouncement["cadence"]): string => {
  return cadence === "daily" ? "Daily" : "Weekly";
};

export const formatContractCompletionAnnouncementContent = (
  announcement: ContractCompletionAnnouncement,
): string => {
  const cadenceLabel = getCadenceLabel(announcement.cadence);
  return `<@${announcement.userId}> completed a ${cadenceLabel} contract: ${announcement.contractTitle} (+${announcement.rewardPips} Pips).`;
};

export const publishContractCompletionAnnouncements = async ({
  client,
  announcements,
  config = achievementsChannelConfig,
  logger = console,
}: {
  client: Client;
  announcements: readonly ContractCompletionAnnouncement[];
  config?: AchievementsChannelConfig;
  logger?: ContractAnnouncementsLogger;
}): Promise<void> => {
  if (!config.enabled || !config.channelId || announcements.length < 1) {
    return;
  }

  let channel: SendableMessageChannel;
  try {
    channel = await resolveAchievementsChannel(client, config.channelId);
  } catch (error) {
    logger.warn("[contracts] Failed to resolve achievements channel.", error);
    return;
  }

  for (const announcement of announcements) {
    try {
      await channel.send({
        content: formatContractCompletionAnnouncementContent(announcement),
        allowedMentions: {
          parse: [],
          users: [announcement.userId],
        },
      });
    } catch (error) {
      logger.warn("[contracts] Failed to publish contract completion announcement.", error);
    }
  }
};
