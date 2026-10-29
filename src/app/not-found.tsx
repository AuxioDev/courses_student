import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center px-6 text-center">
      <h1 className="text-2xl font-semibold">Not found</h1>
      <p className="mt-1 text-sm text-muted">This page doesn&apos;t exist or isn&apos;t yours to see.</p>
      <Link href="/" className="btn mt-6">
        Back to Today
      </Link>
    </main>
  );
}
