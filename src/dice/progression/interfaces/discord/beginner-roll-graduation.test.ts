import assert from "node:assert/strict";
import test from "node:test";
import type { BeginnerOnboardingGuildData } from "../../../../rolly-data/types";
import { hasReachedBeginnerMilestone } from "../../domain/beginner-milestone";
import {
  createBeginnerOnboardingDiscordHandlers,
  formatBeginnerRollGraduationMessage,
  publishBeginnerRollGraduationMessage,
} from "../../../onboarding/interfaces/discord/beginner-roll-graduation";

const onboardingGuild: BeginnerOnboardingGuildData = {
  guildId: "guild-1",
  beginnerChannelId: "beginner-channel",
  joinMessage: "Welcome ${userMention} to the beginner area.",
  graduationChannelId: "graduation-channel",
  graduationMessage: "Well done ${userMention}, you made it.",
  graduationRoleId: "beginner-role",
};

const createRecordedChannel = (
  guildId: string,
  sent: Array<{ channelId: string; content: string }>,
) => {
  return (channelId: string) => ({
    id: channelId,
    guild: {
      id: guildId,
    },
    send: async (message: {
      content: string;
      allowedMentions: { parse: string[]; users: string[] };
    }) => {
      sent.push({
        channelId,
        content: message.content,
      });
      return {} as never;
    },
  });
};

test("detects when a roll newly reaches the beginner milestone", () => {
  assert.equal(hasReachedBeginnerMilestone(["first-roll", "manual-rolls-5"]), true);
  assert.equal(hasReachedBeginnerMilestone(["first-roll"]), false);
});

test("formats the beginner graduation handoff copy", () => {
  assert.equal(
    formatBeginnerRollGraduationMessage("user-1"),
    "<@user-1> Congratulations, you've proven you know how to roll. Let's continue rolling in the general channels.",
  );
});

test("publishes the beginner graduation message with a direct user mention", async () => {
  const sent: Array<{ content: string; allowedMentions: { parse: string[]; users: string[] } }> =
    [];

  await publishBeginnerRollGraduationMessage({
    client: {
      channels: {
        fetch: async () => null,
      },
    } as never,
    channel: {
      send: async (message: {
        content: string;
        allowedMentions: { parse: string[]; users: string[] };
      }) => {
        sent.push(message);
        return {} as never;
      },
    },
    guildId: "guild-1",
    userId: "user-1",
  });

  assert.deepEqual(sent, [
    {
      content:
        "<@user-1> Congratulations, you've proven you know how to roll. Let's continue rolling in the general channels.",
      allowedMentions: {
        parse: [],
        users: ["user-1"],
      },
    },
  ]);
});

test("handleBeginnerRollAfterRoll preserves the legacy handoff when onboarding config is absent", async () => {
  const sent: Array<{ content: string; allowedMentions: { parse: string[]; users: string[] } }> =
    [];
  const { handleBeginnerRollAfterRoll } = createBeginnerOnboardingDiscordHandlers({
    getGuildOnboardingConfig: () => null,
  });

  await handleBeginnerRollAfterRoll({
    client: {
      channels: {
        fetch: async () => null,
      },
    } as never,
    channel: {
      send: async (message: {
        content: string;
        allowedMentions: { parse: string[]; users: string[] };
      }) => {
        sent.push(message);
        return {} as never;
      },
    },
    guildId: "guild-without-onboarding-config",
    userId: "user-1",
    didReachBeginnerMilestoneOnThisRoll: true,
  });

  assert.deepEqual(sent, [
    {
      content:
        "<@user-1> Congratulations, you've proven you know how to roll. Let's continue rolling in the general channels.",
      allowedMentions: {
        parse: [],
        users: ["user-1"],
      },
    },
  ]);
});

test("handleBeginnerRollAfterRoll stays silent without onboarding config when the achievement was not newly announced", async () => {
  const sent: Array<{ content: string; allowedMentions: { parse: string[]; users: string[] } }> =
    [];
  const { handleBeginnerRollAfterRoll } = createBeginnerOnboardingDiscordHandlers({
    getGuildOnboardingConfig: () => null,
  });

  await handleBeginnerRollAfterRoll({
    client: {
      channels: {
        fetch: async () => null,
      },
    } as never,
    channel: {
      send: async (message: {
        content: string;
        allowedMentions: { parse: string[]; users: string[] };
      }) => {
        sent.push(message);
        return {} as never;
      },
    },
    guildId: "guild-without-onboarding-config",
    userId: "user-1",
    didReachBeginnerMilestoneOnThisRoll: false,
  });

  assert.deepEqual(sent, []);
});

