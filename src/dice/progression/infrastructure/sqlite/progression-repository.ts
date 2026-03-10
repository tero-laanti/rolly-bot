import { randomUUID } from "node:crypto";
import type { SqliteDatabase } from "../../../../shared/db";
import type { DiceProgressionRepository } from "../../application/ports";
import {
  awardAchievements,
  clearUserDiceAchievements,
  getUserDiceAchievements,
} from "../../domain/achievements-store";
import {
  clearDiceBan,
  clearSingleDiceBan,
  clearUserDiceBans,
  getDiceBans,
  setDiceBan,
} from "../../domain/bans";
import { getLastDiceRollAt, setLastDiceRollAt } from "../../domain/charge";
import {
  getDicePrestigeBaseLevel,
  getDiceSidesForPrestige,
  getMaxDicePrestige,
} from "../../domain/game-rules";
import type {
  ApplyDiceTemporaryEffectInput,
  ConsumeDiceTemporaryEffectsForRollInput,
  DiceTemporaryEffect,
  DiceTemporaryEffectConsumeOnCommand,
  DiceTemporaryEffectKind,
  GetActiveDiceTemporaryEffectsInput,
} from "../../domain/temporary-effects";

type DiceLevelUpdate = {
  userId: string;
  level: number;
};

type DiceLevelByPrestigeUpdate = {
  userId: string;
  prestige: number;
  level: number;
};

type DicePrestigeUpdate = {
  userId: string;
  prestige: number;
};

type DiceTemporaryEffectRow = {
  id: string;
  user_id: string;
  effect_code: string;
  kind: DiceTemporaryEffectKind;
  source: string;
  magnitude: number;
  remaining_rolls: number | null;
  expires_at: string | null;
  consume_on_command: DiceTemporaryEffectConsumeOnCommand;
  stack_group: string;
  created_at: string;
  updated_at: string;
};

const maxEffectMagnitude = 10_000;
const commandConsumeClause = "(consume_on_command = @commandName OR consume_on_command = 'any')";

const normalizePrestige = (prestige: number): number => {
  return Math.min(getMaxDicePrestige(), Math.max(0, Math.floor(prestige)));
};

const normalizeActivePrestige = (prestige: number, highestPrestige: number): number => {
  return Math.min(normalizePrestige(highestPrestige), normalizePrestige(prestige));
};

const normalizeLevel = (level: number): number => {
  return Math.max(1, Math.floor(level));
};

const normalizeMagnitude = (magnitude: number | undefined): number => {
  if (magnitude === undefined) {
    return 1;
  }

  return Math.max(1, Math.min(maxEffectMagnitude, Math.floor(magnitude)));
};

const normalizeRemainingRolls = (remainingRolls: number | null | undefined): number | null => {
  if (remainingRolls === null || remainingRolls === undefined) {
    return null;
  }

  return Math.max(0, Math.floor(remainingRolls));
};

const toIsoOrNull = (value: string | null | undefined): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  const parsedMs = Date.parse(value);
  if (Number.isNaN(parsedMs)) {
    return null;
  }

  return new Date(parsedMs).toISOString();
};

const pickLaterIso = (firstIso: string | null, secondIso: string | null): string | null => {
  if (firstIso === null || secondIso === null) {
    return null;
  }

  return firstIso >= secondIso ? firstIso : secondIso;
};

const pickHigherNumberOrNull = (first: number | null, second: number | null): number | null => {
  if (first === null || second === null) {
    return null;
  }

  return Math.max(first, second);
};

