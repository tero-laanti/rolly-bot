import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import Database from "better-sqlite3";

const require = createRequire(import.meta.url);
const { databasePath } = require("../dist/shared/config.js");
const {
  initializeDatabaseSchema,
  migrateLegacyDatabaseSchema,
} = require("../dist/shared/db/schema.js");

const usage = () => {
  console.log("Usage: npm run db:migrate:dice-count -- [path/to/rolly-bot.sqlite]");
};

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  usage();
  process.exit(0);
}

if (args.length > 1) {
  usage();
  process.exit(1);
}

const targetPath = path.resolve(args[0] ?? databasePath);
if (!existsSync(targetPath)) {
  console.error(`Database file does not exist: ${targetPath}`);
  process.exit(1);
}

const db = new Database(targetPath);

try {
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  const migrated = migrateLegacyDatabaseSchema(db);
  initializeDatabaseSchema(db);

  if (migrated) {
    console.log(`Dice-count migration completed for ${targetPath}.`);
  } else {
    console.log(`No legacy dice-count migration was needed for ${targetPath}.`);
  }
  console.log("Current schema validation passed.");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
} finally {
  db.close();
}
