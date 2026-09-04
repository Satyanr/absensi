import path from "node:path";

import { readFile } from "node:fs/promises";

import ExcelJS from "exceljs";

import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";

import { prisma } from "@/lib/prisma";

import { expandApprovedLeaveRows } from "@/lib/reports/leave";

export const runtime = "nodejs";

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
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(value);
}

function formatTime(value: Date | null) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",

    hour: "2-digit",

    minute: "2-digit",

    hourCycle: "h23",
  }).format(value);
}

function getJakartaMinutes(value: Date | null) {
  if (!value) {
    return null;
  }

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",

    hour: "2-digit",

    minute: "2-digit",

    hourCycle: "h23",
  }).formatToParts(value);

  const hour = Number(parts.find((part) => part.type === "hour")?.value);

  const minute = Number(parts.find((part) => part.type === "minute")?.value);

  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return null;
  }

  return hour * 60 + minute;
}

function minutesToClock(value: number | null) {
  if (value === null) {
    return "—";
  }

  const rounded = Math.round(value);

  const hour = Math.floor(rounded / 60);

  const minute = rounded % 60;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
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

function getDescription(item: {
  attendanceMode: "OFFICE" | "PROJECT";

  lateMinutes: number;

  earlyLeaveMinutes: number;

  overtimeMinutes: number;

  notes: string | null;

  checkInLocation: string | null;

  checkOutLocation: string | null;
}) {
  const values: string[] = [];

  if (item.notes) {
    values.push(item.notes);
  } else if (item.attendanceMode === "PROJECT") {
    values.push("In Project");
  } else {
    if (item.lateMinutes > 0) {
      values.push(`Terlambat ${item.lateMinutes} menit`);
    }

    if (item.earlyLeaveMinutes > 0) {
      values.push(`Pulang awal ${item.earlyLeaveMinutes} menit`);
    }

    if (item.overtimeMinutes > 0) {
      values.push(`Lembur ${item.overtimeMinutes} menit`);
    }

    if (values.length === 0) {
      values.push("Normal");
    }
  }

  if (item.checkInLocation) {
    values.push(
      item.attendanceMode === "PROJECT"
        ? `Lokasi: ${item.checkInLocation}`
        : `Lokasi masuk: ${item.checkInLocation}`,
    );
  }

  if (item.attendanceMode === "OFFICE" && item.checkOutLocation) {
    values.push(`Lokasi pulang: ${item.checkOutLocation}`);
  }

  return values.join(" | ");
}

type PhotoData = {
  storageDisk: string;
  storagePath: string;
  mimeType: string;
};

function getExcelImageExtension(
  mimeType: string,
): "jpeg" | "png" | "gif" | null {
  switch (mimeType) {
    case "image/jpeg":
      return "jpeg";

    case "image/png":
      return "png";

    case "image/gif":
      return "gif";

    default:
      return null;
  }
}

async function addPhotoToExcel(
  workbook: ExcelJS.Workbook,
  worksheet: ExcelJS.Worksheet,
  rowNumber: number,
  columnNumber: number,
  photo: PhotoData | null,
) {
  const cell = worksheet.getCell(rowNumber, columnNumber);

  if (!photo) {
    cell.value = "—";

    return;
  }

  if (photo.storageDisk !== "local") {
    cell.value = "Storage tidak didukung";

    return;
  }

  const extension = getExcelImageExtension(photo.mimeType);

  /*
   * ExcelJS tidak bisa langsung
   * menanam HEIC/HEIF/WEBP.
   */
  if (!extension) {
    cell.value = "Tersedia di Admin";

    return;
  }

  const configuredRoot =
    process.env.ATTENDANCE_STORAGE_PATH ?? "./storage/attendance";

  const storageRoot = path.isAbsolute(configuredRoot)
    ? configuredRoot
    : path.resolve(
        /*turbopackIgnore: true*/
        process.cwd(),
        configuredRoot,
      );

  const absolutePath = path.resolve(
    /*turbopackIgnore: true*/
    storageRoot,
    photo.storagePath,
  );

  const relative = path.relative(storageRoot, absolutePath);

  /*
   * Proteksi path traversal.
   */
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    cell.value = "Path foto tidak valid";

    return;
  }

  try {
    const buffer = await readFile(absolutePath);

    /*
     * Pakai base64 agar tidak bentrok
     * antara typing Buffer ExcelJS
     * dan @types/node v24.
     */
    const base64 = `data:${photo.mimeType};base64,${buffer.toString("base64")}`;

    const imageId = workbook.addImage({
      base64,
      extension,
    });

    /*
     * ExcelJS memakai posisi
     * kolom/baris mulai dari 0.
     */
    worksheet.addImage(imageId, {
      tl: {
        col: columnNumber - 1 + 0.1,

        row: rowNumber - 1 + 0.1,
      },

      ext: {
        width: 72,
        height: 72,
      },

      editAs: "oneCell",
    });

    cell.value = "";

    const row = worksheet.getRow(rowNumber);

    row.height = Math.max(row.height ?? 15, 60);
  } catch (error) {
    console.error(error);

    cell.value = "Foto tidak ditemukan";
  }
}

