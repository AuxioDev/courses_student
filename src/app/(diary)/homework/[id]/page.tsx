import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentStudent } from "@/lib/auth";
import { getHomework } from "@/lib/data";
import { formatDateTime, relativeDue } from "@/lib/dates";
import { Badge, Card, Section, Skeleton } from "@/components/ui";
import { ChevronLeft } from "@/components/icons";
import { formatScore, homeworkStateLabel } from "@/components/status";
import { SubmitForm } from "./submit-form";

export const metadata: Metadata = { title: "Homework" };

export default function HomeworkDetailPage({ params }: PageProps<"/homework/[id]">) {
  return (
    <Suspense fallback={<Skeleton rows={3} />}>
      <HomeworkDetail params={params} />
    </Suspense>
  );
}

async function HomeworkDetail({ params }: Pick<PageProps<"/homework/[id]">, "params">) {
  const student = await getCurrentStudent();
  const { id } = await params;
  const hw = await getHomework(id);
  if (!hw) notFound();
  const tz = student.timezone;
  const state = homeworkStateLabel[hw.state];
  const submission = hw.submission;
  const canSubmit = hw.state !== "graded";

  return (
    <>
      <Link href="/homework" className="mb-3 inline-flex items-center gap-1 text-sm text-muted">
        <ChevronLeft width={18} height={18} /> Homework
      </Link>

      <div className="mb-4">
        <div className="mb-1 flex items-center gap-2">
          <Badge tone={state.tone}>{state.label}</Badge>
          <span className="text-xs text-muted">{hw.group.course.title}</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{hw.title}</h1>
        <p className="mt-1 text-sm text-muted">
          Due {formatDateTime(hw.dueAt, tz)} · {relativeDue(hw.dueAt, new Date())} · max {hw.maxScore} points
        </p>
        <p className="text-sm text-muted">
          {hw.group.teacher.name}
          {hw.lesson?.topic && ` · from “${hw.lesson.topic}”`}
        </p>
      </div>

      {hw.description && (
        <Section title="Task">
          <Card>
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{hw.description}</p>
          </Card>
        </Section>
      )}

      {hw.attachments.length > 0 && (
        <Section title="Attachments">
          <ul className="space-y-1">
            {hw.attachments.map((url) => (
              <li key={url}>
                <a href={url} target="_blank" rel="noreferrer" className="break-all text-sm text-accent">
                  {url}
                </a>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {submission && (submission.status === "graded" || submission.status === "returned") && (
        <Section title={submission.status === "graded" ? "Grade" : "Returned for revision"}>
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
        <Section title="Your submission">
          <Card>
            <p className="mb-2 text-xs text-muted">
              Handed in {formatDateTime(submission.submittedAt, tz)}
              {submission.status === "late" && " · late"}
            </p>
            {submission.content && <p className="whitespace-pre-wrap text-sm">{submission.content}</p>}
            {submission.files.length > 0 && (
              <ul className="mt-2 space-y-1">
                {submission.files.map((url) => (
                  <li key={url}>
                    <a href={url} target="_blank" rel="noreferrer" className="break-all text-sm text-accent">
                      {url}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </Section>
      )}

      {canSubmit && (
        <Section title={submission ? (hw.state === "returned" ? "Resubmit" : "Edit submission") : "Hand in"}>
          <SubmitForm
            homeworkId={hw.id}
            defaultContent={submission?.content ?? ""}
            defaultLinks={submission?.files.join("\n") ?? ""}
            submitLabel={submission ? "Submit again" : "Submit"}
          />
        </Section>
      )}
    </>
  );
}
