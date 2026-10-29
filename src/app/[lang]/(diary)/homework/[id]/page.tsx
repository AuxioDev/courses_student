import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentStudent } from "@/lib/auth";
import { getHomework } from "@/lib/data";
import { formatDateTime, relativeDue } from "@/lib/dates";
import { fmt, getI18n } from "@/i18n";
import { localePath } from "@/i18n/config";
import { Badge, Card, Section, Skeleton } from "@/components/ui";
import { ChevronLeft } from "@/components/icons";
import { formatScore, homeworkStateTone } from "@/components/status";
import { SubmitForm } from "./submit-form";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.homework.title };
}

export default function HomeworkDetailPage({ params }: PageProps<"/[lang]/homework/[id]">) {
  return (
    <Suspense fallback={<Skeleton rows={3} />}>
      <HomeworkDetail params={params} />
    </Suspense>
  );
}

function LinkList({ urls }: { urls: string[] }) {
  return (
    <ul className="space-y-1">
      {urls.map((url) => (
        <li key={url}>
          <a href={url} target="_blank" rel="noreferrer" className="break-all text-sm text-accent">
            {url}
          </a>
        </li>
      ))}
    </ul>
  );
}

async function HomeworkDetail({ params }: Pick<PageProps<"/[lang]/homework/[id]">, "params">) {
  const [{ locale, t }, student] = await Promise.all([getI18n(), getCurrentStudent()]);
  const { id } = await params;
  const hw = await getHomework(id);
  if (!hw) notFound();
  const tz = student.timezone;
  const submission = hw.submission;
  const canSubmit = hw.state !== "graded";
  const formTitle = !submission ? t.homework.handIn : hw.state === "returned" ? t.homework.resubmit : t.homework.editSubmission;

  return (
    <>
      <Link href={localePath(locale, "/homework")} className="mb-3 inline-flex items-center gap-1 text-sm text-muted">
        <ChevronLeft width={18} height={18} /> {t.homework.title}
      </Link>

      <div className="mb-4">
        <div className="mb-1 flex items-center gap-2">
          <Badge tone={homeworkStateTone[hw.state]}>{t.homework.state[hw.state]}</Badge>
          <span className="text-xs text-muted">{hw.group.course.title}</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{hw.title}</h1>
        <p className="mt-1 text-sm text-muted">
          {fmt(t.homework.due, { date: formatDateTime(hw.dueAt, tz, locale) })} ·{" "}
          {relativeDue(hw.dueAt, new Date(), t.homework.dueRelative)} · {fmt(t.homework.maxPoints, { n: hw.maxScore })}
        </p>
        <p className="text-sm text-muted">
          {hw.group.teacher.name}
          {hw.lesson?.topic && ` · ${fmt(t.homework.fromLesson, { topic: hw.lesson.topic })}`}
        </p>
      </div>

      {hw.description && (
        <Section title={t.homework.task}>
          <Card>
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{hw.description}</p>
          </Card>
        </Section>
      )}

      {hw.attachments.length > 0 && (
        <Section title={t.homework.attachments}>
          <LinkList urls={hw.attachments} />
        </Section>
      )}

      {submission && (submission.status === "graded" || submission.status === "returned") && (
        <Section title={submission.status === "graded" ? t.homework.grade : t.homework.returned}>
          <Card className={submission.status === "graded" ? "bg-good-soft/50" : "bg-warn-soft/50"}>
            {submission.score != null && (
              <p className="font-mono text-3xl font-semibold">
                {formatScore(submission.score)}
                <span className="text-base text-muted">/{hw.maxScore}</span>
              </p>
            )}
            {submission.feedback && <p className="mt-2 whitespace-pre-wrap text-sm">{submission.feedback}</p>}
          </Card>
        </Section>
      )}

      {submission && (
        <Section title={t.homework.yourSubmission}>
          <Card>
            <p className="mb-2 text-xs text-muted">
              {fmt(t.homework.handedIn, { date: formatDateTime(submission.submittedAt, tz, locale) })}
              {submission.status === "late" && ` · ${t.homework.late}`}
            </p>
            {submission.content && <p className="whitespace-pre-wrap text-sm">{submission.content}</p>}
            {submission.files.length > 0 && (
              <div className="mt-2">
                <LinkList urls={submission.files} />
              </div>
            )}
          </Card>
        </Section>
      )}

      {canSubmit && (
        <Section title={formTitle}>
          <SubmitForm
            homeworkId={hw.id}
            defaultContent={submission?.content ?? ""}
            defaultLinks={submission?.files.join("\n") ?? ""}
            submitLabel={submission ? t.homework.submitAgain : t.homework.submit}
            labels={t.homework}
            errors={t.errors}
            ok={t.ok}
          />
        </Section>
      )}
    </>
  );
}
