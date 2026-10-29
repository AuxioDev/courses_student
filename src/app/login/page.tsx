import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <div className="mb-8">
        <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-xl font-bold text-accent-ink">
          D
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Student Diary</h1>
        <p className="mt-1 text-sm text-muted">Log in with the account your school gave you.</p>
      </div>
      <LoginForm />
    </main>
  );
}
