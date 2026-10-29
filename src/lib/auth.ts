import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { db } from "./db";
import { getSession } from "./session";

export type Student = {
  id: string;
  name: string;
  email: string;
  timezone: string;
};

// The Student Diary only accepts students: any other role is sent back to login.
export const getCurrentStudent = cache(async (): Promise<Student> => {
  const session = await getSession();
  if (!session || session.role !== "student") redirect("/login");

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, name: true, email: true, timezone: true, role: true, active: true },
  });
  if (!user || user.role !== "student" || !user.active) redirect("/login");

  return { id: user.id, name: user.name, email: user.email, timezone: user.timezone };
});
