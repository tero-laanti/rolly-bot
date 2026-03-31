import type { SqliteDatabase } from "../../../../shared/db";
import type { RaidRunRepository } from "../../application/ports";
import {
  getRaidRunPartySize,
  type RaidRunAggregate,
  type RaidRunMemberRecord,
  type RaidRunRecord,
  type RaidRunStatus,
} from "../../domain/raid-run";

type RaidRunRow = {
  run_id: string;
  tier_id: string;
  boss_id: string;
  leader_user_id: string;
  status: RaidRunStatus;
  is_open: number;
  public_channel_id: string;
  public_message_id: string | null;
  private_channel_id: string | null;
  participant_role_id: string | null;
  encounter_message_id: string | null;
  recruitment_expires_at: string;
  encounter_starts_at: string | null;
  encounter_expires_at: string | null;
  boss_current_hp: number | null;
  reward_granted_at: string | null;
  reward_summary: string | null;
  close_scheduled_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
};

type RaidRunMemberRow = {
  run_id: string;
  user_id: string;
  is_leader: number;
  active: number;
  joined_at: string;
  updated_at: string;
};

type RaidRunRepositoryFailureReason =
  | "not-found"
  | "stale"
  | "not-recruiting"
  | "not-open"
  | "user-active-run"
  | "party-full"
  | "already-member"
  | "not-member"
  | "leader-cannot-leave";

type RaidRunMemberConflictReason = "already-member" | "user-active-run";

class RaidRunRepositoryError extends Error {
  constructor(readonly reason: RaidRunRepositoryFailureReason) {
    super(reason);
    this.name = "RaidRunRepositoryError";
  }
}

const fail = (reason: RaidRunRepositoryFailureReason): never => {
  throw new RaidRunRepositoryError(reason);
};

const isSqliteConstraintError = (error: unknown): error is { code?: string; message: string } => {
  return (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  );
};

const getRaidRunMemberConstraintReason = (error: unknown): RaidRunMemberConflictReason | null => {
  if (!isSqliteConstraintError(error)) {
    return null;
  }

  if (!error.message.includes("UNIQUE constraint failed")) {
    return null;
  }

  if (
    error.message.includes("dice_raid_run_members.run_id") &&
    error.message.includes("dice_raid_run_members.user_id")
  ) {
    return "already-member";
  }

  if (error.message.includes("dice_raid_run_members.user_id")) {
    return "user-active-run";
  }

  return null;
};

const toDate = (value: string): Date => {
  return new Date(value);
};

const toDateOrNull = (value: string | null): Date | null => {
  return value ? new Date(value) : null;
};

const toBoolean = (value: number): boolean => {
  return value === 1;
};

const normalizeVersionDelta = (versionDelta: number | undefined): number => {
  return Math.max(0, Math.floor(versionDelta ?? 0));
};

