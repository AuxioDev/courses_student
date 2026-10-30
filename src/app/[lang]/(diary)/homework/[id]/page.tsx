import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentStudent } from "@/lib/auth";
import { getHomework, receiptCode, type HomeworkAttempt } from "@/lib/data";
import { formatDateTime, relativeDue } from "@/lib/dates";
import { fmt, getI18n } from "@/i18n";
import { localePath } from "@/i18n/config";
import { Badge, Card, Section, Skeleton } from "@/components/ui";
import { CheckIcon, ChevronLeft } from "@/components/icons";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { formatScore, homeworkStateTone } from "@/components/status";
import { formatBytes } from "@/lib/upload-policy";
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
  const [latest, ...earlier] = hw.attempts;
  const formTitle = !submission ? t.homework.handIn : hw.state === "returned" ? t.homework.resubmit : t.homework.editSubmission;
  const timing = (a: HomeworkAttempt, index: number) => {
    if (a.late) return { label: t.attempts.late, tone: "bad" as const };
    const before = hw.attempts[index + 1];
    if (before?.outcome === "returned") return { label: t.attempts.afterReturn, tone: "neutral" as const };
    return { label: t.attempts.onTime, tone: "good" as const };
  };

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

      {latest?.outcome && (
        <Section title={latest.outcome === "graded" ? t.homework.grade : t.homework.returned}>
          <Card className={latest.outcome === "graded" ? "bg-good-soft/50" : "bg-warn-soft/50"}>
            {latest.score != null && (
              <p className="font-mono text-3xl font-semibold">
                {formatScore(latest.score)}
                <span className="text-base text-muted">/{hw.maxScore}</span>
              </p>
            )}
            {latest.feedback && <p className="mt-2 whitespace-pre-wrap text-sm">{latest.feedback}</p>}
          </Card>
        </Section>
      )}

      {latest && (
        <Section title={t.homework.yourSubmission}>
          <div className="rounded-2xl border-2 border-good/40 bg-surface p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-1.5 font-semibold text-good">
                  <CheckIcon width={18} height={18} strokeWidth={2.5} /> {t.attempts.receiptTitle}
                </p>
                <p className="mt-0.5 text-sm">
                  {fmt(t.attempts.attempt, { n: latest.number })} · {formatDateTime(latest.submittedAt, tz, locale)}
                </p>
              </div>
              <Badge tone={timing(latest, 0).tone}>{timing(latest, 0).label}</Badge>
            </div>
            <AttemptBody attempt={latest} labels={t.attempts} />
            <p className="mt-3 border-t border-dashed border-line pt-2 font-mono text-xs text-muted">
              {fmt(t.attempts.reference, { code: receiptCode(latest.id) })} · {hw.title}
            </p>
            {!latest.outcome && <p className="mt-1 text-xs text-muted">{t.attempts.waiting} · {t.attempts.receiptHint}</p>}
          </div>
        </Section>
      )}

      {canSubmit && (
        <Section title={formTitle}>
          <SubmitForm
            homeworkId={hw.id}
            studentId={student.id}
            lastSubmittedAt={latest?.submittedAt.getTime() ?? 0}
            defaultContent={latest?.content ?? ""}
            defaultLinks={latest?.links.join("\n") ?? ""}
            files={hw.pendingFiles}
            keepFrom={latest && latest.files.length > 0 ? { number: latest.number, names: latest.files.map((f) => f.name) } : null}
            fileLabels={t.files}
            attemptLabels={t.attempts}
            submitLabel={submission ? t.homework.submitAgain : t.homework.submit}
            labels={t.homework}
            errors={t.errors}
            ok={t.ok}
          />
        </Section>
      )}

      {earlier.length > 0 && (
        <Section title={t.attempts.history}>
          <div className="space-y-2">
            {earlier.map((a, i) => {
              const next = hw.attempts[i];
              const outcome =
                a.outcome === "graded"
                  ? t.attempts.graded
                  : a.outcome === "returned"
                    ? t.attempts.returned
                    : fmt(t.attempts.replaced, { n: next.number });
              return (
                <details key={a.id} className="rounded-2xl border border-line bg-surface">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="font-medium">{fmt(t.attempts.attempt, { n: a.number })}</p>
                      <p className="text-xs text-muted">
                        {formatDateTime(a.submittedAt, tz, locale)} · {timing(a, i + 1).label}
                      </p>
                    </div>
                    <span className="shrink-0 text-right text-xs text-muted">
                      {a.score != null && (
                        <span className="block font-mono text-base font-semibold text-ink">
                          {formatScore(a.score)}/{hw.maxScore}
                        </span>
                      )}
                      {outcome}
                    </span>
                  </summary>
                  <div className="border-t border-line p-4">
                    {a.feedback && (
                      <div className="mb-3 rounded-xl bg-warn-soft/50 p-3 text-sm">
                        <p className="mb-1 text-xs font-semibold text-muted">{t.attempts.feedback}</p>
                        <p className="whitespace-pre-wrap">{a.feedback}</p>
                      </div>
                    )}
                    <AttemptBody attempt={a} labels={t.attempts} />
                  </div>
                </details>
              );
            })}
          </div>
        </Section>
      )}
    </>
  );
}

function AttemptBody({ attempt, labels }: { attempt: HomeworkAttempt; labels: Dictionary["attempts"] }) {
  return (
    <div className="space-y-3 text-sm">
      {attempt.content && (
        <div>
          <p className="mb-0.5 text-xs font-semibold text-muted">{labels.answer}</p>
          <p className="whitespace-pre-wrap">{attempt.content}</p>
        </div>
      )}
      {attempt.files.length > 0 && (
        <div>
          <p className="mb-0.5 text-xs font-semibold text-muted">{labels.files}</p>
          <ul className="space-y-1">
            {attempt.files.map((f) => (
              <li key={f.id} className="flex items-baseline gap-2">
                <a href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" className="truncate text-accent">
                  {f.name}
                </a>
                <span className="shrink-0 text-xs text-muted">{formatBytes(f.size)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {attempt.links.length > 0 && (
        <div>
          <p className="mb-0.5 text-xs font-semibold text-muted">{labels.links}</p>
          <LinkList urls={attempt.links} />
        </div>
      )}
    </div>
  );
}