export async function GET(request: NextRequest) {
  /*
   * ======================
   * AUTH
   * ======================
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
   * ======================
   * FILTER
   * ======================
   */

  const searchParams = request.nextUrl.searchParams;

  const from = searchParams.get("from");

  const to = searchParams.get("to");

  const employeeId = searchParams.get("employeeId");

  const requestedMode = searchParams.get("mode");

  const requestedEmploymentType = searchParams.get("employmentType");

  let employmentType: "EMPLOYEE" | "INTERN" | null = null;

  if (requestedEmploymentType) {
    if (
      requestedEmploymentType !== "EMPLOYEE" &&
      requestedEmploymentType !== "INTERN"
    ) {
      return NextResponse.json(
        {
          error: "Jenis personel tidak valid.",
        },
        {
          status: 400,
        },
      );
    }

    employmentType = requestedEmploymentType;
  }

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

  let selectedEmployee: {
    employeeCode: string;

    name: string;
  } | null = null;

  if (employeeId) {
    selectedEmployee = await prisma.employee.findUnique({
      where: {
        id: employeeId,
      },

      select: {
        employeeCode: true,

        name: true,
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
   * ======================
   * ATTENDANCE
   * ======================
   */

  const attendanceDays = await prisma.attendanceDay.findMany({
    where: {
      attendanceDate: {
        gte: fromDate,

        lte: toDate,
      },

      ...(employmentType
        ? {
            employee: {
              employmentType,
            },
          }
        : {}),

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

      events: {
        where: {
          photoId: {
            not: null,
          },
        },

        select: {
          id: true,

          eventType: true,

          address: true,

          photo: {
            select: {
              storageDisk: true,

              storagePath: true,

              mimeType: true,
            },
          },
        },

        orderBy: {
          serverReceivedAt: "asc",
        },
      },
    },
  });

  /*
   * ======================
   * IZIN / SAKIT / CUTI
   * ======================
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

          ...(employmentType
            ? {
                employee: {
                  employmentType,
                },
              }
            : {}),

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
   * ======================
   * NORMALISASI DATA
   * ======================
   */

  const attendanceRows = attendanceDays.map((item) => ({
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

    checkInLocation:
      item.events.find((event) => event.eventType === "CHECK_IN")?.address ??
      null,

    checkOutLocation:
      item.events.find((event) => event.eventType === "CHECK_OUT")?.address ??
      null,

    checkInPhoto:
      item.events.find((event) => event.eventType === "CHECK_IN")?.photo ??
      null,

    checkOutPhoto:
      item.events.find((event) => event.eventType === "CHECK_OUT")?.photo ??
      null,
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
   * ======================
   * RANKING & REWARD
   * ======================
   */

  type RewardStat = {
    employeeId: string;
    employeeCode: string;
    name: string;
    active: boolean;

    totalAttendance: number;

    officeDays: number;
    projectDays: number;

    onTimeDays: number;
    lateDays: number;

    totalOfficeCheckInMinutes: number;

    officeCheckInCount: number;
  };

  const rewardMap = new Map<string, RewardStat>();

  for (const item of attendanceDays) {
    let stat = rewardMap.get(item.employee.id);

    if (!stat) {
      stat = {
        employeeId: item.employee.id,

        employeeCode: item.employee.employeeCode,

        name: item.employee.name,

        active: item.employee.active,

        totalAttendance: 0,

        officeDays: 0,
        projectDays: 0,

        onTimeDays: 0,
        lateDays: 0,

        totalOfficeCheckInMinutes: 0,

        officeCheckInCount: 0,
      };

      rewardMap.set(item.employee.id, stat);
    }

    stat.totalAttendance += 1;

    if (item.attendanceMode === "PROJECT") {
      stat.projectDays += 1;

      continue;
    }

    stat.officeDays += 1;

    if (item.checkInStatus === "ON_TIME") {
      stat.onTimeDays += 1;
    }

    if (item.checkInStatus === "LATE") {
      stat.lateDays += 1;
    }

    const checkInMinutes = getJakartaMinutes(item.checkInAt);

    if (checkInMinutes !== null) {
      stat.totalOfficeCheckInMinutes += checkInMinutes;

      stat.officeCheckInCount += 1;
    }
  }

  const rewardStats = Array.from(rewardMap.values()).map((item) => ({
    ...item,

    averageOfficeCheckInMinutes:
      item.officeCheckInCount > 0
        ? item.totalOfficeCheckInMinutes / item.officeCheckInCount
        : null,
  }));

  /*
   * Kehadiran terbanyak.
   *
   * Tie breaker:
   * 1. Tepat waktu lebih banyak.
   * 2. Rata-rata datang lebih pagi.
   */
  const attendanceRanking = [...rewardStats].sort((a, b) => {
    if (b.totalAttendance !== a.totalAttendance) {
      return b.totalAttendance - a.totalAttendance;
    }

    if (b.onTimeDays !== a.onTimeDays) {
      return b.onTimeDays - a.onTimeDays;
    }

    const aAverage = a.averageOfficeCheckInMinutes ?? Number.MAX_SAFE_INTEGER;

    const bAverage = b.averageOfficeCheckInMinutes ?? Number.MAX_SAFE_INTEGER;

    if (aAverage !== bAverage) {
      return aAverage - bAverage;
    }

    return a.name.localeCompare(b.name, "id");
  });

  /*
   * Ranking paling pagi:
   * hanya absensi OFFICE.
   *
   * Menggunakan RATA-RATA,
   * bukan satu hari paling pagi,
   * supaya lebih adil.
   */
  const earlyRanking = rewardStats
    .filter((item) => item.averageOfficeCheckInMinutes !== null)
    .sort((a, b) => {
      const aAverage = a.averageOfficeCheckInMinutes ?? Number.MAX_SAFE_INTEGER;

      const bAverage = b.averageOfficeCheckInMinutes ?? Number.MAX_SAFE_INTEGER;

      if (aAverage !== bAverage) {
        return aAverage - bAverage;
      }

      if (b.officeDays !== a.officeDays) {
        return b.officeDays - a.officeDays;
      }

      if (b.onTimeDays !== a.onTimeDays) {
        return b.onTimeDays - a.onTimeDays;
      }

      return a.name.localeCompare(b.name, "id");
    });

  /*
   * ======================
   * EXCEL
   * ======================
   */

  const workbook = new ExcelJS.Workbook();

  workbook.creator = "Sistem Absensi";

  workbook.created = new Date();

  const worksheet = workbook.addWorksheet("Laporan Absensi", {
    views: [
      {
        state: "frozen",

        ySplit: 6,
      },
    ],
  });

  worksheet.pageSetup = {
    orientation: "landscape",

    fitToPage: true,

    fitToWidth: 1,

    fitToHeight: 0,

    paperSize: 9,
  };

  /*
   * ======================
   * HEADER LAPORAN
   * ======================
   */

  worksheet.mergeCells("A1:O1");

  const titleCell = worksheet.getCell("A1");

  titleCell.value = "LAPORAN ABSENSI PERSONEL";

  titleCell.font = {
    bold: true,
    size: 16,
  };

  titleCell.alignment = {
    vertical: "middle",

    horizontal: "center",
  };

  worksheet.getRow(1).height = 26;

  worksheet.mergeCells("A2:O2");

  worksheet.getCell("A2").value = `Periode: ${formatDate(
    fromDate,
  )} - ${formatDate(toDate)}`;

  worksheet.mergeCells("A3:O3");

  worksheet.getCell("A3").value = `Jenis Personel: ${
    employmentType === "EMPLOYEE"
      ? "Karyawan"
      : employmentType === "INTERN"
        ? "Magang"
        : "Semua Personel"
  } | Personel: ${
    selectedEmployee
      ? `${selectedEmployee.employeeCode} - ${selectedEmployee.name}`
      : "Semua Personel"
  }`;

  worksheet.mergeCells("A4:O4");

  worksheet.getCell("A4").value = `Jenis: ${
    mode === "OFFICE" ? "Kantor" : mode === "PROJECT" ? "In Project" : "Semua"
  }`;

  for (const rowNumber of [2, 3, 4]) {
    worksheet.getCell(rowNumber, 1).alignment = {
      vertical: "middle",
    };
  }

  /*
   * Baris 5 sengaja kosong.
   */

  const headerRow = worksheet.getRow(6);

  headerRow.values = [
    "Tanggal",

    "Kode Karyawan",

    "Nama Karyawan",

    "Status Karyawan",

    "Jenis",

    "Jam Masuk",

    "Status Masuk",

    "Terlambat",

    "Jam Pulang",

    "Status Pulang",

    "Pulang Awal",

    "Lembur",

    "Selfie Masuk",

    "Selfie Pulang",

    "Keterangan",
  ];

  headerRow.font = {
    bold: true,
  };

  headerRow.height = 28;

  headerRow.alignment = {
    vertical: "middle",

    horizontal: "center",

    wrapText: true,
  };

  headerRow.fill = {
    type: "pattern",

    pattern: "solid",

    fgColor: {
      argb: "FFE5E7EB",
    },
  };

  headerRow.eachCell((cell) => {
    cell.border = {
      top: {
        style: "thin",
      },

      left: {
        style: "thin",
      },

      bottom: {
        style: "thin",
      },

      right: {
        style: "thin",
      },
    };
  });

  worksheet.autoFilter = {
    from: "A6",
    to: "O6",
  };

  worksheet.columns = [
    {
      key: "date",
      width: 14,
    },

    {
      key: "code",
      width: 16,
    },

    {
      key: "name",
      width: 25,
    },

    {
      key: "employeeStatus",
      width: 14,
    },

    {
      key: "type",
      width: 16,
    },

    {
      key: "checkIn",
      width: 13,
    },

    {
      key: "checkInStatus",
      width: 18,
    },

    {
      key: "late",
      width: 14,
    },

    {
      key: "checkOut",
      width: 13,
    },

    {
      key: "checkOutStatus",
      width: 18,
    },

    {
      key: "earlyLeave",
      width: 14,
    },

    {
      key: "overtime",
      width: 14,
    },

    {
      key: "checkInPhoto",
      width: 15,
    },

    {
      key: "checkOutPhoto",
      width: 15,
    },

    {
      key: "notes",
      width: 55,
    },
  ];

  /*
   * ======================
   * DATA
   * ======================
   */

  let rowNumber = 7;

  for (const item of reportRows) {
    const row = worksheet.getRow(rowNumber);

    if (item.source === "ATTENDANCE") {
      row.values = [
        formatDate(item.reportDate),

        item.employee.employeeCode,

        item.employee.name,

        item.employee.active ? "Aktif" : "Nonaktif",

        item.attendanceMode === "PROJECT" ? "In Project" : "Kantor",

        formatTime(item.checkInAt),

        checkInLabel(item.attendanceMode, item.checkInStatus),

        item.lateMinutes ? `${item.lateMinutes} menit` : "",

        item.attendanceMode === "PROJECT" ? "" : formatTime(item.checkOutAt),

        checkOutLabel(item.attendanceMode, item.checkOutStatus),

        item.earlyLeaveMinutes ? `${item.earlyLeaveMinutes} menit` : "",

        item.overtimeMinutes ? `${item.overtimeMinutes} menit` : "",

        "",

        "",

        getDescription(item),
      ];

      await addPhotoToExcel(
        workbook,
        worksheet,
        rowNumber,
        13,
        item.checkInPhoto,
      );

      await addPhotoToExcel(
        workbook,
        worksheet,
        rowNumber,
        14,
        item.checkOutPhoto,
      );
    } else {
      row.values = [
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

        "—",

        "—",

        item.reason,
      ];
    }

    row.alignment = {
      vertical: "middle",

      wrapText: true,
    };

    row.eachCell(
      {
        includeEmpty: true,
      },
      (cell) => {
        cell.border = {
          top: {
            style: "hair",
          },

          left: {
            style: "hair",
          },

          bottom: {
            style: "hair",
          },

          right: {
            style: "hair",
          },
        };
      },
    );

    rowNumber++;
  }

  /*
   * ======================
   * FOOTER
   * ======================
   */

  const footerRow = worksheet.getRow(rowNumber + 1);

  footerRow.getCell(1).value = `Total data: ${reportRows.length}`;

  footerRow.getCell(1).font = {
    bold: true,
  };

  /*
   * ======================
   * SHEET RANKING
   * ======================
   */

  const rankingSheet = workbook.addWorksheet("Ranking & Reward", {
    views: [
      {
        state: "frozen",

        ySplit: 6,
      },
    ],
  });

  rankingSheet.mergeCells("A1:R1");

  const rankingTitle = rankingSheet.getCell("A1");

  rankingTitle.value = "RANKING & REWARD KARYAWAN";

  rankingTitle.font = {
    bold: true,
    size: 16,
  };

  rankingTitle.alignment = {
    horizontal: "center",

    vertical: "middle",
  };

  rankingSheet.getRow(1).height = 26;

  rankingSheet.mergeCells("A2:R2");

  rankingSheet.getCell("A2").value = `Periode: ${formatDate(
    fromDate,
  )} - ${formatDate(toDate)}`;

  rankingSheet.mergeCells("A3:R3");

  rankingSheet.getCell("A3").value = `Filter: ${
    selectedEmployee
      ? `${selectedEmployee.employeeCode} - ${selectedEmployee.name}`
      : "Semua Karyawan"
  } | ${
    mode === "OFFICE"
      ? "Kantor"
      : mode === "PROJECT"
        ? "In Project"
        : "Semua Mode"
  }`;

  rankingSheet.mergeCells("A4:R4");

  rankingSheet.getCell("A4").value =
    "Catatan: Ranking terpagi hanya menggunakan absensi Kantor karena In Project memiliki waktu fleksibel.";

  /*
   * Judul kedua tabel.
   */

  rankingSheet.mergeCells("A5:I5");

  rankingSheet.getCell("A5").value = "RANKING KEHADIRAN";

  rankingSheet.mergeCells("K5:R5");

  rankingSheet.getCell("K5").value = "RANKING TERPAGI - KANTOR";

  for (const cellAddress of ["A5", "K5"]) {
    const cell = rankingSheet.getCell(cellAddress);

    cell.font = {
      bold: true,
      size: 12,
    };

    cell.alignment = {
      horizontal: "center",

      vertical: "middle",
    };

    cell.fill = {
      type: "pattern",

      pattern: "solid",

      fgColor: {
        argb: "FFDBEAFE",
      },
    };
  }

  /*
   * HEADER KEHADIRAN
   */

  const presenceHeader = rankingSheet.getRow(6);

  [
    "Peringkat",
    "Kode",
    "Nama",
    "Total Hadir",
    "Kantor",
    "In Project",
    "Tepat Waktu",
    "Terlambat",
    "Reward",
  ].forEach((value, index) => {
    presenceHeader.getCell(index + 1).value = value;
  });

  /*
   * Header ranking pagi,
   * mulai kolom K.
   */

  [
    "Peringkat",
    "Kode",
    "Nama",
    "Rata-rata Masuk",
    "Hari Kantor",
    "Tepat Waktu",
    "Terlambat",
    "Reward",
  ].forEach((value, index) => {
    presenceHeader.getCell(index + 11).value = value;
  });

  presenceHeader.font = {
    bold: true,
  };

  presenceHeader.alignment = {
    horizontal: "center",

    vertical: "middle",

    wrapText: true,
  };

  presenceHeader.height = 28;

  presenceHeader.eachCell(
    {
      includeEmpty: true,
    },
    (cell, columnNumber) => {
      /*
       * Kolom J adalah spacer
       * antara dua ranking.
       */
      if (columnNumber === 10) {
        return;
      }

      cell.fill = {
        type: "pattern",

        pattern: "solid",

        fgColor: {
          argb: "FFE5E7EB",
        },
      };

      cell.border = {
        top: {
          style: "thin",
        },

        left: {
          style: "thin",
        },

        bottom: {
          style: "thin",
        },

        right: {
          style: "thin",
        },
      };
    },
  );

  /*
   * Lebar kolom.
   */

  rankingSheet.getColumn("A").width = 11;

  rankingSheet.getColumn("B").width = 16;

  rankingSheet.getColumn("C").width = 27;

  rankingSheet.getColumn("D").width = 14;

  rankingSheet.getColumn("E").width = 12;

  rankingSheet.getColumn("F").width = 14;

  rankingSheet.getColumn("G").width = 15;

  rankingSheet.getColumn("H").width = 14;

  rankingSheet.getColumn("I").width = 24;

  rankingSheet.getColumn("J").width = 3;

  rankingSheet.getColumn("K").width = 11;

  rankingSheet.getColumn("L").width = 16;

  rankingSheet.getColumn("M").width = 27;

  rankingSheet.getColumn("N").width = 18;

  rankingSheet.getColumn("O").width = 14;

  rankingSheet.getColumn("P").width = 15;

  rankingSheet.getColumn("Q").width = 14;

  rankingSheet.getColumn("R").width = 22;

  /*
   * Isi ranking.
   */

  const rankingRows = Math.max(attendanceRanking.length, earlyRanking.length);

  for (let index = 0; index < rankingRows; index++) {
    const rowNumber = index + 7;

    const row = rankingSheet.getRow(rowNumber);

    const presence = attendanceRanking[index];

    if (presence) {
      const rank = index + 1;

      row.getCell(1).value = rank;

      row.getCell(2).value = presence.employeeCode;

      row.getCell(3).value = presence.name;

      row.getCell(4).value = presence.totalAttendance;

      row.getCell(5).value = presence.officeDays;

      row.getCell(6).value = presence.projectDays;

      row.getCell(7).value = presence.onTimeDays;

      row.getCell(8).value = presence.lateDays;

      row.getCell(9).value =
        rank === 1
          ? "Kehadiran Terbaik"
          : rank === 2
            ? "Runner-up Kehadiran"
            : rank === 3
              ? "Top 3 Kehadiran"
              : "";
    }

    const early = earlyRanking[index];

    if (early) {
      const rank = index + 1;

      row.getCell(11).value = rank;

      row.getCell(12).value = early.employeeCode;

      row.getCell(13).value = early.name;

      row.getCell(14).value = minutesToClock(early.averageOfficeCheckInMinutes);

      row.getCell(15).value = early.officeDays;

      row.getCell(16).value = early.onTimeDays;

      row.getCell(17).value = early.lateDays;

      row.getCell(18).value =
        rank === 1
          ? "Paling Pagi"
          : rank === 2
            ? "Runner-up Terpagi"
            : rank === 3
              ? "Top 3 Terpagi"
              : "";
    }

    row.alignment = {
      vertical: "middle",
    };

    /*
     * Highlight Top 3.
     */
    if (index < 3) {
      const fillArgb =
        index === 0 ? "FFFEF3C7" : index === 1 ? "FFF3F4F6" : "FFFED7AA";

      for (let column = 1; column <= 18; column++) {
        if (column === 10) {
          continue;
        }

        row.getCell(column).fill = {
          type: "pattern",

          pattern: "solid",

          fgColor: {
            argb: fillArgb,
          },
        };
      }
    }

    for (let column = 1; column <= 18; column++) {
      if (column === 10) {
        continue;
      }

      row.getCell(column).border = {
        top: {
          style: "hair",
        },

        left: {
          style: "hair",
        },

        bottom: {
          style: "hair",
        },

        right: {
          style: "hair",
        },
      };
    }
  }

  /*
   * Empty-state ranking.
   */

  if (attendanceRanking.length === 0) {
    rankingSheet.mergeCells("A7:I7");

    rankingSheet.getCell("A7").value =
      "Tidak ada data kehadiran pada periode ini.";
  }

  if (earlyRanking.length === 0) {
    rankingSheet.mergeCells("K7:R7");

    rankingSheet.getCell("K7").value =
      mode === "PROJECT"
        ? "Ranking terpagi tidak berlaku untuk In Project."
        : "Tidak ada data absensi Kantor pada periode ini.";
  }

  /*
   * ======================
   * OUTPUT
   * ======================
   */

  const buffer = await workbook.xlsx.writeBuffer();

  const filenameParts = ["laporan-absensi", from, "sampai", to];

  if (selectedEmployee) {
    filenameParts.push(selectedEmployee.employeeCode);
  }

  if (mode) {
    filenameParts.push(mode === "PROJECT" ? "in-project" : "kantor");
  }

  const filename = `${filenameParts.join("-")}.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,

    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",

      "Content-Disposition": `attachment; filename="${filename}"`,

      "Cache-Control": "private, no-store",
    },
  });
}