test("handleBeginnerRollAfterRoll graduates configured guild users through onboarding-owned role and messaging", async () => {
  const sent: Array<{ channelId: string; content: string }> = [];
  const fetchChannel = createRecordedChannel(onboardingGuild.guildId, sent);
  const grantCalls: string[] = [];
  const markCalls: Array<{ guildId: string; userId: string }> = [];
  const { handleBeginnerRollAfterRoll } = createBeginnerOnboardingDiscordHandlers({
    getGuildOnboardingConfig: (guildId) =>
      guildId === onboardingGuild.guildId ? onboardingGuild : null,
    getBeginnerOnboardingStateRepository: () => ({
      hasBeginnerRollerAchievement: () => true,
      hasGuildGraduated: () => false,
      markGuildGraduated: (guildId, userId) => {
        markCalls.push({ guildId, userId });
        return true;
      },
    }),
    grantGraduationRole: async ({ userId }) => {
      grantCalls.push(userId);
      return "granted";
    },
  });

  await handleBeginnerRollAfterRoll({
    client: {
      channels: {
        fetch: async (channelId: string) => fetchChannel(channelId),
      },
    } as never,
    channel: null,
    guildId: onboardingGuild.guildId,
    userId: "user-1",
    didReachBeginnerMilestoneOnThisRoll: true,
  });

  assert.deepEqual(grantCalls, ["user-1"]);
  assert.deepEqual(markCalls, [{ guildId: onboardingGuild.guildId, userId: "user-1" }]);
  assert.deepEqual(sent, [
    {
      channelId: onboardingGuild.beginnerChannelId,
      content:
        "<@user-1> Congratulations, you've proven you know how to roll. Let's continue rolling in the general channels.",
    },
    {
      channelId: onboardingGuild.graduationChannelId ?? "",
      content: "Well done <@user-1>, you made it.",
    },
  ]);
});

test("handleBeginnerRollAfterRoll does not reuse a same-guild non-beginner channel for the graduation handoff", async () => {
  const sent: Array<{ channelId: string; content: string }> = [];
  const fetchChannel = createRecordedChannel(onboardingGuild.guildId, sent);
  const wrongChannelSends: string[] = [];
  const { handleBeginnerRollAfterRoll } = createBeginnerOnboardingDiscordHandlers({
    getGuildOnboardingConfig: (guildId) =>
      guildId === onboardingGuild.guildId ? onboardingGuild : null,
    getBeginnerOnboardingStateRepository: () => ({
      hasBeginnerRollerAchievement: () => true,
      hasGuildGraduated: () => false,
      markGuildGraduated: () => true,
    }),
    grantGraduationRole: async () => "granted",
  });

  await handleBeginnerRollAfterRoll({
    client: {
      channels: {
        fetch: async (channelId: string) => fetchChannel(channelId),
      },
    } as never,
    channel: {
      id: "general-channel",
      guild: {
        id: onboardingGuild.guildId,
      },
      send: async (message: {
        content: string;
        allowedMentions: { parse: string[]; users: string[] };
      }) => {
        wrongChannelSends.push(message.content);
        return {} as never;
      },
    },
    guildId: onboardingGuild.guildId,
    userId: "user-1",
    didReachBeginnerMilestoneOnThisRoll: true,
  });

  assert.deepEqual(wrongChannelSends, []);
  assert.deepEqual(sent, [
    {
      channelId: onboardingGuild.beginnerChannelId,
      content:
        "<@user-1> Congratulations, you've proven you know how to roll. Let's continue rolling in the general channels.",
    },
    {
      channelId: onboardingGuild.graduationChannelId ?? "",
      content: "Well done <@user-1>, you made it.",
    },
  ]);
});

test("handleBeginnerRollMemberJoin publishes the configured welcome for new beginners", async () => {
  const sent: Array<{ channelId: string; content: string }> = [];
  const fetchChannel = createRecordedChannel(onboardingGuild.guildId, sent);
  let grantCalled = false;
  let markCalled = false;
  const { handleBeginnerRollMemberJoin } = createBeginnerOnboardingDiscordHandlers({
    getGuildOnboardingConfig: (guildId) =>
      guildId === onboardingGuild.guildId ? onboardingGuild : null,
    getBeginnerOnboardingStateRepository: () => ({
      hasBeginnerRollerAchievement: () => false,
      hasGuildGraduated: () => false,
      markGuildGraduated: () => {
        markCalled = true;
        return true;
      },
    }),
    grantGraduationRole: async () => {
      grantCalled = true;
      return "granted";
    },
  });

  await handleBeginnerRollMemberJoin({
    client: {
      channels: {
        fetch: async (channelId: string) => fetchChannel(channelId),
      },
    } as never,
    member: {
      id: "user-2",
      guild: {
        id: onboardingGuild.guildId,
      },
      user: {
        bot: false,
      },
    } as never,
  });

  assert.equal(grantCalled, false);
  assert.equal(markCalled, false);
  assert.deepEqual(sent, [
    {
      channelId: onboardingGuild.beginnerChannelId,
      content: "Welcome <@user-2> to the beginner area.",
    },
  ]);
});

