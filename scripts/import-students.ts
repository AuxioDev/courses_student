// Creates student accounts from a CSV file, until the Admin Panel exists.
//
// CSV header: name,email,group   (group is optional and must already exist)
// Usage:      npm run students:import -- students.csv           (checks only)
//             npm run students:import -- students.csv --apply   (creates accounts)
//
// Each new student gets a temporary password and must choose their own at first
// login. The passwords are written to .imports/ (private, ignored by git), never
// printed. Emails already in use are skipped.
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { db, hash, run, tempPassword, tempPasswordExpiry } from "./admin-lib";

type Row = { line: number; name: string; email: string; group: string };

function parseLine(line: string) {
  const fields: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted && c === '"' && line[i + 1] === '"') {
      field += '"';
      i++;
    } else if (c === '"') quoted = !quoted;
    else if (c === "," && !quoted) {
      fields.push(field);
      field = "";
    } else field += c;
  }
  fields.push(field);
  return fields.map((f) => f.trim());
}

function parse(text: string) {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const header = parseLine(lines[0]).map((h) => h.toLowerCase());
  const [nameAt, emailAt, groupAt] = ["name", "email", "group"].map((h) => header.indexOf(h));
  if (nameAt < 0 || emailAt < 0) throw new Error('The first line must contain "name" and "email" columns.');

  const rows: Row[] = [];
  const problems: string[] = [];
  const seen = new Set<string>();
  lines.slice(1).forEach((raw, i) => {
    if (!raw.trim()) return;
    const line = i + 2;
    const f = parseLine(raw);
    const name = f[nameAt] ?? "";
    const email = (f[emailAt] ?? "").toLowerCase();
    if (!name) problems.push(`line ${line}: name is missing`);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) problems.push(`line ${line}: invalid email "${email}"`);
    if (seen.has(email)) problems.push(`line ${line}: duplicate email "${email}"`);
    seen.add(email);
    rows.push({ line, name, email, group: groupAt >= 0 ? (f[groupAt] ?? "") : "" });
  });
  return { rows, problems };
}

run(async () => {
  const file = process.argv[2];
  if (!file) throw new Error("Usage: npm run students:import -- students.csv [--apply]");
  const apply = process.argv.includes("--apply");
  const { rows, problems } = parse(await readFile(file, "utf8"));

  const groupNames = [...new Set(rows.map((r) => r.group).filter(Boolean))];
  const groups = await db.group.findMany({ where: { name: { in: groupNames } }, select: { id: true, name: true } });
  const groupIds = new Map(groups.map((g) => [g.name, g.id]));
  for (const r of rows) {
    if (r.group && !groupIds.has(r.group)) problems.push(`line ${r.line}: unknown group "${r.group}"`);
  }
  if (problems.length) throw new Error(`Nothing was imported.\n${problems.join("\n")}`);

  const existing = new Set(
    (await db.user.findMany({ where: { email: { in: rows.map((r) => r.email) } }, select: { email: true } })).map(
      (u) => u.email,
    ),
  );
  const fresh = rows.filter((r) => !existing.has(r.email));
  console.log(
    `${rows.length} rows: ${fresh.length} new, ${rows.length - fresh.length} already exist and will be skipped.`,
  );
  if (!apply) {
    console.log("Checked only. Add --apply to create the accounts.");
    return;
  }

  const out = ["name,email,temporary_password"];
  for (const r of fresh) {
    const password = tempPassword();
    await db.user.create({
      data: {
        name: r.name,
        email: r.email,
        role: "student",
        passwordHash: await hash(password),
        mustChangePassword: true, tempPasswordExpiresAt: tempPasswordExpiry(),
        ...(r.group ? { enrollments: { create: { groupId: groupIds.get(r.group)! } } } : {}),
      },
    });
    out.push(`"${r.name.replace(/"/g, '""')}",${r.email},${password}`);
  }
  await mkdir(".imports", { recursive: true, mode: 0o700 });
  const target = `.imports/passwords-${Date.now()}.csv`;
  await writeFile(target, out.join("\n") + "\n", { mode: 0o600 });
  await chmod(target, 0o600);
  console.log(`Created ${fresh.length} accounts. Temporary passwords are in ${target}; delete it once handed out.`);
});
