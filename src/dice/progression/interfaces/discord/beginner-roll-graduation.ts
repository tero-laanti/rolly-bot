import type { Client, GuildMember, Message, MessageMentionOptions } from "discord.js";
import { grantDiscordRoleRewardInGuild } from "../../../../app/discord/role-rewards";
import { getOptionalBeginnerOnboardingV1Data } from "../../../../rolly-data/load";
import type { BeginnerOnboardingGuildData } from "../../../../rolly-data/types";
import { getDatabase } from "../../../../shared/db";
import type { AchievementAnnouncement } from "../../application/achievement-announcements";
import { createSqliteBeginnerOnboardingStateRepository } from "../../infrastructure/sqlite/beginner-onboarding-state-repository";

const beginnerRollerAchievementId = "manual-rolls-5";
const userMentionTemplateTokens = ["${userMention}", "{userMention}", "<@user>", "@user"];

type SendableMessageChannel = {
  send: (options: { content: string; allowedMentions: MessageMentionOptions }) => Promise<Message>;
};

type SendableGuildMessageChannel = SendableMessageChannel & {
  guild: {
    id: string;
  };
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

const isSendableGuildMessageChannel = (value: unknown): value is SendableGuildMessageChannel => {
  if (!isSendableMessageChannel(value)) {
    return false;
  }

  const channel = value as {
    guild?: {
      id?: unknown;
    };
  };

  return typeof channel.guild?.id === "string";
};

const renderOnboardingMessage = (template: string, userId: string): string => {
  let rendered = template;
  for (const token of userMentionTemplateTokens) {
    rendered = rendered.replaceAll(token, `<@${userId}>`);
  }

  return rendered;
};

const getGuildOnboardingConfig = (guildId: string | null): BeginnerOnboardingGuildData | null => {
  if (!guildId) {
    return null;
  }

  const onboardingData = getOptionalBeginnerOnboardingV1Data();
  return onboardingData?.guilds.find((guild) => guild.guildId === guildId) ?? null;
};

const getBeginnerOnboardingStateRepository = () => {
  return createSqliteBeginnerOnboardingStateRepository(getDatabase());
};

const resolveConfiguredGuildChannel = async ({
  client,
  channel,
  guildId,
  channelId,
  logger,
  logLabel,
}: {
  client: Client;
  channel: unknown;
  guildId: string;
  channelId: string;
  logger: BeginnerRollGraduationLogger;
  logLabel: string;
}): Promise<SendableGuildMessageChannel | null> => {
  if (isSendableGuildMessageChannel(channel) && channel.guild.id === guildId) {
    return channel;
  }

  try {
    const fetchedChannel = await client.channels.fetch(channelId);
    if (!isSendableGuildMessageChannel(fetchedChannel) || fetchedChannel.guild.id !== guildId) {
      logger.warn?.(`${logLabel} ${channelId} is not sendable.`);
      return null;
    }

    return fetchedChannel;
  } catch (error) {
    logger.warn?.(`${logLabel} ${channelId} could not be fetched.`, error);
    return null;
  }
};

const publishRenderedOnboardingMessage = async ({
  resolvedChannel,
  template,
  userId,
}: {
  resolvedChannel: SendableMessageChannel;
  template: string;
  userId: string;
}): Promise<void> => {
  await resolvedChannel.send({
    content: renderOnboardingMessage(template, userId),
    allowedMentions: {
      parse: [],
      users: [userId],
    },
  });
};

const ensureGraduationRole = async ({
  client,
  onboardingData,
  userId,
  logger,
}: {
  client: Client;
  onboardingData: BeginnerOnboardingGuildData;
  userId: string;
  logger: BeginnerRollGraduationLogger;
}): Promise<boolean> => {
  if (!onboardingData.graduationRoleId) {
    return true;
  }

  const status = await grantDiscordRoleRewardInGuild({
    client,
    guildId: onboardingData.guildId,
    userId,
    roleId: onboardingData.graduationRoleId,
    logger,
    logPrefix: "[onboarding]",
  });

  return status === "granted" || status === "already-had-role";
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
  client,
  channel,
  guildId,
  userId,
  logger = console,
}: {
  client: Client;
  channel: unknown;
  guildId: string | null;
  userId: string;
  logger?: BeginnerRollGraduationLogger;
}): Promise<void> => {
  const onboardingData = getGuildOnboardingConfig(guildId);
  const standardChannel = onboardingData
    ? await resolveConfiguredGuildChannel({
        client,
        channel,
        guildId: onboardingData.guildId,
        channelId: onboardingData.beginnerChannelId,
        logger,
        logLabel: "[roll] Beginner graduation channel",
      })
    : isSendableMessageChannel(channel)
      ? channel
      : null;

  if (standardChannel) {
    try {
      await standardChannel.send({
        content: formatBeginnerRollGraduationMessage(userId),
        allowedMentions: {
          parse: [],
          users: [userId],
        },
      });
    } catch (error) {
      logger.warn?.("[roll] Failed to publish beginner graduation message.", error);
    }
  }

  if (!onboardingData) {
    return;
  }

  if (!onboardingData.graduationChannelId || !onboardingData.graduationMessage) {
    return;
  }

  const graduationChannel = await resolveConfiguredGuildChannel({
    client,
    channel: null,
    guildId: onboardingData.guildId,
    channelId: onboardingData.graduationChannelId,
    logger,
    logLabel: "[roll] Beginner graduation broadcast channel",
  });
  if (!graduationChannel) {
    return;
  }

  try {
    await publishRenderedOnboardingMessage({
      resolvedChannel: graduationChannel,
      template: onboardingData.graduationMessage,
      userId,
    });
  } catch (error) {
    logger.warn?.("[roll] Failed to publish beginner graduation broadcast.", error);
  }
};

