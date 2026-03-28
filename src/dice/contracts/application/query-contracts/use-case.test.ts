import assert from "node:assert/strict";
import test from "node:test";

import { createQueryContractsUseCase } from "./use-case";
import type { ContractProgress } from "../../domain/progress";
import { contractFromData } from "../../domain/types";

const makeContract = (
  cadence: "daily" | "weekly",
  id: string,
  overrides: Partial<{
    title: string;
    description: string;
    requiredCount: number;
    rewardPips: number;
    rewardFame: number;
  }> = {},
) =>
  contractFromData(cadence, {
    id,
    title: overrides.title ?? `${cadence} ${id}`,
    description: overrides.description ?? `Finish ${id}.`,
    objective: {
      type: cadence === "weekly" ? "world_boss_join_count" : "roll_count",
      requiredCount: overrides.requiredCount ?? 5,
    },
    reward: {
      pips: overrides.rewardPips ?? 10,
      fame: overrides.rewardFame ?? 0,
    },
  });

const createHarness = ({
  dailyContracts = [makeContract("daily", "daily-roll")],
  weeklyContracts = [makeContract("weekly", "weekly-boss")],
  progress = new Map<string, ContractProgress>(),
}: {
  dailyContracts?: ReturnType<typeof makeContract>[];
  weeklyContracts?: ReturnType<typeof makeContract>[];
  progress?: Map<string, ContractProgress>;
} = {}) => {
  const useCase = createQueryContractsUseCase({
    rotationResolver: {
      resolveActiveRotation: () => ({
        daily: {
          cadence: "daily",
          periodKey: "2026-03-28",
          contracts: dailyContracts,
        },
        weekly: {
          cadence: "weekly",
          periodKey: "2026-03-23",
          contracts: weeklyContracts,
        },
      }),
    },
    progressRepository: {
      getProgress: (userId, contractId, cadence, periodKey) =>
        progress.get([userId, contractId, cadence, periodKey].join("|")) ?? null,
    },
  });

  return { useCase, progress };
};

test("contracts reply shows empty daily and weekly states", () => {
  const { useCase } = createHarness({
    dailyContracts: [],
    weeklyContracts: [],
  });

  const result = useCase.createContractsReply({
    userId: "user-1",
    userMention: "<@user-1>",
    now: new Date("2026-03-28T12:00:00.000Z"),
  });

  assert.equal(result.ephemeral, false);
  assert.match(result.content, /\*\*Daily Contracts\*\*/);
  assert.match(result.content, /\*\*Weekly Contracts\*\*/);
  assert.match(result.content, /No active contracts right now\./);
});

test("contracts reply shows partial progress", () => {
  const daily = makeContract("daily", "daily-roll", {
    title: "Daily Roll Sprint",
    description: "Use /roll 12 times.",
    requiredCount: 12,
    rewardPips: 18,
  });
  const weekly = makeContract("weekly", "weekly-boss", {
    title: "World Boss Crew",
    description: "Join 3 World Boss encounters.",
    requiredCount: 3,
    rewardPips: 20,
    rewardFame: 25,
  });
  const progress = new Map<string, ContractProgress>([
    [
      "user-1|daily-roll|daily|2026-03-28",
      {
        contractId: daily.id,
        cadence: "daily",
        objectiveType: daily.objective.type,
        requiredCount: 12,
        currentCount: 4,
        reward: daily.reward,
      },
    ],
  ]);

  const { useCase } = createHarness({
    dailyContracts: [daily],
    weeklyContracts: [weekly],
    progress,
  });
  const result = useCase.createContractsReply({
    userId: "user-1",
    userMention: "<@user-1>",
    now: new Date("2026-03-28T12:00:00.000Z"),
  });

  assert.match(result.content, /Daily Roll Sprint/);
  assert.match(result.content, /Progress: 4\/12 \| Reward: 18 Pips \| Status: In progress/);
  assert.match(result.content, /World Boss Crew/);
  assert.match(
    result.content,
    /Progress: 0\/3 \| Reward: 20 Pips \+ 25 Fame \| Status: Not started/,
  );
});

