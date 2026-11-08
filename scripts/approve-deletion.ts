// Handles a student's deletion request: lists open requests, or approves one.
// Approval deactivates the account and signs it out; the daily retention job then
// erases the private data. School records (marks, attendance, final grades) stay.
// Usage: npm run privacy:requests
//        npm run privacy:approve-deletion -- student@example.com
import { db, findStudent, run } from "./admin-lib";

run(async () => {
  const email = process.argv[2];
  if (!email) {
    const open = await db.user.findMany({
      where: { deletionRequestedAt: { not: null }, deletionApprovedAt: null },
      select: { name: true, email: true, deletionRequestedAt: true },
    });
    console.log(open.length ? open.map((u) => `${u.deletionRequestedAt!.toISOString()}  ${u.email}  ${u.name}`).join("\n") : "No open requests.");
    return;
  }
  const user = await findStudent(email);
  const now = new Date();
  await db.user.update({
    where: { id: user.id },
    data: { active: false, deactivatedAt: user.deactivatedAt ?? now, deletionApprovedAt: now, sessionVersion: { increment: 1 } },
  });
  console.log(`Approved for ${user.name}. The private data is erased at the next retention run.`);
});
