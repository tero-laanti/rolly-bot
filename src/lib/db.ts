import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { databasePath } from "./config";
import { migrateDatabase } from "./db/migrations";

export type SqliteDatabase = InstanceType<typeof Database>;
let database: SqliteDatabase | null = null;

export const initDatabase = (): SqliteDatabase => {
  if (database) {
    return database;
  }

  ensureDatabaseDirectory(databasePath);

  const db = new Database(databasePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  migrateDatabase(db);

  database = db;
  return db;
};

export const getDatabase = (): SqliteDatabase => {
  if (!database) {
    throw new Error("Database not initialized. Call initDatabase() first.");
  }

  return database;
};

const ensureDatabaseDirectory = (databasePath: string): void => {
  if (databasePath === ":memory:" || databasePath.startsWith("file:")) {
    return;
  }

  const resolvedPath = path.isAbsolute(databasePath) ? databasePath : path.resolve(databasePath);
  const directory = path.dirname(resolvedPath);

  fs.mkdirSync(directory, { recursive: true });
};