test("contracts reply shows completed and auto-claimed state", () => {
  const weekly = makeContract("weekly", "weekly-boss", {
    title: "World Boss Crew",
    description: "Join 3 World Boss encounters.",
    requiredCount: 3,
    rewardPips: 20,
    rewardFame: 25,
  });
  const progress = new Map<string, ContractProgress>([
    [
      "user-1|weekly-boss|weekly|2026-03-23",
      {
        contractId: weekly.id,
        cadence: "weekly",
        objectiveType: weekly.objective.type,
        requiredCount: 3,
        currentCount: 3,
        completedAt: new Date("2026-03-25T10:00:00.000Z"),
        rewardedAt: new Date("2026-03-25T10:00:00.000Z"),
        reward: weekly.reward,
      },
    ],
  ]);

  const { useCase } = createHarness({
    weeklyContracts: [weekly],
    progress,
  });
  const result = useCase.createContractsReply({
    userId: "user-1",
    userMention: "<@user-1>",
    now: new Date("2026-03-28T12:00:00.000Z"),
  });

  assert.match(
    result.content,
    /Progress: 3\/3 \| Reward: 20 Pips \+ 25 Fame \| Status: Auto-claimed/,
  );
});

test("contracts reply resets progress after a new period starts", () => {
  const daily = makeContract("daily", "daily-roll", {
    title: "Daily Roll Sprint",
    description: "Use /roll 12 times.",
    requiredCount: 12,
    rewardPips: 18,
  });
  const progress = new Map<string, ContractProgress>([
    [
      "user-1|daily-roll|daily|2026-03-27",
      {
        contractId: daily.id,
        cadence: "daily",
        objectiveType: daily.objective.type,
        requiredCount: 12,
        currentCount: 12,
        completedAt: new Date("2026-03-27T20:00:00.000Z"),
        rewardedAt: new Date("2026-03-27T20:00:00.000Z"),
        reward: daily.reward,
      },
    ],
  ]);

  const useCase = createQueryContractsUseCase({
    rotationResolver: {
      resolveActiveRotation: () => ({
        daily: {
          cadence: "daily",
          periodKey: "2026-03-28",
          contracts: [daily],
        },
        weekly: {
          cadence: "weekly",
          periodKey: "2026-03-23",
          contracts: [],
        },
      }),
    },
    progressRepository: {
      getProgress: (userId, contractId, cadence, periodKey) =>
        progress.get([userId, contractId, cadence, periodKey].join("|")) ?? null,
    },
  });

  const result = useCase.createContractsReply({
    userId: "user-1",
    userMention: "<@user-1>",
    now: new Date("2026-03-28T12:00:00.000Z"),
  });

  assert.match(result.content, /Progress: 0\/12 \| Reward: 18 Pips \| Status: Not started/);
  assert.match(result.content, /Resets <t:\d+:R> \(<t:\d+:f>\)/);
});

test("contracts reply trims oversized content to Discord limits", () => {
  const longTitle = "Longest Contract Title ".repeat(12).trim();
  const longDescription = "This description is intentionally very long. ".repeat(80).trim();
  const dailyContracts = [
    makeContract("daily", "daily-1", { title: longTitle, description: longDescription }),
    makeContract("daily", "daily-2", { title: longTitle, description: longDescription }),
    makeContract("daily", "daily-3", { title: longTitle, description: longDescription }),
  ];
  const weeklyContracts = [
    makeContract("weekly", "weekly-1", { title: longTitle, description: longDescription }),
    makeContract("weekly", "weekly-2", { title: longTitle, description: longDescription }),
  ];
  const { useCase } = createHarness({
    dailyContracts,
    weeklyContracts,
  });

  const result = useCase.createContractsReply({
    userId: "user-1",
    userMention: "<@user-1>",
    now: new Date("2026-03-28T12:00:00.000Z"),
  });

  assert.ok(result.content.length <= 2_000);
  assert.match(result.content, /\*\*Daily Contracts\*\*/);
  assert.match(result.content, /\*\*Weekly Contracts\*\*/);
});

test("contracts reply shows unavailable state when contracts are disabled", () => {
  const useCase = createQueryContractsUseCase({
    rotationResolver: null,
    progressRepository: null,
  });

  const result = useCase.createContractsReply({
    userId: "user-1",
  });

  assert.match(result.content, /Contracts are currently unavailable/);
});
