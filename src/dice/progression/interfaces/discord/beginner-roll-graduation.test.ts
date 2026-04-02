import assert from "node:assert/strict";
import test from "node:test";
import {
  formatBeginnerRollGraduationMessage,
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
    channel: {
      send: async (message: {
        content: string;
        allowedMentions: { parse: string[]; users: string[] };
      }) => {
        sent.push(message);
        return {} as never;
      },
    },
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
