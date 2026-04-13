import assert from "node:assert/strict";
import test from "node:test";
import { hourMs } from "../../../shared/time";
import { createDiceHostileEffectsService } from "./hostile-effects-service";

test("negative-effect shield shaves one hour off lockouts by default", () => {
  const setCalls: Array<{ userId: string; lockoutUntil: string | null | undefined }> = [];
  const service = createDiceHostileEffectsService({
    progression: {
      applyDiceTemporaryEffect: () => {
        throw new Error("applyDiceTemporaryEffect should not be called.");
      },
      consumeOldestEffectChargeByCode: () => true,
      getActiveDiceTemporaryEffects: () => [
        {
          id: "shield-1",
          userId: "user-1",
          effectCode: "negative-effect-shield",
          kind: "positive",
          source: "item:bad-luck-umbrella",
          magnitude: 1,
          remainingRolls: 1,
          expiresAt: null,
          consumeOnCommand: "none",
          stackGroup: "negative-effect-shield",
          createdAt: "2026-01-01T11:59:00.000Z",
          updatedAt: "2026-01-01T11:59:00.000Z",
        },
      ],
    },
    pvp: {
      getActiveDiceLockout: () => null,
      setDicePvpEffects: ({ userId, lockoutUntil }) => {
        setCalls.push({ userId, lockoutUntil });
      },
    },
    unitOfWork: {
      runInTransaction: (work) => work(),
    },
  });

  const nowMs = Date.UTC(2026, 0, 1, 12, 0, 0);
  const result = service.applyShieldableNegativeLockout({
    userId: "user-1",
    durationMs: 3 * hourMs,
    nowMs,
  });

  assert.equal(result.blockedByShield, false);
  assert.equal(result.applied, true);
  assert.equal(result.shieldReductionMs, hourMs);
  assert.equal(result.lockoutUntilMs, nowMs + 2 * hourMs);
  assert.deepEqual(setCalls, [
    {
      userId: "user-1",
      lockoutUntil: new Date(nowMs + 2 * hourMs).toISOString(),
    },
  ]);
});

test("double-strength umbrella shield shaves two hours off lockouts", () => {
  const setCalls: Array<{ userId: string; lockoutUntil: string | null | undefined }> = [];
  const nowMs = Date.UTC(2026, 0, 1, 12, 0, 0);
  const service = createDiceHostileEffectsService({
    progression: {
      applyDiceTemporaryEffect: () => {
        throw new Error("applyDiceTemporaryEffect should not be called.");
      },
      consumeOldestEffectChargeByCode: () => true,
      getActiveDiceTemporaryEffects: () => [
        {
          id: "shield-boosted",
          userId: "user-1",
          effectCode: "negative-effect-shield",
          kind: "positive",
          source: "item:bad-luck-umbrella",
          magnitude: 2,
          remainingRolls: 1,
          expiresAt: null,
          consumeOnCommand: "none",
          stackGroup: "negative-effect-shield",
          createdAt: "2026-01-01T11:59:00.000Z",
          updatedAt: "2026-01-01T11:59:00.000Z",
        },
      ],
    },
    pvp: {
      getActiveDiceLockout: () => null,
      setDicePvpEffects: ({ userId, lockoutUntil }) => {
        setCalls.push({ userId, lockoutUntil });
      },
    },
    unitOfWork: {
      runInTransaction: (work) => work(),
    },
  });

  const result = service.applyShieldableNegativeLockout({
    userId: "user-1",
    durationMs: 3 * hourMs,
    nowMs,
  });

  assert.equal(result.blockedByShield, false);
  assert.equal(result.applied, true);
  assert.equal(result.shieldReductionMs, 2 * hourMs);
  assert.equal(result.lockoutUntilMs, nowMs + hourMs);
  assert.deepEqual(setCalls, [
    {
      userId: "user-1",
      lockoutUntil: new Date(nowMs + hourMs).toISOString(),
    },
  ]);
});

test("negative-effect shield can still fully block short lockouts", () => {
  let setCalled = false;
  const service = createDiceHostileEffectsService({
    progression: {
      applyDiceTemporaryEffect: () => {
        throw new Error("applyDiceTemporaryEffect should not be called.");
      },
      consumeOldestEffectChargeByCode: () => true,
      getActiveDiceTemporaryEffects: () => [],
    },
    pvp: {
      getActiveDiceLockout: () => null,
      setDicePvpEffects: () => {
        setCalled = true;
      },
    },
    unitOfWork: {
      runInTransaction: (work) => work(),
    },
  });

  const result = service.applyShieldableNegativeLockout({
    userId: "user-1",
    durationMs: 30 * 60 * 1000,
    nowMs: Date.UTC(2026, 0, 1, 12, 0, 0),
  });

  assert.equal(result.blockedByShield, true);
  assert.equal(result.applied, false);
  assert.equal(result.lockoutUntilMs, null);
  assert.equal(result.shieldReductionMs, 30 * 60 * 1000);
  assert.equal(setCalled, false);
});

test("negative-effect shield marks lockout as blocked when reduction prevents any extension", () => {
  let setCalled = false;
  const nowMs = Date.UTC(2026, 0, 1, 12, 0, 0);
  const service = createDiceHostileEffectsService({
    progression: {
      applyDiceTemporaryEffect: () => {
        throw new Error("applyDiceTemporaryEffect should not be called.");
      },
      consumeOldestEffectChargeByCode: () => true,
      getActiveDiceTemporaryEffects: () => [],
    },
    pvp: {
      getActiveDiceLockout: () => nowMs + 2 * hourMs,
      setDicePvpEffects: () => {
        setCalled = true;
      },
    },
    unitOfWork: {
      runInTransaction: (work) => work(),
    },
  });

  const result = service.applyShieldableNegativeLockout({
    userId: "user-1",
    durationMs: 3 * hourMs,
    nowMs,
  });

  assert.equal(result.blockedByShield, true);
  assert.equal(result.applied, false);
  assert.equal(result.shieldReductionMs, hourMs);
  assert.equal(result.lockoutUntilMs, nowMs + 2 * hourMs);
  assert.equal(setCalled, false);
});
