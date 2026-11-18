#!/usr/bin/env node
/**
 * Creates a consistent snapshot of the database and removes old snapshots.
 * Run daily by the craftingai-backup systemd timer that install.sh sets up.
 *
 *   DATA_DIR=/var/lib/craftingai node scripts/backup.mjs
 */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const KEEP = Number(process.env.BACKUP_KEEP ?? 7);
const dataDir = process.env.DATA_DIR ?? path.join(process.cwd(), ".data");
const source = path.join(dataDir, "craftingai.db");
const targetDir = path.join(dataDir, "backups");

if (!fs.existsSync(source)) {
  console.log("No database yet; nothing to back up.");
  process.exit(0);
}

fs.mkdirSync(targetDir, { recursive: true, mode: 0o700 });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const target = path.join(targetDir, `craftingai-${stamp}.db`);

const db = new Database(source, { readonly: true, fileMustExist: true });
try {
  // The online backup API is safe while the application is running.
  await db.backup(target);
} finally {
  db.close();
}
fs.chmodSync(target, 0o600);
console.log(`Backup written to ${target}`);

const snapshots = fs
  .readdirSync(targetDir)
  .filter((name) => /^craftingai-.*\.db$/.test(name))
  .sort()
  .reverse();
for (const name of snapshots.slice(KEEP)) {
  fs.rmSync(path.join(targetDir, name));
  console.log(`Removed old backup ${name}`);
}
