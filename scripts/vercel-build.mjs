// Runs before `next build` on Vercel. Only production deployments migrate the
// database, so a preview build of a branch can never change it.
import { execSync } from "node:child_process";

if (process.env.VERCEL_ENV === "production") {
  execSync("npx prisma migrate deploy", { stdio: "inherit" });
} else {
  console.log(`Skipping migrations (VERCEL_ENV=${process.env.VERCEL_ENV ?? "unset"})`);
}
