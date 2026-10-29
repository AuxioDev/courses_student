import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { getCurrentStudent } from "@/lib/auth";
import { getHomeworkList, type HomeworkItem } from "@/lib/data";
import { formatDateTime, relativeDue } from "@/lib/dates";
import { Badge, Card, Empty, PageTitle, Skeleton } from "@/components/ui";
import { formatScore, homeworkStateLabel } from "@/components/status";

export const metadata: Metadata = { title: "Homework" };

const tabs = [
  { id: "todo", label: "To do", match: (hw: HomeworkItem) => hw.state === "todo" || hw.state === "returned" },
  { id: "submitted", label: "Submitted", match: (hw: HomeworkItem) => hw.state === "submitted" },
  { id: "graded", label: "Graded", match: (hw: HomeworkItem) => hw.state === "graded" },
  { id: "overdue", label: "Overdue", match: (hw: HomeworkItem) => hw.state === "overdue" },
] as const;

export default function HomeworkPage({ searchParams }: PageProps<"/homework">) {
  return (
    <Suspense fallback={<Skeleton rows={4} />}>
      <HomeworkList searchParams={searchParams} />
    </Suspense>
  );
}

async function HomeworkList({ searchParams }: Pick<PageProps<"/homework">, "searchParams">) {
  const student = await getCurrentStudent();
  const { tab: tabParam } = await searchParams;
  const tab = tabs.find((t) => t.id === tabParam) ?? tabs[0];
  const all = await getHomeworkList();
  const now = new Date();
  // Graded work reads newest first; everything else by nearest deadline.
  const items = all.filter(tab.match);
  if (tab.id === "graded") items.reverse();

  return (
    <>
      <PageTitle title="Homework" />
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {tabs.map((t) => {
          const count = all.filter(t.match).length;
          const active = t.id === tab.id;
          return (
            <Link
              key={t.id}
              href={`/homework?tab=${t.id}`}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium ${
                active ? "border-accent bg-accent text-accent-ink" : "border-line bg-surface text-ink"
              }`}
            >
              {t.label}
              {count > 0 && <span className={active ? "ml-1 opacity-80" : "ml-1 text-muted"}>{count}</span>}
            </Link>
          );
        })}
      </div>

      {items.length === 0 ? (
        <Empty>Nothing here.</Empty>
      ) : (
        <ul className="space-y-2">
          {items.map((hw) => (
            <li key={hw.id}>
              <Link href={`/homework/${hw.id}`} className="block">
                <Card>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{hw.title}</p>
                      <p className="text-xs text-muted">{hw.group.course.title}</p>
                    </div>
                    {hw.state === "graded" && hw.submission?.score != null ? (
                      <span className="font-mono text-lg font-semibold">
                        {formatScore(hw.submission.score)}
                        <span className="text-sm text-muted">/{hw.maxScore}</span>
                      </span>
                    ) : (
                      <Badge tone={homeworkStateLabel[hw.state].tone}>{homeworkStateLabel[hw.state].label}</Badge>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-muted">
                    Due {formatDateTime(hw.dueAt, student.timezone)}
                    {(hw.state === "todo" || hw.state === "returned" || hw.state === "overdue") &&
                      ` · ${relativeDue(hw.dueAt, now)}`}
                  </p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
