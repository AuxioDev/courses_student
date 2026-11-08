import { notFound } from "next/navigation";

// Unknown addresses get the translated not-found page instead of Next's default.
export default function CatchAll() {
  notFound();
}