const mapDiceTemporaryEffectRow = (row: DiceTemporaryEffectRow): DiceTemporaryEffect => {
  return {
    id: row.id,
    userId: row.user_id,
    effectCode: row.effect_code,
    kind: row.kind,
    source: row.source,
    magnitude: row.magnitude,
    remainingRolls: row.remaining_rolls,
    expiresAt: row.expires_at,
    consumeOnCommand: row.consume_on_command,
    stackGroup: row.stack_group,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

const getDicePrestige = (db: SqliteDatabase, userId: string): number => {
  const row = db.prepare("SELECT prestige FROM dice_prestige WHERE user_id = ?").get(userId) as
    | { prestige: number }
    | undefined;

  return normalizePrestige(row?.prestige ?? 0);
};

const setDicePrestige = (
  db: SqliteDatabase,
  { userId, prestige }: DicePrestigeUpdate,
): void => {
  const updatedAt = new Date().toISOString();

  db.prepare(
    `
    INSERT INTO dice_prestige (user_id, prestige, updated_at)
    VALUES (@userId, @prestige, @updatedAt)
    ON CONFLICT(user_id)
    DO UPDATE SET prestige = excluded.prestige, updated_at = excluded.updated_at
  `,
  ).run({
    userId,
    prestige: normalizePrestige(prestige),
    updatedAt,
  });
};

const getActiveDicePrestige = (db: SqliteDatabase, userId: string): number => {
  const highestPrestige = getDicePrestige(db, userId);
  const row = db
    .prepare("SELECT prestige FROM dice_active_prestige WHERE user_id = ?")
    .get(userId) as { prestige: number } | undefined;

  if (!row) {
    return highestPrestige;
  }

  const normalizedActive = normalizeActivePrestige(row.prestige, highestPrestige);
  if (normalizedActive !== row.prestige) {
    setActiveDicePrestige(db, { userId, prestige: normalizedActive });
  }

  return normalizedActive;
};

const setActiveDicePrestige = (
  db: SqliteDatabase,
  { userId, prestige }: DicePrestigeUpdate,
): void => {
  const highestPrestige = getDicePrestige(db, userId);
  const updatedAt = new Date().toISOString();

  db.prepare(
    `
    INSERT INTO dice_active_prestige (user_id, prestige, updated_at)
    VALUES (@userId, @prestige, @updatedAt)
    ON CONFLICT(user_id)
    DO UPDATE SET prestige = excluded.prestige, updated_at = excluded.updated_at
  `,
  ).run({
    userId,
    prestige: normalizeActivePrestige(prestige, highestPrestige),
    updatedAt,
  });
};

const getDiceLevelForPrestige = (
  db: SqliteDatabase,
  userId: string,
  prestige: number,
): number => {
  const normalizedPrestige = normalizePrestige(prestige);
  const highestPrestige = getDicePrestige(db, userId);
  const row = db
    .prepare("SELECT level FROM dice_levels_by_prestige WHERE user_id = ? AND prestige = ?")
    .get(userId, normalizedPrestige) as { level: number } | undefined;
  if (row) {
    const normalizedValue = normalizeLevel(row.level);
    if (normalizedPrestige < highestPrestige && normalizedValue < getDicePrestigeBaseLevel()) {
      setDiceLevelForPrestige(db, {
        userId,
        prestige: normalizedPrestige,
        level: getDicePrestigeBaseLevel(),
      });
      return getDicePrestigeBaseLevel();
    }

    return normalizedValue;
  }

  const initialLevel = normalizedPrestige === highestPrestige ? 1 : getDicePrestigeBaseLevel();
  setDiceLevelForPrestige(db, {
    userId,
    prestige: normalizedPrestige,
    level: initialLevel,
  });
  return initialLevel;
};

const getDiceLevel = (db: SqliteDatabase, userId: string): number => {
  return getDiceLevelForPrestige(db, userId, getActiveDicePrestige(db, userId));
};

const setDiceLevelForPrestige = (
  db: SqliteDatabase,
  { userId, prestige, level }: DiceLevelByPrestigeUpdate,
): void => {
  const updatedAt = new Date().toISOString();

  db.prepare(
    `
    INSERT INTO dice_levels_by_prestige (user_id, prestige, level, updated_at)
    VALUES (@userId, @prestige, @level, @updatedAt)
    ON CONFLICT(user_id, prestige)
    DO UPDATE SET level = excluded.level, updated_at = excluded.updated_at
  `,
  ).run({
    userId,
    prestige: normalizePrestige(prestige),
    level: normalizeLevel(level),
    updatedAt,
  });
};

const setDiceLevel = (
  db: SqliteDatabase,
  { userId, level }: DiceLevelUpdate,
): void => {
  setDiceLevelForPrestige(db, {
    userId,
    prestige: getActiveDicePrestige(db, userId),
    level,
  });
};

const isOnHighestDicePrestige = (db: SqliteDatabase, userId: string): boolean => {
  return getActiveDicePrestige(db, userId) === getDicePrestige(db, userId);
};

const getDiceSides = (db: SqliteDatabase, userId: string): number => {
  return getDiceSidesForPrestige(getActiveDicePrestige(db, userId));
};

const purgeExpiredDiceTemporaryEffects = (
  db: SqliteDatabase,
  nowMs: number = Date.now(),
): number => {
  const nowIso = new Date(nowMs).toISOString();
  return db
    .prepare(
      `
      DELETE FROM dice_temporary_effects
      WHERE
        (expires_at IS NOT NULL AND expires_at <= @nowIso)
        OR
        (remaining_rolls IS NOT NULL AND remaining_rolls <= 0)
    `,
    )
    .run({ nowIso }).changes;
};

const getActiveDiceTemporaryEffects = (
  db: SqliteDatabase,
  { userId, nowMs = Date.now(), commandName }: GetActiveDiceTemporaryEffectsInput,
): DiceTemporaryEffect[] => {
  purgeExpiredDiceTemporaryEffects(db, nowMs);

  const nowIso = new Date(nowMs).toISOString();
  const rows =
    typeof commandName === "string" && commandName.length > 0
      ? (db
          .prepare(
            `
            SELECT
              id,
              user_id,
              effect_code,
              kind,
              source,
              magnitude,
              remaining_rolls,
              expires_at,
              consume_on_command,
              stack_group,
              created_at,
              updated_at
            FROM dice_temporary_effects
            WHERE user_id = @userId
              AND (expires_at IS NULL OR expires_at > @nowIso)
              AND (remaining_rolls IS NULL OR remaining_rolls > 0)
              AND ${commandConsumeClause}
            ORDER BY created_at ASC
          `,
          )
          .all({ userId, nowIso, commandName }) as DiceTemporaryEffectRow[])
      : (db
          .prepare(
            `
            SELECT
              id,
              user_id,
              effect_code,
              kind,
              source,
              magnitude,
              remaining_rolls,
              expires_at,
              consume_on_command,
              stack_group,
              created_at,
              updated_at
            FROM dice_temporary_effects
            WHERE user_id = @userId
              AND (expires_at IS NULL OR expires_at > @nowIso)
              AND (remaining_rolls IS NULL OR remaining_rolls > 0)
            ORDER BY created_at ASC
          `,
          )
          .all({ userId, nowIso }) as DiceTemporaryEffectRow[]);

  return rows.map(mapDiceTemporaryEffectRow);
};

const insertDiceTemporaryEffect = (
  db: SqliteDatabase,
  input: {
    id: string;
    userId: string;
    effectCode: string;
    kind: DiceTemporaryEffectKind;
    source: string;
    magnitude: number;
    remainingRolls: number | null;
    expiresAt: string | null;
    consumeOnCommand: DiceTemporaryEffectConsumeOnCommand;
    stackGroup: string;
    nowIso: string;
  },
): DiceTemporaryEffect => {
  db.prepare(
    `
    INSERT INTO dice_temporary_effects (
      id,
      user_id,
      effect_code,
      kind,
      source,
      magnitude,
      remaining_rolls,
      expires_at,
      consume_on_command,
      stack_group,
      created_at,
      updated_at
    )
    VALUES (
      @id,
      @userId,
      @effectCode,
      @kind,
      @source,
      @magnitude,
      @remainingRolls,
      @expiresAt,
      @consumeOnCommand,
      @stackGroup,
      @nowIso,
      @nowIso
    )
  `,
  ).run(input);

  return {
    id: input.id,
    userId: input.userId,
    effectCode: input.effectCode,
    kind: input.kind,
    source: input.source,
    magnitude: input.magnitude,
    remainingRolls: input.remainingRolls,
    expiresAt: input.expiresAt,
    consumeOnCommand: input.consumeOnCommand,
    stackGroup: input.stackGroup,
    createdAt: input.nowIso,
    updatedAt: input.nowIso,
  };
};

const getActiveEffectByStackGroup = (
  db: SqliteDatabase,
  userId: string,
  stackGroup: string,
  nowIso: string,
): DiceTemporaryEffectRow | undefined => {
  return db
    .prepare(
      `
      SELECT
        id,
        user_id,
        effect_code,
        kind,
        source,
        magnitude,
        remaining_rolls,
        expires_at,
        consume_on_command,
        stack_group,
        created_at,
        updated_at
      FROM dice_temporary_effects
      WHERE user_id = @userId
        AND stack_group = @stackGroup
        AND (expires_at IS NULL OR expires_at > @nowIso)
        AND (remaining_rolls IS NULL OR remaining_rolls > 0)
      ORDER BY updated_at DESC
      LIMIT 1
    `,
    )
    .get({ userId, stackGroup, nowIso }) as DiceTemporaryEffectRow | undefined;
};

const applyDiceTemporaryEffect = (
  db: SqliteDatabase,
  {
    userId,
    effectCode,
    kind,
    source,
    magnitude,
    remainingRolls,
    expiresAt,
    consumeOnCommand = "dice",
    stackGroup,
    stackMode = "stack",
  }: ApplyDiceTemporaryEffectInput,
): DiceTemporaryEffect => {
  const nowIso = new Date().toISOString();
  const normalizedMagnitude = normalizeMagnitude(magnitude);
  const normalizedRemainingRolls = normalizeRemainingRolls(remainingRolls);
  const normalizedExpiresAt = toIsoOrNull(expiresAt);
  const normalizedStackGroup = stackGroup ?? effectCode;

  return db.transaction(() => {
    purgeExpiredDiceTemporaryEffects(db, Date.parse(nowIso));

    if (stackMode === "stack") {
      return insertDiceTemporaryEffect(db, {
        id: randomUUID(),
        userId,
        effectCode,
        kind,
        source,
        magnitude: normalizedMagnitude,
        remainingRolls: normalizedRemainingRolls,
        expiresAt: normalizedExpiresAt,
        consumeOnCommand,
        stackGroup: normalizedStackGroup,
        nowIso,
      });
    }

    const existingRow = getActiveEffectByStackGroup(db, userId, normalizedStackGroup, nowIso);
    if (!existingRow) {
      return insertDiceTemporaryEffect(db, {
        id: randomUUID(),
        userId,
        effectCode,
        kind,
        source,
        magnitude: normalizedMagnitude,
        remainingRolls: normalizedRemainingRolls,
        expiresAt: normalizedExpiresAt,
        consumeOnCommand,
        stackGroup: normalizedStackGroup,
        nowIso,
      });
    }

    if (stackMode === "no-stack") {
      return mapDiceTemporaryEffectRow(existingRow);
    }

    if (stackMode === "replace") {
      db.prepare(
        `
        DELETE FROM dice_temporary_effects
        WHERE user_id = @userId
          AND stack_group = @stackGroup
          AND (expires_at IS NULL OR expires_at > @nowIso)
          AND (remaining_rolls IS NULL OR remaining_rolls > 0)
      `,
      ).run({ userId, stackGroup: normalizedStackGroup, nowIso });

      return insertDiceTemporaryEffect(db, {
        id: randomUUID(),
        userId,
        effectCode,
        kind,
        source,
        magnitude: normalizedMagnitude,
        remainingRolls: normalizedRemainingRolls,
        expiresAt: normalizedExpiresAt,
        consumeOnCommand,
        stackGroup: normalizedStackGroup,
        nowIso,
      });
    }

    const mergedMagnitude = Math.max(existingRow.magnitude, normalizedMagnitude);
    const mergedRemainingRolls = pickHigherNumberOrNull(
      existingRow.remaining_rolls,
      normalizedRemainingRolls,
    );
    const mergedExpiresAt = pickLaterIso(existingRow.expires_at, normalizedExpiresAt);

    db.prepare(
      `
      UPDATE dice_temporary_effects
      SET
        effect_code = @effectCode,
        kind = @kind,
        source = @source,
        magnitude = @magnitude,
        remaining_rolls = @remainingRolls,
        expires_at = @expiresAt,
        consume_on_command = @consumeOnCommand,
        updated_at = @updatedAt
      WHERE id = @id
    `,
    ).run({
      id: existingRow.id,
      effectCode,
      kind,
      source,
      magnitude: mergedMagnitude,
      remainingRolls: mergedRemainingRolls,
      expiresAt: mergedExpiresAt,
      consumeOnCommand,
      updatedAt: nowIso,
    });

    return mapDiceTemporaryEffectRow({
      ...existingRow,
      effect_code: effectCode,
      kind,
      source,
      magnitude: mergedMagnitude,
      remaining_rolls: mergedRemainingRolls,
      expires_at: mergedExpiresAt,
      consume_on_command: consumeOnCommand,
      updated_at: nowIso,
    });
  })();
};

const consumeDiceTemporaryEffectsForRoll = (
  db: SqliteDatabase,
  {
    userId,
    commandName,
    rollsConsumed = 1,
    nowMs = Date.now(),
    effectCodes,
  }: ConsumeDiceTemporaryEffectsForRollInput,
): number => {
  const normalizedRollsConsumed = Math.max(1, Math.floor(rollsConsumed));
  const nowIso = new Date(nowMs).toISOString();
  const normalizedEffectCodes = Array.isArray(effectCodes)
    ? effectCodes.map((code) => code.trim()).filter((code) => code.length > 0)
    : [];

  return db.transaction(() => {
    purgeExpiredDiceTemporaryEffects(db, nowMs);

    const rows = db
      .prepare(
        `
        SELECT id, effect_code, remaining_rolls
        FROM dice_temporary_effects
        WHERE user_id = @userId
          AND remaining_rolls IS NOT NULL
          AND remaining_rolls > 0
          AND (expires_at IS NULL OR expires_at > @nowIso)
          AND ${commandConsumeClause}
      `,
      )
      .all({ userId, nowIso, commandName }) as {
      id: string;
      effect_code: string;
      remaining_rolls: number;
    }[];

    let consumedEffectsCount = 0;
    const effectFilterSet =
      normalizedEffectCodes.length > 0 ? new Set(normalizedEffectCodes) : null;

    for (const row of rows) {
      if (effectFilterSet && !effectFilterSet.has(row.effect_code)) {
        continue;
      }

      const nextRemaining = row.remaining_rolls - normalizedRollsConsumed;
      if (nextRemaining <= 0) {
        db.prepare("DELETE FROM dice_temporary_effects WHERE id = ?").run(row.id);
      } else {
        db.prepare(
          `
          UPDATE dice_temporary_effects
          SET remaining_rolls = @remainingRolls, updated_at = @updatedAt
          WHERE id = @id
        `,
        ).run({ id: row.id, remainingRolls: nextRemaining, updatedAt: nowIso });
      }

      consumedEffectsCount += 1;
    }

    return consumedEffectsCount;
  })();
};

const clearAllDiceTemporaryEffects = (db: SqliteDatabase, userId: string): number => {
  return db.prepare("DELETE FROM dice_temporary_effects WHERE user_id = ?").run(userId).changes;
};

const clearNegativeDiceTemporaryEffects = (
  db: SqliteDatabase,
  userId: string,
  nowMs: number = Date.now(),
): number => {
  const effects = getActiveDiceTemporaryEffects(db, {
    userId,
    nowMs,
  }).filter((effect) => effect.kind === "negative");
  if (effects.length < 1) {
    return 0;
  }

  for (const effect of effects) {
    db.prepare("DELETE FROM dice_temporary_effects WHERE id = ?").run(effect.id);
  }

  return effects.length;
};

const consumeOldestEffectChargeByCode = (
  db: SqliteDatabase,
  userId: string,
  effectCode: string,
  nowMs: number = Date.now(),
): boolean => {
  const effect = getActiveDiceTemporaryEffects(db, {
    userId,
    nowMs,
  }).find(
    (entry) =>
      entry.effectCode === effectCode &&
      typeof entry.remainingRolls === "number" &&
      entry.remainingRolls > 0,
  );
  if (!effect || effect.remainingRolls === null) {
    return false;
  }

  const nextRemainingRolls = effect.remainingRolls - 1;
  if (nextRemainingRolls <= 0) {
    db.prepare("DELETE FROM dice_temporary_effects WHERE id = ?").run(effect.id);
  } else {
    db.prepare(
      `
      UPDATE dice_temporary_effects
      SET remaining_rolls = @remainingRolls, updated_at = @updatedAt
      WHERE id = @id
    `,
    ).run({
      id: effect.id,
      remainingRolls: nextRemainingRolls,
      updatedAt: new Date(nowMs).toISOString(),
    });
  }

  return true;
};

export const createSqliteProgressionRepository = (
  db: SqliteDatabase,
): DiceProgressionRepository => {
  return {
    getDiceLevel: (userId) => getDiceLevel(db, userId),
    getDiceLevelForPrestige: (userId, prestige) => getDiceLevelForPrestige(db, userId, prestige),
    setDiceLevel: (update) => setDiceLevel(db, update),
    setDiceLevelForPrestige: (update) => setDiceLevelForPrestige(db, update),
    getDicePrestige: (userId) => getDicePrestige(db, userId),
    setDicePrestige: (update) => setDicePrestige(db, update),
    getActiveDicePrestige: (userId) => getActiveDicePrestige(db, userId),
    setActiveDicePrestige: (update) => setActiveDicePrestige(db, update),
    isOnHighestDicePrestige: (userId) => isOnHighestDicePrestige(db, userId),
    getDiceSides: (userId) => getDiceSides(db, userId),
    getDiceBans: (userId) => getDiceBans(db, userId),
    setDiceBan: (update) => setDiceBan(db, update),
    clearSingleDiceBan: (userId, dieIndex, bannedValue) =>
      clearSingleDiceBan(db, userId, dieIndex, bannedValue),
    clearDiceBan: (userId, dieIndex) => clearDiceBan(db, userId, dieIndex),
    clearUserDiceBans: (userId) => clearUserDiceBans(db, userId),
    getUserDiceAchievements: (userId) => getUserDiceAchievements(db, userId),
    awardAchievements: (userId, achievementIds) => awardAchievements(db, userId, achievementIds),
    clearUserDiceAchievements: (userId) => clearUserDiceAchievements(db, userId),
    getLastDiceRollAt: () => getLastDiceRollAt(db),
    setLastDiceRollAt: (nowMs) => setLastDiceRollAt(db, nowMs),
    purgeExpiredDiceTemporaryEffects: (nowMs) => purgeExpiredDiceTemporaryEffects(db, nowMs),
    getActiveDiceTemporaryEffects: (input) => getActiveDiceTemporaryEffects(db, input),
    applyDiceTemporaryEffect: (input) => applyDiceTemporaryEffect(db, input),
    consumeDiceTemporaryEffectsForRoll: (input) => consumeDiceTemporaryEffectsForRoll(db, input),
    clearAllDiceTemporaryEffects: (userId) => clearAllDiceTemporaryEffects(db, userId),
    clearNegativeDiceTemporaryEffects: (userId, nowMs) =>
      clearNegativeDiceTemporaryEffects(db, userId, nowMs),
    consumeOldestEffectChargeByCode: (userId, effectCode, nowMs) =>
      consumeOldestEffectChargeByCode(db, userId, effectCode, nowMs),
  };
};
