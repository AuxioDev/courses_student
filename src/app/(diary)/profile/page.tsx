import { Suspense } from "react";
import type { Metadata } from "next";
import { getCurrentStudent } from "@/lib/auth";
import { Card, PageTitle, Skeleton } from "@/components/ui";
import { logout } from "../../actions";
import { TimezoneForm } from "./timezone-form";

export const metadata: Metadata = { title: "Profile" };

export default function ProfilePage() {
  return (
    <Suspense fallback={<Skeleton rows={2} />}>
      <Profile />
    </Suspense>
  );
}

async function Profile() {
  const student = await getCurrentStudent();
  const timezones = Intl.supportedValuesOf("timeZone");

  return (
    <>
      <PageTitle title="Profile" />
      <Card className="mb-4">
        <p className="text-lg font-semibold">{student.name}</p>
        <p className="text-sm text-muted">{student.email}</p>
      </Card>
      <Card className="mb-4">
        <TimezoneForm current={student.timezone} timezones={timezones} />
      </Card>
      <form action={logout}>
        <button type="submit" className="btn-ghost w-full text-bad">
          Log out
        </button>
      </form>
    </>
  );
}
