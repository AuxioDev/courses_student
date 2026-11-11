import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  findDestructive,
  parsePendingMigrations,
  stripSqlComments,
} from "../../../scripts/migration-guard.mjs";

describe("findDestructive", () => {
  it("allows additive changes", () => {
    const sql = `
      CREATE TYPE "ApplicationStatus" AS ENUM ('new');
      ALTER TABLE "users" ADD COLUMN "bio" TEXT;
      CREATE TABLE "applications" ("id" TEXT NOT NULL);
      CREATE INDEX "i" ON "applications"("id");
    `;
    expect(findDestructive(sql)).toEqual([]);
  });

  it("allows the harmless changes that look similar", () => {
    const sql = `
      ALTER INDEX "old_name" RENAME TO "new_name";
      ALTER TABLE "users" ALTER COLUMN "locale" DROP NOT NULL;
      ALTER TABLE "users" ALTER COLUMN "locale" SET DEFAULT 'az';
      ALTER TABLE "users" ADD COLUMN "x" TEXT NOT NULL DEFAULT '';
      ALTER TABLE "marks" ADD CONSTRAINT "marks_value_range" CHECK ("value" >= 0);
    `;
    expect(findDestructive(sql)).toEqual([]);
  });

  it("allows dropping an index or a constraint (no rows are lost)", () => {
    expect(findDestructive('DROP INDEX "x"; ALTER TABLE "t" DROP CONSTRAINT "c";')).toEqual([]);
  });

  it.each([
    'DROP TABLE "marks";',
    'ALTER TABLE "users" DROP COLUMN "email";',
    'DROP TYPE "Role";',
    "TRUNCATE users;",
    "delete from users where true;",
    'ALTER TABLE "marks" ALTER COLUMN "value" TYPE INTEGER;',
    'ALTER TABLE "marks" ALTER COLUMN "value" SET DATA TYPE INTEGER USING "value"::int;',
    'ALTER TABLE "users" ALTER COLUMN "locale" SET NOT NULL;',
    'ALTER TABLE "users" RENAME COLUMN "name" TO "full_name";',
    'ALTER TABLE "users" RENAME TO "people";',
    'ALTER TYPE "Role" RENAME VALUE \'admin\' TO \'owner\';',
    'ALTER TABLE "t" ADD COLUMN "a" INTEGER, DROP COLUMN "b";',
  ])("flags %s", (sql) => {
    expect(findDestructive(sql).length).toBeGreaterThan(0);
  });

  it("ignores statements inside comments", () => {
    expect(findDestructive('-- DROP TABLE "users";\n/* TRUNCATE users; */ SELECT 1;')).toEqual([]);
  });
});

describe("stripSqlComments", () => {
  it("removes line and block comments", () => {
    expect(stripSqlComments("a -- b\nc /* d */ e").replace(/\s+/g, " ")).toBe("a c e");
  });
});

describe("parsePendingMigrations", () => {
  it("reads the pending names from prisma migrate status", () => {
    const out = `12 migrations found in prisma/migrations

Following migrations have not yet been applied:
20261111120000_public_website
20261112090000_next_one

To apply migrations in development run prisma migrate dev.`;
    expect(parsePendingMigrations(out)).toEqual([
      "20261111120000_public_website",
      "20261112090000_next_one",
    ]);
  });

  it("returns nothing when the database is up to date", () => {
    expect(parsePendingMigrations("Database schema is up to date!")).toEqual([]);
  });

  it("does not pick up applied migration names listed before the marker", () => {
    const out = "20261029204407_init\nFollowing migration have not yet been applied:\n20261111120000_public_website";
    expect(parsePendingMigrations(out)).toEqual(["20261111120000_public_website"]);
  });
});

describe("the pending public_website migration", () => {
  it("is additive, so production can run it without the override", () => {
    const dirs = readdirSync("prisma/migrations").filter((d) => d.endsWith("_public_website"));
    expect(dirs).toHaveLength(1);
    const sql = readFileSync(`prisma/migrations/${dirs[0]}/migration.sql`, "utf8");
    expect(findDestructive(sql)).toEqual([]);
  });
});
