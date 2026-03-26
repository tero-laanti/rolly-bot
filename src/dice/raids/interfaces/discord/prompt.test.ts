import assert from "node:assert/strict";
import test from "node:test";
import type { APIEmbed, JSONEncodable } from "discord.js";
import { buildRaidActivePrompt, buildRaidResolvedPrompt } from "./prompt";

const getEmbedDescription = (embed: APIEmbed | JSONEncodable<APIEmbed> | undefined) => {
  if (!embed) {
    return undefined;
  }

  return "toJSON" in embed ? embed.toJSON().description : embed.description;
};

test("active raid prompt trims long contribution sections without dropping the core raid status", () => {
  const prompt = buildRaidActivePrompt({
    participantIds: Array.from({ length: 40 }, (_, index) => `user-${index + 1}`),
    eligibleParticipantCount: 12,
    startedAtMs: 0,
    endsAtMs: 60_000,
    threadId: "thread-1",
    bossName: "Bone Dragon",
    bossLevel: 42,
    currentHp: 1234,
    maxHp: 5678,
    rewardSummary: "20 pips and x8 roll buff for the next 5 /rolls per eligible raider",
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
  assert.match(description, /Reward on success:/);
});

test("resolved raid prompt trims long leaderboards without dropping the outcome summary", () => {
  const prompt = buildRaidResolvedPrompt({
    participantIds: Array.from({ length: 30 }, (_, index) => `user-${index + 1}`),
    eligibleParticipantCount: 10,
    resolvedAtMs: 120_000,
    outcome: "success",
    bossName: "Bone Dragon",
    bossLevel: 42,
    maxHp: 5678,
    rewardSummary: "20 pips and x8 roll buff for the next 5 /rolls per eligible raider",
    contributionLines: Array.from(
      { length: 80 },
      (_, index) => `${index + 1}. <@user-${index + 1}> dealt ${"Y".repeat(80)}`,
    ),
  });

  const description = getEmbedDescription(prompt.embeds?.[0]);
  assert.ok(description);
  assert.ok(description.length <= 4_096);
  assert.match(description, /The boss was defeated in time\./);
  assert.match(description, /Reward applied to 10 eligible raiders/);
});
