// Pure helpers for scripts/vercel-build.mjs. Kept separate so they can be unit tested.

/** Removes `-- line` and `/* block *\/` comments so a comment cannot hide or fake a statement. */
export function stripSqlComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");
}

/**
 * Statements that can lose rows. Dropping an index or a constraint does not lose data, so it is allowed.
 * Returns the matched statements (empty array = safe).
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
