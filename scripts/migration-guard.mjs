// Pure helpers for scripts/vercel-build.mjs. Kept separate so they can be unit tested.

/** Removes `-- line` and `/* block *\/` comments so a comment cannot hide or fake a statement. */
export function stripSqlComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");
}

/**
 * Statements that can lose rows, or break the other three apps while they still run the old code (they deploy
 * on their own, so a rename or a type change is an outage until each has redeployed). Dropping an index or a
 * constraint does not lose data, so it is allowed. Returns the matched statements (empty array = safe).
 */
export function findDestructive(sql) {
  const clean = stripSqlComments(sql);
  const patterns = [
    /\bDROP\s+TABLE\b[^;]*/gi,
    /\bDROP\s+COLUMN\b[^;,]*/gi,
    /\bDROP\s+TYPE\b[^;]*/gi,
    /\bDROP\s+SCHEMA\b[^;]*/gi,
    /\bTRUNCATE\b[^;]*/gi,
    /\bDELETE\s+FROM\b[^;]*/gi,
    // Converts or rejects existing values.
    /\bALTER\s+COLUMN\s+"?\w+"?\s+(?:SET\s+DATA\s+)?TYPE\b[^;,]*/gi,
    /\bALTER\s+COLUMN\s+"?\w+"?\s+SET\s+NOT\s+NULL\b/gi,
    // The old code still reads the old name until every app has redeployed. (ALTER INDEX ... RENAME is harmless.)
    /\bALTER\s+TABLE\b[^;]*?\bRENAME\b[^;]*/gi,
    /\bALTER\s+TYPE\b[^;]*?\bRENAME\b[^;]*/gi,
  ];
  return patterns.flatMap((re) => clean.match(re)?.map((m) => m.trim()) ?? []);
}

/** Reads the names listed after "have not yet been applied" in `prisma migrate status` output. */
export function parsePendingMigrations(statusOutput) {
  const marker = /have not yet been applied/i.exec(statusOutput);
  if (!marker) return [];
  const rest = statusOutput.slice(marker.index);
  return [...new Set(rest.match(/\b\d{14}_[a-z0-9_]+\b/gi) ?? [])];
}
