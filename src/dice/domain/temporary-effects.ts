import { randomUUID } from "node:crypto";
import type { SqliteDatabase } from "../../shared/db";

export type DiceTemporaryEffectKind = "positive" | "negative";
export type DiceTemporaryEffectStackMode = "stack" | "refresh" | "replace" | "no-stack";
export type DiceTemporaryEffectConsumeOnCommand = "dice" | "any" | "none";

export type DiceTemporaryEffect = {
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
  createdAt: string;
  updatedAt: string;
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

export type ApplyDiceTemporaryEffectInput = {
  userId: string;
  effectCode: string;
  kind: DiceTemporaryEffectKind;
  source: string;
  magnitude?: number;
  remainingRolls?: number | null;
  expiresAt?: string | null;
  consumeOnCommand?: DiceTemporaryEffectConsumeOnCommand;
  stackGroup?: string;
  stackMode?: DiceTemporaryEffectStackMode;
};

export type GetActiveDiceTemporaryEffectsInput = {
  userId: string;
  nowMs?: number;
  commandName?: string;
};

export type ConsumeDiceTemporaryEffectsForRollInput = {
  userId: string;
  commandName: string;
  rollsConsumed?: number;
  nowMs?: number;
  effectCodes?: string[];
};

export type DiceTemporaryEffectsRollSummary = {
  multiplier: number;
  divisor: number;
  effectiveFactor: number;
  hasApplicableEffects: boolean;
  hasPositiveRollEffects: boolean;
  hasNegativeRollEffects: boolean;
};

const maxEffectMagnitude = 10_000;

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

const getNowIso = (): string => {
  return new Date().toISOString();
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

const commandConsumeClause = "(consume_on_command = @commandName OR consume_on_command = 'any')";

export const purgeExpiredDiceTemporaryEffects = (
  db: SqliteDatabase,
  nowMs: number = Date.now(),
): number => {
  const nowIso = new Date(nowMs).toISOString();
  const result = db
    .prepare(
      `
      DELETE FROM dice_temporary_effects
      WHERE
        (expires_at IS NOT NULL AND expires_at <= @nowIso)
        OR
        (remaining_rolls IS NOT NULL AND remaining_rolls <= 0)
    `,
    )
    .run({ nowIso });

  return result.changes;
};

export const getActiveDiceTemporaryEffects = (
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

export const applyDiceTemporaryEffect = (
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
  const nowIso = getNowIso();
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

    return {
      ...mapDiceTemporaryEffectRow({
        ...existingRow,
        effect_code: effectCode,
        kind,
        source,
        magnitude: mergedMagnitude,
        remaining_rolls: mergedRemainingRolls,
        expires_at: mergedExpiresAt,
        consume_on_command: consumeOnCommand,
        updated_at: nowIso,
      }),
    };
  })();
};

export const consumeDiceTemporaryEffectsForRoll = (
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
      // Skip any rows that don't match requested effect codes
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

export const getRollPassMultiplierFromTemporaryEffects = (
  db: SqliteDatabase,
  userId: string,
  nowMs: number = Date.now(),
): DiceTemporaryEffectsRollSummary => {
  const effects = getActiveDiceTemporaryEffects(db, {
    userId,
    nowMs,
    commandName: "dice",
  });

  let multiplier = 1;
  let divisor = 1;
  let hasApplicableEffects = false;
  let hasPositiveRollEffects = false;
  let hasNegativeRollEffects = false;

  for (const effect of effects) {
    if (effect.effectCode === "roll-pass-multiplier" && effect.kind === "positive") {
      multiplier *= Math.max(1, effect.magnitude);
      hasApplicableEffects = true;
      hasPositiveRollEffects = true;
      continue;
    }

    if (effect.effectCode === "roll-pass-divisor" && effect.kind === "negative") {
      divisor *= Math.max(1, effect.magnitude);
      hasApplicableEffects = true;
      hasNegativeRollEffects = true;
    }
  }

  const normalizedMultiplier = Math.max(1, Math.floor(multiplier));
  const normalizedDivisor = Math.max(1, Math.floor(divisor));
  return {
    multiplier: normalizedMultiplier,
    divisor: normalizedDivisor,
    effectiveFactor: normalizedMultiplier / normalizedDivisor,
    hasApplicableEffects,
    hasPositiveRollEffects,
    hasNegativeRollEffects,
  };
};
