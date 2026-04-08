import assert from "node:assert/strict";
import test from "node:test";
import type {
  APIEmbed,
  ActionRowBuilder,
  BaseMessageOptions,
  ButtonBuilder,
  JSONEncodable,
} from "discord.js";
import {
  buildWorldBossActivePrompt,
  buildWorldBossAnnouncementPrompt,
  buildWorldBossResolvedPrompt,
} from "./prompt";

const getEmbedDescription = (embed: APIEmbed | JSONEncodable<APIEmbed> | undefined) => {
  if (!embed) {
    return undefined;
  }

  return "toJSON" in embed ? embed.toJSON().description : embed.description;
};

const getButtonLabels = (prompt: BaseMessageOptions) => {
  return (prompt.components ?? []).flatMap((row) =>
    "toJSON" in row
      ? (row as ActionRowBuilder<ButtonBuilder>)
          .toJSON()
          .components.flatMap((component) =>
            "label" in component && typeof component.label === "string" ? [component.label] : [],
          )
      : [],
  );
};

test("active World Boss prompt trims long contribution sections without dropping the core status", () => {
  const prompt = buildWorldBossActivePrompt({
    participantIds: Array.from({ length: 40 }, (_, index) => `user-${index + 1}`),
    eligibleParticipantCount: 12,
    startedAtMs: 0,
    endsAtMs: 60_000,
    threadId: "thread-1",
    bossName: "Bone Dragon",
    bossLevel: 42,
    currentHp: 1234,
    maxHp: 5678,
    rewardSummary: "20 pips and x8 roll buff for the next 5 /rolls per eligible player",
    totalDamage: 4_444,
    totalAttacks: 120,
    contributionLines: Array.from(
      { length: 80 },
      (_, index) => `${index + 1}. <@user-${index + 1}> dealt ${"X".repeat(80)}`,
    ),
  });

  const description = getEmbedDescription(prompt.embeds?.[0]);
  assert.ok(description);
  assert.ok(description.length <= 4_096);
  assert.match(description, /HP: \*\*1234\/5678\*\*/);
  assert.match(description, /Base reward on success:/);
});

test("resolved World Boss prompt trims long leaderboards without dropping the outcome summary", () => {
  const prompt = buildWorldBossResolvedPrompt({
    participantIds: Array.from({ length: 30 }, (_, index) => `user-${index + 1}`),
    eligibleParticipantCount: 10,
    resolvedAtMs: 120_000,
    outcome: "success",
    bossName: "Bone Dragon",
    bossLevel: 42,
    maxHp: 5678,
    rewardSummary: "20 pips and x8 roll buff for the next 5 /rolls per eligible player",
    doubleRollRushChannelId: "roll-paradise-channel",
    doubleRollRushEndsAtMs: 180_000,
    contributionLines: Array.from(
      { length: 80 },
      (_, index) => `${index + 1}. <@user-${index + 1}> dealt ${"Y".repeat(80)}`,
    ),
  });

  const description = getEmbedDescription(prompt.embeds?.[0]);
  assert.ok(description);
  assert.ok(description.length <= 4_096);
  assert.match(description, /The boss was defeated in time\./);
  assert.match(description, /Reward applied to 10 eligible players/);
  assert.match(description, /Roll Paradise is live in <#roll-paradise-channel>/);
});

test("active World Boss prompt omits the damage leaders section when no damage has been logged yet", () => {
  const prompt = buildWorldBossActivePrompt({
    participantIds: ["user-1"],
    eligibleParticipantCount: 1,
    startedAtMs: 0,
    endsAtMs: 60_000,
    threadId: "thread-1",
    bossName: "Bone Dragon",
    bossLevel: 42,
    currentHp: 5678,
    maxHp: 5678,
    rewardSummary: "20 pips",
    totalDamage: 0,
    totalAttacks: 0,
    contributionLines: [],
  });

  const description = getEmbedDescription(prompt.embeds?.[0]);
  assert.ok(description);
  assert.doesNotMatch(description, /\*\*Damage leaders\*\*/);
  assert.doesNotMatch(description, /No damage logged yet\./);
});

test("World Boss announcement prompt renders join and leave signup buttons", () => {
  const prompt = buildWorldBossAnnouncementPrompt({
    worldBossId: "world-boss-1",
    participantIds: ["user-1"],
    scheduledStartAtMs: 60_000,
  });

  assert.deepEqual(getButtonLabels(prompt), ["Join World Boss", "Leave World Boss"]);
});
