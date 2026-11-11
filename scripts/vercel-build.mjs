// Vercel build for the Student Diary, the only app that migrates the shared database.
//
// Order matters: build FIRST, migrate only if the build succeeded. Before, the migration ran first, so a
// failed build left the shared database ahead of the code that all four apps are still running.
// Only production deployments migrate; a preview build can never change the database.
//
// A pending migration that can lose rows (DROP TABLE/COLUMN/TYPE, TRUNCATE, DELETE FROM) stops the deploy
// unless ALLOW_DESTRUCTIVE_MIGRATION=1 is set for that deployment on purpose.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { findDestructive, parsePendingMigrations } from "./migration-guard.mjs";

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: false });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

run("npx", ["next", "build"]);

if (process.env.VERCEL_ENV !== "production") {
  console.log(`Skipping migrations (VERCEL_ENV=${process.env.VERCEL_ENV ?? "unset"})`);
  process.exit(0);
}

if (!process.env.DATABASE_URL_UNPOOLED && !process.env.DATABASE_URL) {
  console.error("Cannot migrate: neither DATABASE_URL_UNPOOLED nor DATABASE_URL is set.");
  process.exit(1);
}

const status = spawnSync("npx", ["prisma", "migrate", "status"], { encoding: "utf8" });
const output = `${status.stdout ?? ""}\n${status.stderr ?? ""}`;
const pending = parsePendingMigrations(output);

// `migrate status` exits non-zero when migrations are pending. Any other failure (no connection,
// failed or drifted history) must stop the deploy rather than guess.
if (status.status !== 0 && pending.length === 0) {
  console.error("`prisma migrate status` failed and no pending migrations were found:\n" + output);
  process.exit(1);
}

if (pending.length === 0) {
  console.log("Database is up to date, nothing to migrate.");
  process.exit(0);
}

console.log(`Pending migrations: ${pending.join(", ")}`);
for (const name of pending) {
  const risky = findDestructive(readFileSync(`prisma/migrations/${name}/migration.sql`, "utf8"));
  if (risky.length > 0 && process.env.ALLOW_DESTRUCTIVE_MIGRATION !== "1") {
    console.error(`Refusing to run ${name}: it can lose data.\n  ${risky.join("\n  ")}`);
    console.error("Set ALLOW_DESTRUCTIVE_MIGRATION=1 for this deployment only if that is intended.");
    process.exit(1);
  }
}

run("npx", ["prisma", "migrate", "deploy"]);