const mapRaidRunRow = (row: RaidRunRow): RaidRunRecord => {
  return {
    runId: row.run_id,
    tierId: row.tier_id,
    bossId: row.boss_id,
    leaderUserId: row.leader_user_id,
    status: row.status,
    isOpen: toBoolean(row.is_open),
    publicChannelId: row.public_channel_id,
    publicMessageId: row.public_message_id,
    privateChannelId: row.private_channel_id,
    participantRoleId: row.participant_role_id,
    encounterMessageId: row.encounter_message_id,
    recruitmentExpiresAt: toDate(row.recruitment_expires_at),
    encounterStartsAt: toDateOrNull(row.encounter_starts_at),
    encounterExpiresAt: toDateOrNull(row.encounter_expires_at),
    bossCurrentHp: row.boss_current_hp,
    rewardGrantedAt: toDateOrNull(row.reward_granted_at),
    rewardSummary: row.reward_summary,
    closeScheduledAt: toDateOrNull(row.close_scheduled_at),
    version: row.version,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
};

const mapRaidRunMemberRow = (row: RaidRunMemberRow): RaidRunMemberRecord => {
  return {
    runId: row.run_id,
    userId: row.user_id,
    isLeader: toBoolean(row.is_leader),
    active: toBoolean(row.active),
    joinedAt: toDate(row.joined_at),
    updatedAt: toDate(row.updated_at),
  };
};

const loadRaidRunAggregate = (db: SqliteDatabase, runId: string): RaidRunAggregate | null => {
  const runRow = db
    .prepare<unknown[], RaidRunRow>(
      `
      SELECT
        run_id,
        tier_id,
        boss_id,
        leader_user_id,
        status,
        is_open,
        public_channel_id,
        public_message_id,
        private_channel_id,
        participant_role_id,
        encounter_message_id,
        recruitment_expires_at,
        encounter_starts_at,
        encounter_expires_at,
        boss_current_hp,
        reward_granted_at,
        reward_summary,
        close_scheduled_at,
        version,
        created_at,
        updated_at
      FROM dice_raid_runs
      WHERE run_id = ?
    `,
    )
    .get(runId);

  if (!runRow) {
    return null;
  }

  const memberRows = db
    .prepare<unknown[], RaidRunMemberRow>(
      `
      SELECT
        run_id,
        user_id,
        is_leader,
        active,
        joined_at,
        updated_at
      FROM dice_raid_run_members
      WHERE run_id = ?
      ORDER BY is_leader DESC, active DESC, joined_at ASC, user_id ASC
    `,
    )
    .all(runId);

  return {
    run: mapRaidRunRow(runRow),
    members: memberRows.map(mapRaidRunMemberRow),
  };
};

const loadRaidRunsByStatuses = (
  db: SqliteDatabase,
  statuses: readonly RaidRunStatus[],
): RaidRunAggregate[] => {
  const uniqueStatuses = [...new Set(statuses)];
  if (uniqueStatuses.length < 1) {
    return [];
  }

  const placeholders = uniqueStatuses.map(() => "?").join(", ");
  const runRows = db
    .prepare<unknown[], RaidRunRow>(
      `
      SELECT
        run_id,
        tier_id,
        boss_id,
        leader_user_id,
        status,
        is_open,
        public_channel_id,
        public_message_id,
        private_channel_id,
        participant_role_id,
        encounter_message_id,
        recruitment_expires_at,
        encounter_starts_at,
        encounter_expires_at,
        boss_current_hp,
        reward_granted_at,
        reward_summary,
        close_scheduled_at,
        version,
        created_at,
        updated_at
      FROM dice_raid_runs
      WHERE status IN (${placeholders})
      ORDER BY created_at ASC, run_id ASC
    `,
    )
    .all(...uniqueStatuses);

  return runRows
    .map((row) => loadRaidRunAggregate(db, row.run_id))
    .filter((raidRun): raidRun is RaidRunAggregate => raidRun !== null);
};

const loadOpenRaidRunForUser = (db: SqliteDatabase, userId: string): RaidRunAggregate | null => {
  const row = db
    .prepare(
      `
      SELECT runs.run_id
      FROM dice_raid_runs runs
      INNER JOIN dice_raid_run_members members
        ON members.run_id = runs.run_id
      WHERE runs.is_open = 1
        AND members.active = 1
        AND members.user_id = ?
      ORDER BY runs.created_at DESC, runs.run_id DESC
      LIMIT 1
    `,
    )
    .get(userId) as { run_id: string } | undefined;

  return row ? loadRaidRunAggregate(db, row.run_id) : null;
};

const loadOpenRaidRunByPrivateChannelId = (
  db: SqliteDatabase,
  channelId: string,
): RaidRunAggregate | null => {
  const row = db
    .prepare(
      `
      SELECT run_id
      FROM dice_raid_runs
      WHERE is_open = 1
        AND private_channel_id = ?
      ORDER BY created_at DESC, run_id DESC
      LIMIT 1
    `,
    )
    .get(channelId) as { run_id: string } | undefined;

  return row ? loadRaidRunAggregate(db, row.run_id) : null;
};

const loadRaidRunMemberRow = (
  db: SqliteDatabase,
  runId: string,
  userId: string,
): RaidRunMemberRow | null => {
  return (
    db
      .prepare<unknown[], RaidRunMemberRow>(
        `
        SELECT
          run_id,
          user_id,
          is_leader,
          active,
          joined_at,
          updated_at
        FROM dice_raid_run_members
        WHERE run_id = ? AND user_id = ?
      `,
      )
      .get(runId, userId) ?? null
  );
};

const runInTransaction = <T>(db: SqliteDatabase, work: () => T): T => {
  return db.transaction(work)();
};

const writeRaidRunRow = (
  db: SqliteDatabase,
  input: {
    runId: string;
    tierId: string;
    bossId: string;
    leaderUserId: string;
    status: RaidRunStatus;
    isOpen: boolean;
    publicChannelId: string;
    publicMessageId: string | null;
    privateChannelId: string | null;
    participantRoleId: string | null;
    encounterMessageId: string | null;
    recruitmentExpiresAt: Date;
    encounterStartsAt: Date | null;
    encounterExpiresAt: Date | null;
    bossCurrentHp: number | null;
    rewardGrantedAt: Date | null;
    rewardSummary: string | null;
    closeScheduledAt: Date | null;
    version: number;
    createdAt: Date;
    updatedAt: Date;
  },
): void => {
  db.prepare(
    `
    INSERT INTO dice_raid_runs (
      run_id,
      tier_id,
      boss_id,
      leader_user_id,
      status,
      is_open,
      public_channel_id,
      public_message_id,
      private_channel_id,
      participant_role_id,
      encounter_message_id,
      recruitment_expires_at,
      encounter_starts_at,
      encounter_expires_at,
      boss_current_hp,
      reward_granted_at,
      reward_summary,
      close_scheduled_at,
      version,
      created_at,
      updated_at
    )
    VALUES (
      @runId,
      @tierId,
      @bossId,
      @leaderUserId,
      @status,
      @isOpen,
      @publicChannelId,
      @publicMessageId,
      @privateChannelId,
      @participantRoleId,
      @encounterMessageId,
      @recruitmentExpiresAt,
      @encounterStartsAt,
      @encounterExpiresAt,
      @bossCurrentHp,
      @rewardGrantedAt,
      @rewardSummary,
      @closeScheduledAt,
      @version,
      @createdAt,
      @updatedAt
    )
  `,
  ).run({
    runId: input.runId,
    tierId: input.tierId,
    bossId: input.bossId,
    leaderUserId: input.leaderUserId,
    status: input.status,
    isOpen: input.isOpen ? 1 : 0,
    publicChannelId: input.publicChannelId,
    publicMessageId: input.publicMessageId,
    privateChannelId: input.privateChannelId,
    participantRoleId: input.participantRoleId,
    encounterMessageId: input.encounterMessageId,
    recruitmentExpiresAt: input.recruitmentExpiresAt.toISOString(),
    encounterStartsAt: input.encounterStartsAt ? input.encounterStartsAt.toISOString() : null,
    encounterExpiresAt: input.encounterExpiresAt ? input.encounterExpiresAt.toISOString() : null,
    bossCurrentHp: input.bossCurrentHp,
    rewardGrantedAt: input.rewardGrantedAt ? input.rewardGrantedAt.toISOString() : null,
    rewardSummary: input.rewardSummary,
    closeScheduledAt: input.closeScheduledAt ? input.closeScheduledAt.toISOString() : null,
    version: input.version,
    createdAt: input.createdAt.toISOString(),
    updatedAt: input.updatedAt.toISOString(),
  });
};

const writeRaidRunMemberRow = (
  db: SqliteDatabase,
  input: {
    runId: string;
    userId: string;
    isLeader: boolean;
    active: boolean;
    joinedAt: Date;
    updatedAt: Date;
  },
): void => {
  db.prepare(
    `
    INSERT INTO dice_raid_run_members (
      run_id,
      user_id,
      is_leader,
      active,
      joined_at,
      updated_at
    )
    VALUES (
      @runId,
      @userId,
      @isLeader,
      @active,
      @joinedAt,
      @updatedAt
    )
  `,
  ).run({
    runId: input.runId,
    userId: input.userId,
    isLeader: input.isLeader ? 1 : 0,
    active: input.active ? 1 : 0,
    joinedAt: input.joinedAt.toISOString(),
    updatedAt: input.updatedAt.toISOString(),
  });
};

export const createSqliteRaidRunRepository = (db: SqliteDatabase): RaidRunRepository => {
  const getRaidRun = (runId: string): RaidRunAggregate | null => {
    return loadRaidRunAggregate(db, runId);
  };

  const getOpenRaidRunForUser = (userId: string): RaidRunAggregate | null => {
    return loadOpenRaidRunForUser(db, userId);
  };

  const getOpenRaidRunByPrivateChannelId = (channelId: string): RaidRunAggregate | null => {
    return loadOpenRaidRunByPrivateChannelId(db, channelId);
  };

  const createRecruitingRaidRun = (input: {
    runId: string;
    tierId: string;
    bossId: string;
    leaderUserId: string;
    publicChannelId: string;
    recruitmentExpiresAt: Date;
    now: Date;
  }) => {
    try {
      const raidRun = runInTransaction(db, () => {
        if (loadOpenRaidRunForUser(db, input.leaderUserId)) {
          fail("user-active-run");
        }

        writeRaidRunRow(db, {
          runId: input.runId,
          tierId: input.tierId,
          bossId: input.bossId,
          leaderUserId: input.leaderUserId,
          status: "recruiting",
          isOpen: true,
          publicChannelId: input.publicChannelId,
          publicMessageId: null,
          privateChannelId: null,
          participantRoleId: null,
          encounterMessageId: null,
          recruitmentExpiresAt: input.recruitmentExpiresAt,
          encounterStartsAt: null,
          encounterExpiresAt: null,
          bossCurrentHp: null,
          rewardGrantedAt: null,
          rewardSummary: null,
          closeScheduledAt: null,
          version: 1,
          createdAt: input.now,
          updatedAt: input.now,
        });

        try {
          writeRaidRunMemberRow(db, {
            runId: input.runId,
            userId: input.leaderUserId,
            isLeader: true,
            active: true,
            joinedAt: input.now,
            updatedAt: input.now,
          });
        } catch (error) {
          const reason = getRaidRunMemberConstraintReason(error);
          if (reason) {
            fail(reason);
          }

          throw error;
        }

        const created = loadRaidRunAggregate(db, input.runId);
        if (!created) {
          throw new Error(`Failed to persist raid run ${input.runId}.`);
        }

        return created;
      });

      return { ok: true as const, raidRun };
    } catch (error) {
      if (error instanceof RaidRunRepositoryError && error.reason === "user-active-run") {
        return { ok: false as const, reason: "user-active-run" as const };
      }

      throw error;
    }
  };

  const addRaidRunMember = (input: {
    runId: string;
    userId: string;
    expectedVersion: number;
    now: Date;
    partySizeLimit: number;
  }) => {
    try {
      const raidRun = runInTransaction(db, () => {
        const current = loadRaidRunAggregate(db, input.runId);
        const raidRunRecord = current ?? fail("not-found");

        if (raidRunRecord.run.version !== input.expectedVersion) {
          fail("stale");
        }

        if (!raidRunRecord.run.isOpen || raidRunRecord.run.status !== "recruiting") {
          fail("not-recruiting");
        }

        if (
          raidRunRecord.members.some((member) => member.active && member.userId === input.userId)
        ) {
          fail("already-member");
        }

        if (getRaidRunPartySize(raidRunRecord) >= input.partySizeLimit) {
          fail("party-full");
        }

        if (loadOpenRaidRunForUser(db, input.userId)) {
          fail("user-active-run");
        }

        const existingMember = loadRaidRunMemberRow(db, input.runId, input.userId);
        const updatedAt = input.now.toISOString();
        const updated = db
          .prepare(
            `
            UPDATE dice_raid_runs
            SET version = version + 1, updated_at = ?
            WHERE run_id = ? AND version = ? AND is_open = 1 AND status = 'recruiting'
          `,
          )
          .run(updatedAt, input.runId, input.expectedVersion);

        if (updated.changes !== 1) {
          fail("stale");
        }

        try {
          if (existingMember) {
            db.prepare(
              `
              UPDATE dice_raid_run_members
              SET active = 1, joined_at = ?, updated_at = ?
              WHERE run_id = ? AND user_id = ? AND active = 0
            `,
            ).run(updatedAt, updatedAt, input.runId, input.userId);
          } else {
            writeRaidRunMemberRow(db, {
              runId: input.runId,
              userId: input.userId,
              isLeader: false,
              active: true,
              joinedAt: input.now,
              updatedAt: input.now,
            });
          }
        } catch (error) {
          const reason = getRaidRunMemberConstraintReason(error);
          if (reason) {
            fail(reason);
          }

          throw error;
        }

        const updatedRaidRun = loadRaidRunAggregate(db, input.runId) ?? fail("stale");

        return updatedRaidRun;
      });

      return { ok: true as const, raidRun };
    } catch (error) {
      if (!(error instanceof RaidRunRepositoryError)) {
        throw error;
      }

      switch (error.reason) {
        case "not-found":
          return { ok: false as const, reason: "not-found" as const };
        case "stale":
          return { ok: false as const, reason: "stale" as const };
        case "not-recruiting":
          return { ok: false as const, reason: "not-recruiting" as const };
        case "user-active-run":
          return { ok: false as const, reason: "user-active-run" as const };
        case "party-full":
          return { ok: false as const, reason: "party-full" as const };
        case "already-member":
          return { ok: false as const, reason: "already-member" as const };
        default:
          throw error;
      }
    }
  };

  const removeRaidRunMember = (input: {
    runId: string;
    userId: string;
    expectedVersion: number;
    now: Date;
  }) => {
    try {
      const raidRun = runInTransaction(db, () => {
        const current = loadRaidRunAggregate(db, input.runId);
        const raidRunRecord = current ?? fail("not-found");

        if (raidRunRecord.run.version !== input.expectedVersion) {
          fail("stale");
        }

        if (!raidRunRecord.run.isOpen || raidRunRecord.run.status !== "recruiting") {
          fail("not-recruiting");
        }

        const member =
          raidRunRecord.members.find((entry) => entry.active && entry.userId === input.userId) ??
          fail("not-member");

        if (member.isLeader) {
          fail("leader-cannot-leave");
        }

        const updatedAt = input.now.toISOString();
        const updated = db
          .prepare(
            `
            UPDATE dice_raid_runs
            SET version = version + 1, updated_at = ?
            WHERE run_id = ? AND version = ? AND is_open = 1 AND status = 'recruiting'
          `,
          )
          .run(updatedAt, input.runId, input.expectedVersion);

        if (updated.changes !== 1) {
          fail("stale");
        }

        const memberUpdate = db
          .prepare(
            `
            UPDATE dice_raid_run_members
            SET active = 0, updated_at = ?
            WHERE run_id = ? AND user_id = ? AND active = 1
          `,
          )
          .run(updatedAt, input.runId, input.userId);

        if (memberUpdate.changes !== 1) {
          fail("stale");
        }

        const updatedRaidRun = loadRaidRunAggregate(db, input.runId) ?? fail("stale");

        return updatedRaidRun;
      });

      return { ok: true as const, raidRun };
    } catch (error) {
      if (!(error instanceof RaidRunRepositoryError)) {
        throw error;
      }

      switch (error.reason) {
        case "not-found":
          return { ok: false as const, reason: "not-found" as const };
        case "stale":
          return { ok: false as const, reason: "stale" as const };
        case "not-recruiting":
          return { ok: false as const, reason: "not-recruiting" as const };
        case "not-member":
          return { ok: false as const, reason: "not-member" as const };
        case "leader-cannot-leave":
          return { ok: false as const, reason: "leader-cannot-leave" as const };
        default:
          throw error;
      }
    }
  };

  const updateRaidRun = (input: {
    runId: string;
    expectedVersion: number;
    now: Date;
    status?: RaidRunStatus;
    isOpen?: boolean;
    publicMessageId?: string | null;
    privateChannelId?: string | null;
    participantRoleId?: string | null;
    encounterMessageId?: string | null;
    encounterStartsAt?: Date | null;
    encounterExpiresAt?: Date | null;
    bossCurrentHp?: number | null;
    rewardGrantedAt?: Date | null;
    rewardSummary?: string | null;
    closeScheduledAt?: Date | null;
    versionDelta?: number;
  }) => {
    try {
      const raidRun = runInTransaction(db, () => {
        const current = loadRaidRunAggregate(db, input.runId);
        const raidRunRecord = current ?? fail("not-found");

        if (raidRunRecord.run.version !== input.expectedVersion) {
          fail("stale");
        }

        if (!raidRunRecord.run.isOpen) {
          fail("not-open");
        }

        const updatedAt = input.now.toISOString();
        const nextVersion = raidRunRecord.run.version + normalizeVersionDelta(input.versionDelta);
        const nextStatus = input.status ?? raidRunRecord.run.status;
        const nextIsOpen = input.isOpen ?? raidRunRecord.run.isOpen;
        const nextPublicMessageId =
          input.publicMessageId !== undefined
            ? input.publicMessageId
            : raidRunRecord.run.publicMessageId;
        const nextPrivateChannelId =
          input.privateChannelId !== undefined
            ? input.privateChannelId
            : raidRunRecord.run.privateChannelId;
        const nextParticipantRoleId =
          input.participantRoleId !== undefined
            ? input.participantRoleId
            : raidRunRecord.run.participantRoleId;
        const nextEncounterMessageId =
          input.encounterMessageId !== undefined
            ? input.encounterMessageId
            : raidRunRecord.run.encounterMessageId;
        const nextEncounterStartsAt =
          input.encounterStartsAt !== undefined
            ? (input.encounterStartsAt?.toISOString() ?? null)
            : (raidRunRecord.run.encounterStartsAt?.toISOString() ?? null);
        const nextEncounterExpiresAt =
          input.encounterExpiresAt !== undefined
            ? (input.encounterExpiresAt?.toISOString() ?? null)
            : (raidRunRecord.run.encounterExpiresAt?.toISOString() ?? null);
        const nextBossCurrentHp =
          input.bossCurrentHp !== undefined ? input.bossCurrentHp : raidRunRecord.run.bossCurrentHp;
        const nextRewardGrantedAt =
          input.rewardGrantedAt !== undefined
            ? (input.rewardGrantedAt?.toISOString() ?? null)
            : (raidRunRecord.run.rewardGrantedAt?.toISOString() ?? null);
        const nextRewardSummary =
          input.rewardSummary !== undefined ? input.rewardSummary : raidRunRecord.run.rewardSummary;
        const nextCloseScheduledAt =
          input.closeScheduledAt !== undefined
            ? (input.closeScheduledAt?.toISOString() ?? null)
            : (raidRunRecord.run.closeScheduledAt?.toISOString() ?? null);

        const result = db
          .prepare(
            `
            UPDATE dice_raid_runs
            SET
              status = ?,
              is_open = ?,
              public_message_id = ?,
              private_channel_id = ?,
              participant_role_id = ?,
              encounter_message_id = ?,
              encounter_starts_at = ?,
              encounter_expires_at = ?,
              boss_current_hp = ?,
              reward_granted_at = ?,
              reward_summary = ?,
              close_scheduled_at = ?,
              version = ?,
              updated_at = ?
            WHERE run_id = ? AND version = ? AND is_open = 1
          `,
          )
          .run(
            nextStatus,
            nextIsOpen ? 1 : 0,
            nextPublicMessageId,
            nextPrivateChannelId,
            nextParticipantRoleId,
            nextEncounterMessageId,
            nextEncounterStartsAt,
            nextEncounterExpiresAt,
            nextBossCurrentHp,
            nextRewardGrantedAt,
            nextRewardSummary,
            nextCloseScheduledAt,
            nextVersion,
            updatedAt,
            input.runId,
            input.expectedVersion,
          );

        if (result.changes !== 1) {
          fail("stale");
        }

        const updatedRaidRun = loadRaidRunAggregate(db, input.runId) ?? fail("stale");

        return updatedRaidRun;
      });

      return { ok: true as const, raidRun };
    } catch (error) {
      if (!(error instanceof RaidRunRepositoryError)) {
        throw error;
      }

      switch (error.reason) {
        case "not-found":
          return { ok: false as const, reason: "not-found" as const };
        case "stale":
          return { ok: false as const, reason: "stale" as const };
        case "not-open":
          return { ok: false as const, reason: "not-open" as const };
        default:
          throw error;
      }
    }
  };

  const closeRaidRun = (input: {
    runId: string;
    expectedVersion: number;
    status: Extract<
      RaidRunStatus,
      "resolved" | "cancelled" | "expired" | "interrupted" | "provision-failed"
    >;
    now: Date;
    publicMessageId?: string | null;
    privateChannelId?: string | null;
    participantRoleId?: string | null;
    encounterMessageId?: string | null;
    bossCurrentHp?: number | null;
    rewardGrantedAt?: Date | null;
    rewardSummary?: string | null;
    closeScheduledAt?: Date | null;
  }) => {
    try {
      const raidRun = runInTransaction(db, () => {
        const current = loadRaidRunAggregate(db, input.runId);
        const raidRunRecord = current ?? fail("not-found");

        if (raidRunRecord.run.version !== input.expectedVersion) {
          fail("stale");
        }

        if (!raidRunRecord.run.isOpen) {
          fail("stale");
        }

        const updatedAt = input.now.toISOString();
        const nextPublicMessageId =
          input.publicMessageId !== undefined
            ? input.publicMessageId
            : raidRunRecord.run.publicMessageId;
        const nextPrivateChannelId =
          input.privateChannelId !== undefined
            ? input.privateChannelId
            : raidRunRecord.run.privateChannelId;
        const nextParticipantRoleId =
          input.participantRoleId !== undefined
            ? input.participantRoleId
            : raidRunRecord.run.participantRoleId;
        const nextEncounterMessageId =
          input.encounterMessageId !== undefined
            ? input.encounterMessageId
            : raidRunRecord.run.encounterMessageId;
        const nextBossCurrentHp =
          input.bossCurrentHp !== undefined ? input.bossCurrentHp : raidRunRecord.run.bossCurrentHp;
        const nextRewardGrantedAt =
          input.rewardGrantedAt !== undefined
            ? (input.rewardGrantedAt?.toISOString() ?? null)
            : (raidRunRecord.run.rewardGrantedAt?.toISOString() ?? null);
        const nextRewardSummary =
          input.rewardSummary !== undefined ? input.rewardSummary : raidRunRecord.run.rewardSummary;
        const nextCloseScheduledAt =
          input.closeScheduledAt !== undefined
            ? (input.closeScheduledAt?.toISOString() ?? null)
            : (raidRunRecord.run.closeScheduledAt?.toISOString() ?? null);

        const result = db
          .prepare(
            `
            UPDATE dice_raid_runs
            SET
              status = ?,
              is_open = 0,
              public_message_id = ?,
              private_channel_id = ?,
              participant_role_id = ?,
              encounter_message_id = ?,
              boss_current_hp = ?,
              reward_granted_at = ?,
              reward_summary = ?,
              close_scheduled_at = ?,
              version = version + 1,
              updated_at = ?
            WHERE run_id = ? AND version = ? AND is_open = 1
          `,
          )
          .run(
            input.status,
            nextPublicMessageId,
            nextPrivateChannelId,
            nextParticipantRoleId,
            nextEncounterMessageId,
            nextBossCurrentHp,
            nextRewardGrantedAt,
            nextRewardSummary,
            nextCloseScheduledAt,
            updatedAt,
            input.runId,
            input.expectedVersion,
          );

        if (result.changes !== 1) {
          fail("stale");
        }

        db.prepare(
          `
          UPDATE dice_raid_run_members
          SET active = 0, updated_at = ?
          WHERE run_id = ?
        `,
        ).run(updatedAt, input.runId);

        const updatedRaidRun = loadRaidRunAggregate(db, input.runId) ?? fail("stale");

        return updatedRaidRun;
      });

      return { ok: true as const, raidRun };
    } catch (error) {
      if (!(error instanceof RaidRunRepositoryError)) {
        throw error;
      }

      switch (error.reason) {
        case "not-found":
          return { ok: false as const, reason: "not-found" as const };
        case "stale":
          return { ok: false as const, reason: "stale" as const };
        default:
          throw error;
      }
    }
  };

  const updateRaidRunStoredReferences = (input: {
    runId: string;
    now: Date;
    publicMessageId?: string | null;
    privateChannelId?: string | null;
    participantRoleId?: string | null;
    encounterMessageId?: string | null;
    closeScheduledAt?: Date | null;
    closeOpenRunAsInterrupted?: boolean;
  }) => {
    try {
      const raidRun = runInTransaction(db, () => {
        const current = loadRaidRunAggregate(db, input.runId);
        const raidRunRecord = current ?? fail("not-found");

        const updatedAt = input.now.toISOString();
        const nextPublicMessageId =
          input.publicMessageId !== undefined
            ? input.publicMessageId
            : raidRunRecord.run.publicMessageId;
        const nextPrivateChannelId =
          input.privateChannelId !== undefined
            ? input.privateChannelId
            : raidRunRecord.run.privateChannelId;
        const nextParticipantRoleId =
          input.participantRoleId !== undefined
            ? input.participantRoleId
            : raidRunRecord.run.participantRoleId;
        const nextEncounterMessageId =
          input.encounterMessageId !== undefined
            ? input.encounterMessageId
            : raidRunRecord.run.encounterMessageId;
        const nextCloseScheduledAt =
          input.closeScheduledAt !== undefined
            ? (input.closeScheduledAt?.toISOString() ?? null)
            : (raidRunRecord.run.closeScheduledAt?.toISOString() ?? null);
        const shouldCloseOpenRun =
          input.closeOpenRunAsInterrupted === true &&
          raidRunRecord.run.isOpen &&
          raidRunRecord.run.status === "recruiting";
        const nextStatus = shouldCloseOpenRun ? "interrupted" : raidRunRecord.run.status;
        const nextIsOpen = shouldCloseOpenRun ? 0 : raidRunRecord.run.isOpen ? 1 : 0;

        db.prepare(
          `
            UPDATE dice_raid_runs
            SET
              status = ?,
              is_open = ?,
              public_message_id = ?,
              private_channel_id = ?,
              participant_role_id = ?,
              encounter_message_id = ?,
              close_scheduled_at = ?,
              version = version + 1,
              updated_at = ?
            WHERE run_id = ?
          `,
        ).run(
          nextStatus,
          nextIsOpen,
          nextPublicMessageId,
          nextPrivateChannelId,
          nextParticipantRoleId,
          nextEncounterMessageId,
          nextCloseScheduledAt,
          updatedAt,
          input.runId,
        );

        if (shouldCloseOpenRun) {
          db.prepare(
            `
              UPDATE dice_raid_run_members
              SET active = 0, updated_at = ?
              WHERE run_id = ? AND active = 1
            `,
          ).run(updatedAt, input.runId);
        }

        return loadRaidRunAggregate(db, input.runId) ?? fail("not-found");
      });

      return { ok: true as const, raidRun };
    } catch (error) {
      if (error instanceof RaidRunRepositoryError && error.reason === "not-found") {
        return { ok: false as const, reason: "not-found" as const };
      }

      throw error;
    }
  };

  const listRaidRunsByStatuses = (statuses: readonly RaidRunStatus[]): RaidRunAggregate[] => {
    return loadRaidRunsByStatuses(db, statuses);
  };

  return {
    getRaidRun,
    getOpenRaidRunForUser,
    getOpenRaidRunByPrivateChannelId,
    createRecruitingRaidRun,
    addRaidRunMember,
    removeRaidRunMember,
    updateRaidRun,
    closeRaidRun,
    updateRaidRunStoredReferences,
    listRaidRunsByStatuses,
  };
};