test("handleBeginnerRollMemberJoin re-grants the graduation role for already graduated users without reposting", async () => {
  const sent: Array<{ channelId: string; content: string }> = [];
  let markCalled = false;
  const grantCalls: string[] = [];
  const { handleBeginnerRollMemberJoin } = createBeginnerOnboardingDiscordHandlers({
    getGuildOnboardingConfig: (guildId) =>
      guildId === onboardingGuild.guildId ? onboardingGuild : null,
    getBeginnerOnboardingStateRepository: () => ({
      hasBeginnerRollerAchievement: () => true,
      hasGuildGraduated: () => true,
      markGuildGraduated: () => {
        markCalled = true;
        return true;
      },
    }),
    grantGraduationRole: async ({ userId }) => {
      grantCalls.push(userId);
      return "granted";
    },
  });

  await handleBeginnerRollMemberJoin({
    client: {
      channels: {
        fetch: async (channelId: string) =>
          createRecordedChannel(onboardingGuild.guildId, sent)(channelId),
      },
    } as never,
    member: {
      id: "user-3",
      guild: {
        id: onboardingGuild.guildId,
      },
      user: {
        bot: false,
      },
    } as never,
  });

  assert.deepEqual(grantCalls, ["user-3"]);
  assert.equal(markCalled, false);
  assert.deepEqual(sent, []);
});

test("handleBeginnerRollAfterRoll re-grants the graduation role for already graduated users without reposting", async () => {
  const sent: Array<{ channelId: string; content: string }> = [];
  let markCalled = false;
  const grantCalls: string[] = [];
  const { handleBeginnerRollAfterRoll } = createBeginnerOnboardingDiscordHandlers({
    getGuildOnboardingConfig: (guildId) =>
      guildId === onboardingGuild.guildId ? onboardingGuild : null,
    getBeginnerOnboardingStateRepository: () => ({
      hasBeginnerRollerAchievement: () => true,
      hasGuildGraduated: () => true,
      markGuildGraduated: () => {
        markCalled = true;
        return true;
      },
    }),
    grantGraduationRole: async ({ userId }) => {
      grantCalls.push(userId);
      return "granted";
    },
  });

  await handleBeginnerRollAfterRoll({
    client: {
      channels: {
        fetch: async (channelId: string) =>
          createRecordedChannel(onboardingGuild.guildId, sent)(channelId),
      },
    } as never,
    channel: null,
    guildId: onboardingGuild.guildId,
    userId: "user-4",
    didReachBeginnerMilestoneOnThisRoll: false,
  });

  assert.deepEqual(grantCalls, ["user-4"]);
  assert.equal(markCalled, false);
  assert.deepEqual(sent, []);
});

test("handleBeginnerRollAfterRoll skips duplicate graduation publishes when another worker already marked the guild", async () => {
  const sent: Array<{ channelId: string; content: string }> = [];
  const grantCalls: string[] = [];
  const { handleBeginnerRollAfterRoll } = createBeginnerOnboardingDiscordHandlers({
    getGuildOnboardingConfig: (guildId) =>
      guildId === onboardingGuild.guildId ? onboardingGuild : null,
    getBeginnerOnboardingStateRepository: () => ({
      hasBeginnerRollerAchievement: () => true,
      hasGuildGraduated: () => false,
      markGuildGraduated: () => false,
    }),
    grantGraduationRole: async ({ userId }) => {
      grantCalls.push(userId);
      return "granted";
    },
  });

  await handleBeginnerRollAfterRoll({
    client: {
      channels: {
        fetch: async (channelId: string) =>
          createRecordedChannel(onboardingGuild.guildId, sent)(channelId),
      },
    } as never,
    channel: null,
    guildId: onboardingGuild.guildId,
    userId: "user-5",
    didReachBeginnerMilestoneOnThisRoll: true,
  });

  assert.deepEqual(grantCalls, ["user-5"]);
  assert.deepEqual(sent, []);
});
