import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { initializeDatabaseSchema } from "../../../../shared/db/schema";
import { createSqliteProgressionRepository } from "../../../progression/infrastructure/sqlite/progression-repository";
import { createSqliteAnalyticsRepository } from "./analytics-repository";

test("recordDiceRollAnalytics tracks lifetime totals and active-prestige counters", () => {
  const db = new Database(":memory:");
  initializeDatabaseSchema(db);
  const progression = createSqliteProgressionRepository(db);
  const analytics = createSqliteAnalyticsRepository(db);

  progression.setDicePrestige({ userId: "user-1", prestige: 2 });
  progression.setActiveDicePrestige({ userId: "user-1", prestige: 2 });
  progression.setDiceCountForPrestige({ userId: "user-1", prestige: 2, diceCount: 4 });

  analytics.recordDiceRollAnalytics({
    userId: "user-1",
    rollSetCount: 3,
    nearDiceCountIncreaseRollCount: 1,
    diceRolledCount: 12,
    rollCommandCount: 1,
  });

  assert.match(analytics.getDiceAnalytics("user-1").diceCountStartedAt, /T/);
  assert.match(analytics.getDiceAnalytics("user-1").prestigeStartedAt, /T/);
  assert.deepEqual(
    {
      rollSetsCurrentDiceCount: analytics.getDiceAnalytics("user-1").rollSetsCurrentDiceCount,
      nearDiceCountIncreaseRollSetsCurrentDiceCount:
        analytics.getDiceAnalytics("user-1").nearDiceCountIncreaseRollSetsCurrentDiceCount,
      diceRolledCurrentPrestige: analytics.getDiceAnalytics("user-1").diceRolledCurrentPrestige,
      totalDiceRolled: analytics.getDiceAnalytics("user-1").totalDiceRolled,
      totalDiceSetsRolled: analytics.getDiceAnalytics("user-1").totalDiceSetsRolled,
      totalRollCommandsCalled: analytics.getDiceAnalytics("user-1").totalRollCommandsCalled,
    },
    {
      rollSetsCurrentDiceCount: 3,
      nearDiceCountIncreaseRollSetsCurrentDiceCount: 1,
      diceRolledCurrentPrestige: 12,
      totalDiceRolled: 12,
      totalDiceSetsRolled: 3,
      totalRollCommandsCalled: 1,
    },
  );
});

test("active-prestige analytics rows persist independently across prestige switches", () => {
  const db = new Database(":memory:");
  initializeDatabaseSchema(db);
  const progression = createSqliteProgressionRepository(db);
  const analytics = createSqliteAnalyticsRepository(db);

  progression.setDicePrestige({ userId: "user-1", prestige: 2 });
  progression.setDiceCountForPrestige({ userId: "user-1", prestige: 1, diceCount: 8 });
  progression.setDiceCountForPrestige({ userId: "user-1", prestige: 2, diceCount: 3 });
  progression.setActiveDicePrestige({ userId: "user-1", prestige: 2 });

  analytics.recordDiceRollAnalytics({
    userId: "user-1",
    rollSetCount: 4,
    nearDiceCountIncreaseRollCount: 1,
    diceRolledCount: 16,
    rollCommandCount: 1,
  });

  progression.setActiveDicePrestige({ userId: "user-1", prestige: 1 });
  assert.deepEqual(
    {
      rollSetsCurrentDiceCount: analytics.getDiceAnalytics("user-1").rollSetsCurrentDiceCount,
      nearDiceCountIncreaseRollSetsCurrentDiceCount:
        analytics.getDiceAnalytics("user-1").nearDiceCountIncreaseRollSetsCurrentDiceCount,
      diceRolledCurrentPrestige: analytics.getDiceAnalytics("user-1").diceRolledCurrentPrestige,
    },
    {
      rollSetsCurrentDiceCount: 0,
      nearDiceCountIncreaseRollSetsCurrentDiceCount: 0,
      diceRolledCurrentPrestige: 0,
    },
  );

  analytics.recordDiceRollAnalytics({
    userId: "user-1",
    rollSetCount: 2,
    nearDiceCountIncreaseRollCount: 1,
    diceRolledCount: 10,
    rollCommandCount: 1,
  });

  progression.setActiveDicePrestige({ userId: "user-1", prestige: 2 });
  assert.deepEqual(
    {
      rollSetsCurrentDiceCount: analytics.getDiceAnalytics("user-1").rollSetsCurrentDiceCount,
      nearDiceCountIncreaseRollSetsCurrentDiceCount:
        analytics.getDiceAnalytics("user-1").nearDiceCountIncreaseRollSetsCurrentDiceCount,
      diceRolledCurrentPrestige: analytics.getDiceAnalytics("user-1").diceRolledCurrentPrestige,
      totalDiceRolled: analytics.getDiceAnalytics("user-1").totalDiceRolled,
      totalDiceSetsRolled: analytics.getDiceAnalytics("user-1").totalDiceSetsRolled,
      totalRollCommandsCalled: analytics.getDiceAnalytics("user-1").totalRollCommandsCalled,
    },
    {
      rollSetsCurrentDiceCount: 4,
      nearDiceCountIncreaseRollSetsCurrentDiceCount: 1,
      diceRolledCurrentPrestige: 16,
      totalDiceRolled: 26,
      totalDiceSetsRolled: 6,
      totalRollCommandsCalled: 2,
    },
  );

  progression.setActiveDicePrestige({ userId: "user-1", prestige: 1 });
  assert.deepEqual(
    {
      rollSetsCurrentDiceCount: analytics.getDiceAnalytics("user-1").rollSetsCurrentDiceCount,
      nearDiceCountIncreaseRollSetsCurrentDiceCount:
        analytics.getDiceAnalytics("user-1").nearDiceCountIncreaseRollSetsCurrentDiceCount,
      diceRolledCurrentPrestige: analytics.getDiceAnalytics("user-1").diceRolledCurrentPrestige,
    },
    {
      rollSetsCurrentDiceCount: 2,
      nearDiceCountIncreaseRollSetsCurrentDiceCount: 1,
      diceRolledCurrentPrestige: 10,
    },
  );
});
