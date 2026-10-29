// Gives a student a temporary password. They must choose their own at next login,
// and every device they were signed in on is signed out.
// Usage: npm run auth:temp-password -- student@example.com
import { randomBytes } from "node:crypto";
import { db, findStudent, hash, run } from "./admin-lib";

const WORDS = ["kite", "moss", "lamp", "reef", "fern", "dune", "mint", "opal", "pine", "wave", "jade", "bolt"];

function tempPassword() {
  const pick = () => WORDS[randomBytes(1)[0] % WORDS.length];
  const digits = String(randomBytes(2).readUInt16BE(0) % 10000).padStart(4, "0");
  return `${pick()}-${digits}-${pick()}`;
}

run(async () => {
  const user = await findStudent(process.argv[2]);
  const password = tempPassword();
  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await hash(password), mustChangePassword: true, sessionVersion: { increment: 1 } },
  });
  console.log(`Temporary password for ${user.name} <${user.email}>: ${password}`);
  console.log("They will be asked to choose their own password when they log in.");
});
