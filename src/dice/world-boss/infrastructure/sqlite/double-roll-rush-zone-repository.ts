import type { SqliteDatabase } from "../../../../shared/db";

export type WorldBossDoubleRollRushZoneRecord = {
  rushId: string;
  sourceWorldBossId: string;
  parentChannelId: string;
  rushChannelId: string;
  kickoffMessageId: string;
  activatedAt: Date;
  expiresAt: Date;
  closedAt: Date | null;
  closeReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type WorldBossDoubleRollRushZoneRow = {
  rush_id: string;
  source_world_boss_id: string;
  parent_channel_id: string;
  rush_channel_id: string;
  kickoff_message_id: string;
  activated_at: string;
  expires_at: string;
  closed_at: string | null;
  close_reason: string | null;
  created_at: string;
  updated_at: string;
};

const cleanupPendingCloseReasonSuffix = ":cleanup-pending";
const cleanupCompleteCloseReasonSuffix = ":cleanup-complete";

const selectZoneColumns = `
  rush_id,
  source_world_boss_id,
  parent_channel_id,
  rush_channel_id,
  kickoff_message_id,
  activated_at,
  expires_at,
  closed_at,
  close_reason,
  created_at,
  updated_at
`;

const stripCleanupPendingCloseReason = (closeReason: string | null): string | null => {
  if (!closeReason) {
    return closeReason;
  }

  if (closeReason.endsWith(cleanupPendingCloseReasonSuffix)) {
    return closeReason.slice(0, -cleanupPendingCloseReasonSuffix.length);
  }

  if (closeReason.endsWith(cleanupCompleteCloseReasonSuffix)) {
    return closeReason.slice(0, -cleanupCompleteCloseReasonSuffix.length);
  }

  return closeReason;
};

const mapZoneRow = (row: WorldBossDoubleRollRushZoneRow): WorldBossDoubleRollRushZoneRecord => {
  return {
    rushId: row.rush_id,
    sourceWorldBossId: row.source_world_boss_id,
    parentChannelId: row.parent_channel_id,
    rushChannelId: row.rush_channel_id,
    kickoffMessageId: row.kickoff_message_id,
    activatedAt: new Date(row.activated_at),
    expiresAt: new Date(row.expires_at),
    closedAt: row.closed_at ? new Date(row.closed_at) : null,
    closeReason: stripCleanupPendingCloseReason(row.close_reason),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
};

const getZoneRowById = (
  db: SqliteDatabase,
  rushId: string,
): WorldBossDoubleRollRushZoneRow | null => {
  return (
    db
      .prepare<unknown[], WorldBossDoubleRollRushZoneRow>(
        `
      SELECT ${selectZoneColumns}
      FROM dice_world_boss_double_roll_rush_zones
      WHERE rush_id = ?
    `,
      )
      .get(rushId) ?? null
  );
};

const getZoneById = (
  db: SqliteDatabase,
  rushId: string,
): WorldBossDoubleRollRushZoneRecord | null => {
  const row = getZoneRowById(db, rushId);
  return row ? mapZoneRow(row) : null;
};

const updateZoneFields = ({
  db,
  rushId,
  now,
  kickoffMessageId,
  closeReason,
}: {
  db: SqliteDatabase;
  rushId: string;
  now: Date;
  kickoffMessageId?: string;
  closeReason?: string;
}): WorldBossDoubleRollRushZoneRecord | null => {
  const nowIso = now.toISOString();
  const assignments = ["updated_at = @nowIso"];
  const parameters: Record<string, string> = {
    rushId,
    nowIso,
  };

  if (kickoffMessageId !== undefined) {
    assignments.push("kickoff_message_id = @kickoffMessageId");
    parameters.kickoffMessageId = kickoffMessageId;
  }

  if (closeReason !== undefined) {
    assignments.push("close_reason = @closeReason");
    parameters.closeReason = closeReason;
  }

  db.prepare(
    `
      UPDATE dice_world_boss_double_roll_rush_zones
      SET ${assignments.join(", ")}
      WHERE rush_id = @rushId
    `,
  ).run(parameters);

  return getZoneById(db, rushId);
};

export const createSqliteWorldBossDoubleRollRushZoneRepository = (db: SqliteDatabase) => {
  const createZone = ({
    rushId,
    sourceWorldBossId,
    parentChannelId,
    rushChannelId,
    kickoffMessageId,
    activatedAt,
    expiresAt,
  }: {
    rushId: string;
    sourceWorldBossId: string;
    parentChannelId: string;
    rushChannelId: string;
    kickoffMessageId: string;
    activatedAt: Date;
    expiresAt: Date;
  }): WorldBossDoubleRollRushZoneRecord => {
    const activatedAtIso = activatedAt.toISOString();
    const expiresAtIso = expiresAt.toISOString();
    db.prepare(
      `
      INSERT INTO dice_world_boss_double_roll_rush_zones (
        rush_id,
        source_world_boss_id,
        parent_channel_id,
        rush_channel_id,
        kickoff_message_id,
        activated_at,
        expires_at,
        created_at,
        updated_at
      )
      VALUES (
        @rushId,
        @sourceWorldBossId,
        @parentChannelId,
        @rushChannelId,
        @kickoffMessageId,
        @activatedAtIso,
        @expiresAtIso,
        @activatedAtIso,
        @activatedAtIso
      )
    `,
    ).run({
      rushId,
      sourceWorldBossId,
      parentChannelId,
      rushChannelId,
      kickoffMessageId,
      activatedAtIso,
      expiresAtIso,
    });

    const created = getZoneById(db, rushId);
    if (!created) {
      throw new Error(`Failed to load Double Roll Rush zone ${rushId} after insert.`);
    }

    return created;
  };

  const closeExpiredZones = (now: Date = new Date()): WorldBossDoubleRollRushZoneRecord[] => {
    const nowIso = now.toISOString();
    const rows = db
      .prepare<unknown[], WorldBossDoubleRollRushZoneRow>(
        `
        SELECT ${selectZoneColumns}
        FROM dice_world_boss_double_roll_rush_zones
        WHERE closed_at IS NULL
          AND expires_at <= ?
        ORDER BY activated_at ASC, rush_id ASC
      `,
      )
      .all(nowIso);

    if (rows.length < 1) {
      return [];
    }

    db.prepare(
      `
      UPDATE dice_world_boss_double_roll_rush_zones
      SET closed_at = @nowIso,
          close_reason = 'expired',
          updated_at = @nowIso
      WHERE closed_at IS NULL
        AND expires_at <= @nowIso
    `,
    ).run({ nowIso });

    return rows.map((row) =>
      mapZoneRow({
        ...row,
        closed_at: nowIso,
        close_reason: "expired",
        updated_at: nowIso,
      }),
    );
  };

  const getActiveZoneByChannelId = ({
    channelId,
    now = new Date(),
  }: {
    channelId: string | null;
    now?: Date;
  }): WorldBossDoubleRollRushZoneRecord | null => {
    if (!channelId) {
      return null;
    }

    closeExpiredZones(now);
    const nowIso = now.toISOString();
    const row = db
      .prepare<unknown[], WorldBossDoubleRollRushZoneRow>(
        `
        SELECT ${selectZoneColumns}
        FROM dice_world_boss_double_roll_rush_zones
        WHERE rush_channel_id = ?
          AND closed_at IS NULL
          AND expires_at > ?
        LIMIT 1
      `,
      )
      .get(channelId, nowIso);

    return row ? mapZoneRow(row) : null;
  };

  const listOpenZones = ({
    now = new Date(),
  }: {
    now?: Date;
  } = {}): WorldBossDoubleRollRushZoneRecord[] => {
    closeExpiredZones(now);
    const rows = db
      .prepare<unknown[], WorldBossDoubleRollRushZoneRow>(
        `
        SELECT ${selectZoneColumns}
        FROM dice_world_boss_double_roll_rush_zones
        WHERE closed_at IS NULL
        ORDER BY activated_at ASC, rush_id ASC
      `,
      )
      .all();

    return rows.map(mapZoneRow);
  };

  const listCleanupPendingZones = (): WorldBossDoubleRollRushZoneRecord[] => {
    const rows = db
      .prepare<unknown[], WorldBossDoubleRollRushZoneRow>(
        `
        SELECT ${selectZoneColumns}
        FROM dice_world_boss_double_roll_rush_zones
        WHERE closed_at IS NOT NULL
          AND close_reason LIKE ?
        ORDER BY updated_at DESC, rush_id ASC
      `,
      )
      .all(`%${cleanupPendingCloseReasonSuffix}`);

    return rows.map(mapZoneRow);
  };

  const listCleanupUntrackedZones = (): WorldBossDoubleRollRushZoneRecord[] => {
    const rows = db
      .prepare<unknown[], WorldBossDoubleRollRushZoneRow>(
        `
        SELECT ${selectZoneColumns}
        FROM dice_world_boss_double_roll_rush_zones
        WHERE closed_at IS NOT NULL
          AND close_reason NOT LIKE ?
          AND close_reason NOT LIKE ?
        ORDER BY updated_at DESC, rush_id ASC
      `,
      )
      .all(`%${cleanupPendingCloseReasonSuffix}`, `%${cleanupCompleteCloseReasonSuffix}`);

    return rows.map(mapZoneRow);
  };

  const closeZone = ({
    rushId,
    closeReason,
    now = new Date(),
  }: {
    rushId: string;
    closeReason: string;
    now?: Date;
  }): WorldBossDoubleRollRushZoneRecord | null => {
    const nowIso = now.toISOString();
    const changed = db
      .prepare(
        `
        UPDATE dice_world_boss_double_roll_rush_zones
        SET closed_at = @nowIso,
            close_reason = @closeReason,
            updated_at = @nowIso
        WHERE rush_id = @rushId
          AND closed_at IS NULL
      `,
      )
      .run({
        rushId,
        closeReason,
        nowIso,
      }).changes;

    if (changed < 1) {
      return getZoneById(db, rushId);
    }

    return getZoneById(db, rushId);
  };

  const updateKickoffMessageId = ({
    rushId,
    kickoffMessageId,
    now = new Date(),
  }: {
    rushId: string;
    kickoffMessageId: string;
    now?: Date;
  }): WorldBossDoubleRollRushZoneRecord | null => {
    return updateZoneFields({
      db,
      rushId,
      kickoffMessageId,
      now,
    });
  };

  const markCleanupPending = ({
    rushId,
    now = new Date(),
  }: {
    rushId: string;
    now?: Date;
  }): WorldBossDoubleRollRushZoneRecord | null => {
    const row = getZoneRowById(db, rushId);
    if (!row || !row.close_reason) {
      return row ? mapZoneRow(row) : null;
    }

    const closeReason = row.close_reason.endsWith(cleanupPendingCloseReasonSuffix)
      ? row.close_reason
      : `${row.close_reason}${cleanupPendingCloseReasonSuffix}`;

    return updateZoneFields({
      db,
      rushId,
      closeReason,
      now,
    });
  };

  const markCleanupComplete = ({
    rushId,
    now = new Date(),
  }: {
    rushId: string;
    now?: Date;
  }): WorldBossDoubleRollRushZoneRecord | null => {
    const row = getZoneRowById(db, rushId);
    if (!row || !row.close_reason) {
      return row ? mapZoneRow(row) : null;
    }

    const baseCloseReason = row.close_reason.endsWith(cleanupPendingCloseReasonSuffix)
      ? row.close_reason.slice(0, -cleanupPendingCloseReasonSuffix.length)
      : row.close_reason;
    const closeReason = baseCloseReason.endsWith(cleanupCompleteCloseReasonSuffix)
      ? baseCloseReason
      : `${baseCloseReason}${cleanupCompleteCloseReasonSuffix}`;

    return updateZoneFields({
      db,
      rushId,
      closeReason,
      now,
    });
  };

  return {
    createZone,
    closeExpiredZones,
    getActiveZoneByChannelId,
    listOpenZones,
    listCleanupPendingZones,
    listCleanupUntrackedZones,
    closeZone,
    updateKickoffMessageId,
    markCleanupPending,
    markCleanupComplete,
  };
};
