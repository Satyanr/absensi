import { CheckInStatus, CheckOutStatus } from "@/generated/prisma/client";

type AttendancePolicyInput = {
  lateAfter: string;
  weekendIsOvertime: boolean;
};

function getParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  });

  const parts = formatter.formatToParts(date);

  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return {
    year: Number(value("year")),
    month: Number(value("month")),
    day: Number(value("day")),
    hour: Number(value("hour")),
    minute: Number(value("minute")),
    weekday: value("weekday"),
  };
}

function timeToMinutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);

  return hour * 60 + minute;
}

export function getAttendanceDate(date: Date, timeZone = "Asia/Jakarta") {
  const parts = getParts(date, timeZone);

  /*
   * AttendanceDate adalah DATE saja.
   * UTC digunakan hanya sebagai representasi stabil untuk Prisma @db.Date.
   */
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}

export function evaluateCheckIn(
  date: Date,
  policy: AttendancePolicyInput,
  timeZone = "Asia/Jakarta",
) {
  const parts = getParts(date, timeZone);

  const currentMinutes = parts.hour * 60 + parts.minute;

  const lateAfterMinutes = timeToMinutes(policy.lateAfter);

  const weekend = parts.weekday === "Sat" || parts.weekday === "Sun";

  if (weekend && policy.weekendIsOvertime) {
    return {
      status: CheckInStatus.OVERTIME,
      lateMinutes: 0,
    };
  }

  if (currentMinutes > lateAfterMinutes) {
    return {
      status: CheckInStatus.LATE,
      lateMinutes: currentMinutes - lateAfterMinutes,
    };
  }

  return {
    status: CheckInStatus.ON_TIME,
    lateMinutes: 0,
  };
}

type CheckOutPolicyInput = {
  workStart: string;
  workEnd: string;
  overtimeAfter: string;
  weekendIsOvertime: boolean;
};

export function evaluateCheckOut(
  date: Date,
  checkInAt: Date,
  policy: CheckOutPolicyInput,
  timeZone = "Asia/Jakarta",
) {
  const parts = getParts(date, timeZone);

  const currentMinutes = parts.hour * 60 + parts.minute;

  const workEndMinutes = timeToMinutes(policy.workEnd);

  const overtimeAfterMinutes = timeToMinutes(policy.overtimeAfter);

  const weekend = parts.weekday === "Sat" || parts.weekday === "Sun";

  /*
   * Policy lama:
   * Sabtu / Minggu dianggap lembur.
   *
   * Untuk weekend, overtimeMinutes dihitung
   * dari durasi check-in sampai check-out.
   */
  if (weekend && policy.weekendIsOvertime) {
    const durationMinutes = Math.max(
      0,
      Math.floor((date.getTime() - checkInAt.getTime()) / 60000),
    );

    return {
      status: CheckOutStatus.OVERTIME,
      earlyLeaveMinutes: 0,
      overtimeMinutes: durationMinutes,
    };
  }

  /*
   * Sebelum jam pulang.
   */
  if (currentMinutes < workEndMinutes) {
    return {
      status: CheckOutStatus.EARLY_LEAVE,

      earlyLeaveMinutes: workEndMinutes - currentMinutes,

      overtimeMinutes: 0,
    };
  }

  /*
   * Sudah melewati threshold lembur.
   */
  if (currentMinutes >= overtimeAfterMinutes) {
    return {
      status: CheckOutStatus.OVERTIME,
      earlyLeaveMinutes: 0,

      overtimeMinutes: currentMinutes - overtimeAfterMinutes,
    };
  }

  /*
   * Misalnya 17:00 - 18:59.
   */
  return {
    status: CheckOutStatus.NORMAL,
    earlyLeaveMinutes: 0,
    overtimeMinutes: 0,
  };
}
