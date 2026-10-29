import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { getCurrentStudent } from "@/lib/auth";
import { getHomeworkList, type HomeworkItem } from "@/lib/data";
import { formatDateTime, relativeDue } from "@/lib/dates";
import { fmt, getI18n } from "@/i18n";
import { localePath } from "@/i18n/config";
import { Badge, Card, Empty, PageTitle, Skeleton } from "@/components/ui";
import { formatScore, homeworkStateTone } from "@/components/status";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.homework.title };
}

const tabs = [
  { id: "todo", match: (hw: HomeworkItem) => hw.state === "todo" || hw.state === "returned" },
  { id: "submitted", match: (hw: HomeworkItem) => hw.state === "submitted" },
  { id: "graded", match: (hw: HomeworkItem) => hw.state === "graded" },
  { id: "overdue", match: (hw: HomeworkItem) => hw.state === "overdue" },
] as const;

export default function HomeworkPage({ searchParams }: PageProps<"/[lang]/homework">) {
  return (
    <Suspense fallback={<Skeleton rows={4} />}>
      <HomeworkList searchParams={searchParams} />
    </Suspense>
  );
}

async function HomeworkList({ searchParams }: Pick<PageProps<"/[lang]/homework">, "searchParams">) {
  const [{ locale, t }, student] = await Promise.all([getI18n(), getCurrentStudent()]);
  const { tab: tabParam } = await searchParams;
  const tab = tabs.find((t) => t.id === tabParam) ?? tabs[0];
  const all = await getHomeworkList();
  const now = new Date();
  // Graded work reads newest first; everything else by nearest deadline.
  const items = all.filter(tab.match);
  if (tab.id === "graded") items.reverse();

  return (
    <>
      <PageTitle title={t.homework.title} />
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {tabs.map((tb) => {
          const count = all.filter(tb.match).length;
          const active = tb.id === tab.id;
          return (
            <Link
              key={tb.id}
              href={localePath(locale, `/homework?tab=${tb.id}`)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium ${
                active ? "border-accent bg-accent text-accent-ink" : "border-line bg-surface text-ink"
              }`}
            >
              {t.homework.tabs[tb.id]}
              {count > 0 && <span className={active ? "ml-1 opacity-80" : "ml-1 text-muted"}>{count}</span>}
            </Link>
          );
        })}
      </div>

      {items.length === 0 ? (
        <Empty>{t.common.nothingHere}</Empty>
      ) : (
        <ul className="space-y-2">
          {items.map((hw) => (
            <li key={hw.id}>
              <Link href={localePath(locale, `/homework/${hw.id}`)} className="block">
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
                      <Badge tone={homeworkStateTone[hw.state]}>{t.homework.state[hw.state]}</Badge>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-muted">
                    {fmt(t.homework.due, { date: formatDateTime(hw.dueAt, student.timezone, locale) })}
                    {(hw.state === "todo" || hw.state === "returned" || hw.state === "overdue") &&
                      ` · ${relativeDue(hw.dueAt, now, t.homework.dueRelative)}`}
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
