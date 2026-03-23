import type { SqliteDatabase } from "../../../../shared/db";
import type {
  ManagedIntroPostRecord,
  ManagedIntroPostsRepository,
  SaveManagedIntroPostInput,
} from "../../application/ports";

type ManagedIntroPostRow = {
  slot_index: number;
  channel_id: string;
  message_id: string;
  created_at: string;
  updated_at: string;
};

const mapManagedIntroPostRow = (row: ManagedIntroPostRow): ManagedIntroPostRecord => {
  return {
    slotIndex: row.slot_index,
    channelId: row.channel_id,
    messageId: row.message_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

const listManagedIntroPosts = (db: SqliteDatabase): ManagedIntroPostRecord[] => {
  const rows = db
    .prepare(
      `
      SELECT slot_index, channel_id, message_id, created_at, updated_at
      FROM managed_intro_posts
      ORDER BY slot_index ASC
    `,
    )
    .all() as ManagedIntroPostRow[];

  return rows.map(mapManagedIntroPostRow);
};

const saveManagedIntroPost = (
  db: SqliteDatabase,
  { slotIndex, channelId, messageId }: SaveManagedIntroPostInput,
): void => {
  const updatedAt = new Date().toISOString();

  db.prepare(
    `
    INSERT INTO managed_intro_posts (slot_index, channel_id, message_id, created_at, updated_at)
    VALUES (@slotIndex, @channelId, @messageId, @updatedAt, @updatedAt)
    ON CONFLICT(slot_index)
    DO UPDATE SET
      channel_id = excluded.channel_id,
      message_id = excluded.message_id,
      updated_at = excluded.updated_at
  `,
  ).run({
    slotIndex,
    channelId,
    messageId,
    updatedAt,
  });
};

const deleteManagedIntroPost = (db: SqliteDatabase, slotIndex: number): void => {
  db.prepare("DELETE FROM managed_intro_posts WHERE slot_index = ?").run(slotIndex);
};

export const createSqliteManagedIntroPostsRepository = (
  db: SqliteDatabase,
): ManagedIntroPostsRepository => {
  return {
    listManagedIntroPosts: () => listManagedIntroPosts(db),
    saveManagedIntroPost: (input) => saveManagedIntroPost(db, input),
    deleteManagedIntroPost: (slotIndex) => deleteManagedIntroPost(db, slotIndex),
  };
};
