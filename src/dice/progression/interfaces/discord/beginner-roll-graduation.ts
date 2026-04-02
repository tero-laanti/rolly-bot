import type { Message, MessageMentionOptions } from "discord.js";
import type { AchievementAnnouncement } from "../../application/achievement-announcements";

const beginnerRollerAchievementId = "manual-rolls-5";

type SendableMessageChannel = {
  send: (options: { content: string; allowedMentions: MessageMentionOptions }) => Promise<Message>;
};

type BeginnerRollGraduationLogger = {
  warn?: (...args: unknown[]) => void;
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

export const hasBeginnerRollerAchievementAnnouncement = (
  announcements: readonly AchievementAnnouncement[],
  userId: string,
): boolean => {
  return announcements.some(
    (announcement) =>
      announcement.userId === userId &&
      announcement.achievementIds.includes(beginnerRollerAchievementId),
  );
};

export const formatBeginnerRollGraduationMessage = (userId: string): string => {
  return `<@${userId}> Congratulations, you've proven you know how to roll. Let's continue rolling in the general channels.`;
};

export const publishBeginnerRollGraduationMessage = async ({
  channel,
  userId,
  logger = console,
}: {
  channel: unknown;
  userId: string;
  logger?: BeginnerRollGraduationLogger;
}): Promise<void> => {
  if (!isSendableMessageChannel(channel)) {
    return;
  }

  try {
    await channel.send({
      content: formatBeginnerRollGraduationMessage(userId),
      allowedMentions: {
        parse: [],
        users: [userId],
      },
    });
  } catch (error) {
    logger.warn?.("[roll] Failed to publish beginner graduation message.", error);
  }
};
