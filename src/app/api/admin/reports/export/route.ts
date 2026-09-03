import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";

import { prisma } from "@/lib/prisma";

import { expandApprovedLeaveRows } from "@/lib/reports/leave";

function isValidDateInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function formatDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function formatTime(value: Date | null) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",

    hour: "2-digit",

    minute: "2-digit",

    second: "2-digit",

    hourCycle: "h23",
  }).format(value);
}

function checkInLabel(
  mode: "OFFICE" | "PROJECT",

  status: string | null,
) {
  if (mode === "PROJECT") {
    return "In Project";
  }

  switch (status) {
    case "ON_TIME":
      return "Tepat Waktu";

    case "LATE":
      return "Terlambat";

    case "OVERTIME":
      return "Lembur";

    case "LEGACY":
      return "Legacy";

    default:
      return "";
  }
}

function checkOutLabel(
  mode: "OFFICE" | "PROJECT",

  status: string | null,
) {
  if (mode === "PROJECT") {
    return "Tidak perlu pulang";
  }

  switch (status) {
    case "NORMAL":
      return "Normal";

    case "EARLY_LEAVE":
      return "Pulang Awal";

    case "OVERTIME":
      return "Lembur";

    case "LEGACY":
      return "Legacy";

    default:
      return "Belum Pulang";
  }
}

function leaveLabel(type: "PERMISSION" | "SICK" | "ANNUAL_LEAVE") {
  switch (type) {
    case "PERMISSION":
      return "Izin";

    case "SICK":
      return "Sakit";

    case "ANNUAL_LEAVE":
      return "Cuti";
  }
}

function getAttendanceDescription(item: {
  attendanceMode: "OFFICE" | "PROJECT";

  lateMinutes: number;

  earlyLeaveMinutes: number;

  overtimeMinutes: number;

  notes: string | null;
}) {
  if (item.notes) {
    return item.notes;
  }

  if (item.attendanceMode === "PROJECT") {
    return "In Project";
  }

  const values: string[] = [];

  if (item.lateMinutes > 0) {
    values.push(`Terlambat ${item.lateMinutes} menit`);
  }

  if (item.earlyLeaveMinutes > 0) {
    values.push(`Pulang awal ${item.earlyLeaveMinutes} menit`);
  }

  if (item.overtimeMinutes > 0) {
    values.push(`Lembur ${item.overtimeMinutes} menit`);
  }

  return values.length ? values.join(" | ") : "Normal";
}

/*
 * Proteksi:
 * - CSV escaping
 * - formula injection Excel
 */
