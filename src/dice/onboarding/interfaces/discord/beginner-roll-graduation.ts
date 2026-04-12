import type { Client, GuildMember, Message, MessageMentionOptions } from "discord.js";
import {
  grantDiscordRoleRewardInGuild,
  type DiscordGuildRoleGrantStatus,
} from "../../../../app/discord/role-rewards";
import { getOptionalBeginnerOnboardingV1Data } from "../../../../rolly-data/load";
import type { BeginnerOnboardingGuildData } from "../../../../rolly-data/types";
import { getDatabase } from "../../../../shared/db";
import {
  decideBeginnerMemberJoinTransition,
  decideBeginnerRollCompletedTransition,
} from "../../application/beginner-onboarding-transitions";
import { createSqliteBeginnerOnboardingStateRepository } from "../../infrastructure/sqlite/beginner-onboarding-state-repository";

const userMentionTemplateTokens = ["${userMention}", "{userMention}", "<@user>", "@user"];

type SendableMessageChannel = {
  send: (options: { content: string; allowedMentions: MessageMentionOptions }) => Promise<Message>;
};

type SendableGuildMessageChannel = SendableMessageChannel & {
  id: string;
  guild: {
    id: string;
  };
};

type BeginnerRollGraduationLogger = {
  warn?: (...args: unknown[]) => void;
};

type BeginnerOnboardingStateRepository = {
  hasBeginnerRollerAchievement: (userId: string) => boolean;
  hasGuildGraduated: (guildId: string, userId: string) => boolean;
  markGuildGraduated: (guildId: string, userId: string) => boolean;
};

type RoleGrantStatus = DiscordGuildRoleGrantStatus;

type BeginnerOnboardingDiscordDependencies = {
  getGuildOnboardingConfig?: (guildId: string | null) => BeginnerOnboardingGuildData | null;
  getBeginnerOnboardingStateRepository?: () => BeginnerOnboardingStateRepository;
  grantGraduationRole?: (args: {
    client: Client;
    onboardingData: BeginnerOnboardingGuildData;
    userId: string;
    logger: BeginnerRollGraduationLogger;
  }) => Promise<RoleGrantStatus>;
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
    id?: unknown;
    guild?: {
      id?: unknown;
    };
  };

  return typeof channel.id === "string" && typeof channel.guild?.id === "string";
};

const renderOnboardingMessage = (template: string, userId: string): string => {
  const escapedTokens = userMentionTemplateTokens.map((token) =>
    token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );

  return template.replace(new RegExp(escapedTokens.join("|"), "g"), `<@${userId}>`);
};

const defaultGetGuildOnboardingConfig = (
  guildId: string | null,
): BeginnerOnboardingGuildData | null => {
  if (!guildId) {
    return null;
  }

  const onboardingData = getOptionalBeginnerOnboardingV1Data();
  return onboardingData?.guilds.find((guild) => guild.guildId === guildId) ?? null;
};

const defaultGetBeginnerOnboardingStateRepository = () => {
  return createSqliteBeginnerOnboardingStateRepository(getDatabase());
};

const defaultGrantGraduationRole = async ({
  client,
  onboardingData,
  userId,
  logger,
}: {
  client: Client;
  onboardingData: BeginnerOnboardingGuildData;
  userId: string;
  logger: BeginnerRollGraduationLogger;
}): Promise<RoleGrantStatus> => {
  return grantDiscordRoleRewardInGuild({
    client,
    guildId: onboardingData.guildId,
    userId,
    roleId: onboardingData.graduationRoleId ?? "",
    logger,
    logPrefix: "[onboarding]",
  });
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
  if (
    isSendableGuildMessageChannel(channel) &&
    channel.guild.id === guildId &&
    channel.id === channelId
  ) {
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
  grantGraduationRole,
}: {
  client: Client;
  onboardingData: BeginnerOnboardingGuildData;
  userId: string;
  logger: BeginnerRollGraduationLogger;
  grantGraduationRole: NonNullable<BeginnerOnboardingDiscordDependencies["grantGraduationRole"]>;
}): Promise<boolean> => {
  if (!onboardingData.graduationRoleId) {
    return true;
  }

  const status = await grantGraduationRole({
    client,
    onboardingData,
    userId,
    logger,
  });

  return status === "granted" || status === "already-had-role";
};

export const formatBeginnerRollGraduationMessage = (userId: string): string => {
  return `<@${userId}> Congratulations, you've proven you know how to roll. Let's continue rolling in the general channels.`;
};

export const createBeginnerOnboardingDiscordHandlers = ({
  getGuildOnboardingConfig = defaultGetGuildOnboardingConfig,
  getBeginnerOnboardingStateRepository = defaultGetBeginnerOnboardingStateRepository,
  grantGraduationRole = defaultGrantGraduationRole,
}: BeginnerOnboardingDiscordDependencies = {}) => {
  const publishBeginnerRollGraduationMessage = async ({
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

  const publishBeginnerRollWelcomeMessage = async ({
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

  const handleBeginnerRollMemberJoin = async ({
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
    const transition = decideBeginnerMemberJoinTransition({
      hasOnboardingConfig: true,
      hasReachedBeginnerMilestone: hasBeginnerAchievement,
      hasGraduatedInGuild: alreadyGraduatedInGuild,
    });

    if (transition.kind === "publish-welcome") {
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
      grantGraduationRole,
    });

    if (transition.kind !== "graduate-in-guild") {
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

  const handleBeginnerRollAfterRoll = async ({
    client,
    channel,
    guildId,
    userId,
    didReachBeginnerMilestoneOnThisRoll,
    logger = console,
  }: {
    client: Client;
    channel: unknown;
    guildId: string | null;
    userId: string;
    didReachBeginnerMilestoneOnThisRoll: boolean;
    logger?: BeginnerRollGraduationLogger;
  }): Promise<void> => {
    const onboardingData = getGuildOnboardingConfig(guildId);

    if (!onboardingData || !guildId) {
      const transition = decideBeginnerRollCompletedTransition({
        hasOnboardingConfig: false,
        guildId,
        didReachBeginnerMilestoneOnThisRoll,
        hasReachedBeginnerMilestone: false,
        hasGraduatedInGuild: false,
      });

      if (transition.kind !== "publish-legacy-handoff") {
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
    const hasBeginnerAchievement = onboardingState.hasBeginnerRollerAchievement(userId);
    const hasGraduatedInGuild = onboardingState.hasGuildGraduated(guildId, userId);
    const transition = decideBeginnerRollCompletedTransition({
      hasOnboardingConfig: true,
      guildId,
      didReachBeginnerMilestoneOnThisRoll,
      hasReachedBeginnerMilestone: hasBeginnerAchievement,
      hasGraduatedInGuild,
    });

    if (!hasBeginnerAchievement) {
      return;
    }

    const roleReady = await ensureGraduationRole({
      client,
      onboardingData,
      userId,
      logger,
      grantGraduationRole,
    });
    if (onboardingData.graduationRoleId && !roleReady) {
      return;
    }

    if (transition.kind !== "graduate-in-guild") {
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

  return {
    publishBeginnerRollGraduationMessage,
    publishBeginnerRollWelcomeMessage,
    handleBeginnerRollMemberJoin,
    handleBeginnerRollAfterRoll,
  };
};

export const {
  publishBeginnerRollGraduationMessage,
  publishBeginnerRollWelcomeMessage,
  handleBeginnerRollMemberJoin,
  handleBeginnerRollAfterRoll,
} = createBeginnerOnboardingDiscordHandlers();
