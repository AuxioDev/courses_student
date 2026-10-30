import type { Dictionary } from "@/i18n/dictionaries/en";
import { fmt } from "@/i18n/format";
import type { AttendanceLevel, AttendanceThresholds } from "@/lib/grading";

export function AttendanceAlert({
  course,
  rate,
  level,
  settings,
  labels,
}: {
  course: string;
  rate: number;
  level: Exclude<AttendanceLevel, "ok">;
  settings: AttendanceThresholds;
  labels: Dictionary["attendance"];
}) {
  const risk = level === "risk";
  const text = fmt(risk ? labels.risk : labels.warn, {
    course,
    pct: Math.round(rate * 100),
    limit: risk ? settings.attendanceRiskBelow : settings.attendanceWarnBelow,
  });
  return (
    <p role={risk ? "alert" : undefined} className={`rounded-xl px-3 py-2 text-sm ${risk ? "bg-bad-soft text-bad" : "bg-warn-soft text-warn"}`}>
      {text}
    </p>
  );
}
