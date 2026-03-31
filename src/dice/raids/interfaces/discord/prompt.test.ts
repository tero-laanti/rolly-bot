import assert from "node:assert/strict";
import test from "node:test";
import type { APIEmbed, JSONEncodable } from "discord.js";
import { buildRaidEncounterPrompt, buildRaidResolvedPrompt } from "./prompt";

const getEmbedDescription = (embed: APIEmbed | JSONEncodable<APIEmbed> | undefined) => {
  if (!embed) {
    return undefined;
  }

  return "toJSON" in embed ? embed.toJSON().description : embed.description;
};

test("active raid prompt shows the clear reward summary", () => {
  const prompt = buildRaidEncounterPrompt({
    bossName: "Bone Drake",
    bossLevel: 8,
    encounterTitle: "Bone Drake",
    currentHp: 120,
    maxHp: 160,
    rewardSummary: "6 pips and x2 roll buff for the next 1 /roll per successful raider",
    participantIds: ["user-1", "user-2"],
    startsAtMs: 0,
    endsAtMs: 60_000,
  });

  const description = getEmbedDescription(prompt.embeds?.[0]);
  assert.ok(description);
  assert.match(description, /Clear reward:/);
  assert.match(description, /6 pips and x2 roll buff/);
});

test("resolved raid prompt includes granted rewards on success", () => {
  const prompt = buildRaidResolvedPrompt({
    bossName: "Bone Drake",
    bossLevel: 8,
    currentHp: 0,
    maxHp: 160,
    participantIds: ["user-1", "user-2"],
    rewardSummary: "6 pips and x2 roll buff for the next 1 /roll per successful raider",
    summary: "The Bone Drake collapses.",
    resolvedAtMs: 60_000,
    closeScheduledAtMs: 120_000,
  });

  const description = getEmbedDescription(prompt.embeds?.[0]);
  assert.ok(description);
  assert.match(description, /Rewards granted:/);
});

test("resolved raid prompt omits reward text on failure", () => {
  const prompt = buildRaidResolvedPrompt({
    bossName: "Bone Drake",
    bossLevel: 8,
    currentHp: 40,
    maxHp: 160,
    participantIds: ["user-1", "user-2"],
    rewardSummary: "6 pips and x2 roll buff for the next 1 /roll per successful raider",
    summary: "The Bone Drake escapes.",
    resolvedAtMs: 60_000,
    closeScheduledAtMs: 120_000,
  });

  const description = getEmbedDescription(prompt.embeds?.[0]);
  assert.ok(description);
  assert.doesNotMatch(description, /Rewards granted:/);
});