function csvValue(value: string | number | null | undefined) {
  let text = value === null || value === undefined ? "" : String(value);

  if (/^[=+\-@]/.test(text)) {
    text = `'${text}`;
  }

  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET(request: NextRequest) {
  /*
   * =====================
   * AUTH
   * =====================
   */

  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      {
        error: "Belum login.",
      },
      {
        status: 401,
      },
    );
  }

  if (user.role !== "ADMIN" && user.role !== "LEADER") {
    return NextResponse.json(
      {
        error: "Tidak memiliki akses.",
      },
      {
        status: 403,
      },
    );
  }

  /*
   * =====================
   * FILTER
   * =====================
   */

  const searchParams = request.nextUrl.searchParams;

  const from = searchParams.get("from");

  const to = searchParams.get("to");

  const employeeId = searchParams.get("employeeId");

  const requestedMode = searchParams.get("mode");

  if (!from || !to || !isValidDateInput(from) || !isValidDateInput(to)) {
    return NextResponse.json(
      {
        error: "Rentang tanggal tidak valid.",
      },
      {
        status: 400,
      },
    );
  }

  const fromDate = new Date(`${from}T00:00:00.000Z`);

  const toDate = new Date(`${to}T00:00:00.000Z`);

  if (fromDate.getTime() > toDate.getTime()) {
    return NextResponse.json(
      {
        error: "Tanggal awal tidak boleh lebih besar dari tanggal akhir.",
      },
      {
        status: 400,
      },
    );
  }

  let mode: "OFFICE" | "PROJECT" | null = null;

  if (requestedMode) {
    if (requestedMode !== "OFFICE" && requestedMode !== "PROJECT") {
      return NextResponse.json(
        {
          error: "Jenis absensi tidak valid.",
        },
        {
          status: 400,
        },
      );
    }

    mode = requestedMode;
  }

  /*
   * Employee nonaktif tetap
   * boleh ditarik untuk histori.
   */
  let selectedEmployee: {
    employeeCode: string;
  } | null = null;

  if (employeeId) {
    selectedEmployee = await prisma.employee.findUnique({
      where: {
        id: employeeId,
      },

      select: {
        employeeCode: true,
      },
    });

    if (!selectedEmployee) {
      return NextResponse.json(
        {
          error: "Karyawan tidak ditemukan.",
        },
        {
          status: 404,
        },
      );
    }
  }

  /*
   * =====================
   * ATTENDANCE
   * =====================
   */

  const attendanceRecords = await prisma.attendanceDay.findMany({
    where: {
      attendanceDate: {
        gte: fromDate,

        lte: toDate,
      },

      ...(employeeId
        ? {
            employeeId,
          }
        : {}),

      ...(mode
        ? {
            attendanceMode: mode,
          }
        : {}),
    },

    select: {
      id: true,

      attendanceDate: true,

      attendanceMode: true,

      checkInAt: true,

      checkOutAt: true,

      checkInStatus: true,

      checkOutStatus: true,

      lateMinutes: true,

      earlyLeaveMinutes: true,

      overtimeMinutes: true,

      notes: true,

      employee: {
        select: {
          id: true,

          employeeCode: true,

          name: true,

          active: true,
        },
      },
    },
  });

  /*
   * =====================
   * LEAVE
   * =====================
   *
   * Leave hanya masuk kalau
   * filter mode = Semua Mode.
   *
   * Hanya APPROVED.
   */

  const leaveRequests = mode
    ? []
    : await prisma.leaveRequest.findMany({
        where: {
          status: "APPROVED",

          startDate: {
            lte: toDate,
          },

          endDate: {
            gte: fromDate,
          },

          ...(employeeId
            ? {
                employeeId,
              }
            : {}),
        },

        select: {
          id: true,
          type: true,
          startDate: true,
          endDate: true,
          reason: true,

          employee: {
            select: {
              id: true,

              employeeCode: true,

              name: true,

              active: true,
            },
          },
        },
      });

  /*
   * =====================
   * NORMALISASI
   * =====================
   */

  const attendanceRows = attendanceRecords.map((item) => ({
    id: `attendance:${item.id}`,

    source: "ATTENDANCE" as const,

    reportDate: item.attendanceDate,

    attendanceMode: item.attendanceMode,

    checkInAt: item.checkInAt,

    checkOutAt: item.checkOutAt,

    checkInStatus: item.checkInStatus,

    checkOutStatus: item.checkOutStatus,

    lateMinutes: item.lateMinutes,

    earlyLeaveMinutes: item.earlyLeaveMinutes,

    overtimeMinutes: item.overtimeMinutes,

    notes: item.notes,

    employee: item.employee,
  }));

  const leaveRows = expandApprovedLeaveRows(leaveRequests, fromDate, toDate);

  const reportRows = [...attendanceRows, ...leaveRows].sort((a, b) => {
    const dateDifference = a.reportDate.getTime() - b.reportDate.getTime();

    if (dateDifference !== 0) {
      return dateDifference;
    }

    return a.employee.name.localeCompare(b.employee.name, "id");
  });

  /*
   * =====================
   * CSV
   * =====================
   */

  const header = [
    "Tanggal",
    "Kode Karyawan",
    "Nama Karyawan",
    "Status Karyawan",
    "Jenis Absensi",
    "Jam Masuk",
    "Status Masuk",
    "Terlambat (Menit)",
    "Jam Pulang",
    "Status Pulang",
    "Pulang Awal (Menit)",
    "Lembur (Menit)",
    "Keterangan",
  ];

  const rows = reportRows.map((item) => {
    if (item.source === "ATTENDANCE") {
      return [
        formatDate(item.reportDate),

        item.employee.employeeCode,

        item.employee.name,

        item.employee.active ? "Aktif" : "Nonaktif",

        item.attendanceMode === "PROJECT" ? "In Project" : "Kantor",

        formatTime(item.checkInAt),

        checkInLabel(item.attendanceMode, item.checkInStatus),

        item.lateMinutes,

        item.attendanceMode === "PROJECT" ? "" : formatTime(item.checkOutAt),

        checkOutLabel(item.attendanceMode, item.checkOutStatus),

        item.earlyLeaveMinutes,

        item.overtimeMinutes,

        getAttendanceDescription(item),
      ];
    }

    /*
     * Izin / Sakit / Cuti
     */
    return [
      formatDate(item.reportDate),

      item.employee.employeeCode,

      item.employee.name,

      item.employee.active ? "Aktif" : "Nonaktif",

      leaveLabel(item.leaveType),

      "",

      "Disetujui",

      "",

      "",

      "",

      "",

      "",

      item.reason,
    ];
  });

  const separator = ";";

  const csv = [
    header.map(csvValue).join(separator),

    ...rows.map((row) => row.map(csvValue).join(separator)),
  ].join("\r\n");

  /*
   * UTF-8 BOM untuk Excel.
   */
  const content = `\uFEFF${csv}`;

  /*
   * =====================
   * FILENAME
   * =====================
   */

  const filenameParts = ["laporan-absensi", from, "sampai", to];

  if (selectedEmployee) {
    filenameParts.push(selectedEmployee.employeeCode);
  }

  if (mode) {
    filenameParts.push(mode === "PROJECT" ? "in-project" : "kantor");
  }

  const filename = `${filenameParts.join("-")}.csv`;

  return new NextResponse(content, {
    status: 200,

    headers: {
      "Content-Type": "text/csv; charset=utf-8",

      "Content-Disposition": `attachment; filename="${filename}"`,

      "Cache-Control": "no-store",
    },
  });
}