export const publishBeginnerRollWelcomeMessage = async ({
  client,
  member,
  logger = console,
}: {
  client: Client;
  member: GuildMember;
  logger?: BeginnerRollGraduationLogger;
}): Promise<void> => {
  if (member.user.bot) {
    return;
  }

  const onboardingData = getGuildOnboardingConfig(member.guild.id);
  if (!onboardingData) {
    return;
  }

  const beginnerChannel = await resolveConfiguredGuildChannel({
    client,
    channel: null,
    guildId: onboardingData.guildId,
    channelId: onboardingData.beginnerChannelId,
    logger,
    logLabel: "[roll] Beginner welcome channel",
  });
  if (!beginnerChannel) {
    return;
  }

  try {
    await publishRenderedOnboardingMessage({
      resolvedChannel: beginnerChannel,
      template: onboardingData.joinMessage,
      userId: member.id,
    });
  } catch (error) {
    logger.warn?.("[roll] Failed to publish beginner welcome message.", error);
  }
};

export const handleBeginnerRollMemberJoin = async ({
  client,
  member,
  logger = console,
}: {
  client: Client;
  member: GuildMember;
  logger?: BeginnerRollGraduationLogger;
}): Promise<void> => {
  if (member.user.bot) {
    return;
  }

  const onboardingData = getGuildOnboardingConfig(member.guild.id);
  if (!onboardingData) {
    return;
  }

  const onboardingState = getBeginnerOnboardingStateRepository();
  const hasBeginnerAchievement = onboardingState.hasBeginnerRollerAchievement(member.id);
  const alreadyGraduatedInGuild = onboardingState.hasGuildGraduated(member.guild.id, member.id);

  if (!hasBeginnerAchievement && !alreadyGraduatedInGuild) {
    await publishBeginnerRollWelcomeMessage({
      client,
      member,
      logger,
    });
    return;
  }

  const roleReady = await ensureGraduationRole({
    client,
    onboardingData,
    userId: member.id,
    logger,
  });

  if (alreadyGraduatedInGuild || !hasBeginnerAchievement) {
    return;
  }

  if (onboardingData.graduationRoleId && !roleReady) {
    return;
  }

  if (!onboardingState.markGuildGraduated(member.guild.id, member.id)) {
    return;
  }

  await publishBeginnerRollGraduationMessage({
    client,
    channel: null,
    guildId: member.guild.id,
    userId: member.id,
    logger,
  });
};

export const handleBeginnerRollAfterRoll = async ({
  client,
  channel,
  guildId,
  userId,
  wasBeginnerRollerAchievementAnnounced,
  logger = console,
}: {
  client: Client;
  channel: unknown;
  guildId: string | null;
  userId: string;
  wasBeginnerRollerAchievementAnnounced: boolean;
  logger?: BeginnerRollGraduationLogger;
}): Promise<void> => {
  const onboardingData = getGuildOnboardingConfig(guildId);

  if (!onboardingData || !guildId) {
    if (!wasBeginnerRollerAchievementAnnounced) {
      return;
    }

    await publishBeginnerRollGraduationMessage({
      client,
      channel,
      guildId,
      userId,
      logger,
    });
    return;
  }

  const onboardingState = getBeginnerOnboardingStateRepository();
  if (!onboardingState.hasBeginnerRollerAchievement(userId)) {
    return;
  }

  const roleReady = await ensureGraduationRole({
    client,
    onboardingData,
    userId,
    logger,
  });
  if (onboardingData.graduationRoleId && !roleReady) {
    return;
  }

  if (!onboardingState.markGuildGraduated(guildId, userId)) {
    return;
  }

  await publishBeginnerRollGraduationMessage({
    client,
    channel,
    guildId,
    userId,
    logger,
  });
};
