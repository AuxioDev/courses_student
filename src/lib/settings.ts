import "server-only";
import { db } from "./db";

const DEFAULTS = { attendanceWarnBelow: 80, attendanceRiskBelow: 70 };

export async function getSchoolSettings() {
  const row = await db.schoolSettings.findUnique({ where: { id: 1 } });
  return {
    attendanceWarnBelow: row?.attendanceWarnBelow ?? DEFAULTS.attendanceWarnBelow,
    attendanceRiskBelow: row?.attendanceRiskBelow ?? DEFAULTS.attendanceRiskBelow,
  };
}
