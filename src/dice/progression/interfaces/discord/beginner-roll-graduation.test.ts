import assert from "node:assert/strict";
import test from "node:test";
import {
  formatBeginnerRollGraduationMessage,
  handleBeginnerRollAfterRoll,
  hasBeginnerRollerAchievementAnnouncement,
  publishBeginnerRollGraduationMessage,
} from "./beginner-roll-graduation";

test("detects when the beginner roller achievement was newly announced for the user", () => {
  assert.equal(
    hasBeginnerRollerAchievementAnnouncement(
      [
        {
          userId: "user-1",
          achievementIds: ["first-roll", "manual-rolls-5"],
        },
      ],
      "user-1",
    ),
    true,
  );
  assert.equal(
    hasBeginnerRollerAchievementAnnouncement(
      [
        {
          userId: "user-1",
          achievementIds: ["first-roll"],
        },
      ],
      "user-1",
    ),
    false,
  );
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
    wasBeginnerRollerAchievementAnnounced: true,
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
    wasBeginnerRollerAchievementAnnounced: false,
  });

  assert.deepEqual(sent, []);
});
