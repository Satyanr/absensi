import path from "node:path";

import {
  readFile,
} from "node:fs/promises";

import ExcelJS from "exceljs";

import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  getCurrentUser,
} from "@/lib/auth/session";

import {
  prisma,
} from "@/lib/prisma";

import {
  expandApprovedLeaveRows,
} from "@/lib/reports/leave";

export const runtime =
  "nodejs";

function isValidDateInput(
  value: string
) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      value
    )
  ) {
    return false;
  }

  const date =
    new Date(
      `${value}T00:00:00.000Z`
    );

  return (
    !Number.isNaN(
      date.getTime()
    ) &&
    date
      .toISOString()
      .slice(0, 10) ===
      value
  );
}

function formatDate(
  value: Date
) {
  return new Intl.DateTimeFormat(
    "id-ID",
    {
      timeZone: "UTC",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }
  ).format(value);
}

function formatTime(
  value: Date | null
) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat(
    "id-ID",
    {
      timeZone:
        "Asia/Jakarta",

      hour:
        "2-digit",

      minute:
        "2-digit",

      hourCycle:
        "h23",
    }
  ).format(value);
}

function checkInLabel(
  mode:
    | "OFFICE"
    | "PROJECT",

  status:
    string | null
) {
  if (
    mode === "PROJECT"
  ) {
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
  mode:
    | "OFFICE"
    | "PROJECT",

  status:
    string | null
) {
  if (
    mode === "PROJECT"
  ) {
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

function leaveLabel(
  type:
    | "PERMISSION"
    | "SICK"
    | "ANNUAL_LEAVE"
) {
  switch (type) {
    case "PERMISSION":
      return "Izin";

    case "SICK":
      return "Sakit";

    case "ANNUAL_LEAVE":
      return "Cuti";
  }
}

function getDescription(
  item: {
    attendanceMode:
      | "OFFICE"
      | "PROJECT";

    lateMinutes: number;
    earlyLeaveMinutes: number;
    overtimeMinutes: number;

    notes: string | null;
  }
) {
  if (item.notes) {
    return item.notes;
  }

  if (
    item.attendanceMode ===
    "PROJECT"
  ) {
    return "In Project";
  }

  const values: string[] =
    [];

  if (
    item.lateMinutes > 0
  ) {
    values.push(
      `Terlambat ${item.lateMinutes} menit`
    );
  }

  if (
    item.earlyLeaveMinutes >
    0
  ) {
    values.push(
      `Pulang awal ${item.earlyLeaveMinutes} menit`
    );
  }

  if (
    item.overtimeMinutes >
    0
  ) {
    values.push(
      `Lembur ${item.overtimeMinutes} menit`
    );
  }

  return values.length
    ? values.join(" | ")
    : "Normal";
}

type PhotoData = {
  storageDisk: string;
  storagePath: string;
  mimeType: string;
};

function getExcelImageExtension(
  mimeType: string
):
  | "jpeg"
  | "png"
  | "gif"
  | null {
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
  photo: PhotoData | null
) {
  const cell =
    worksheet.getCell(
      rowNumber,
      columnNumber
    );

  if (!photo) {
    cell.value = "—";

    return;
  }

  if (
    photo.storageDisk !==
    "local"
  ) {
    cell.value =
      "Storage tidak didukung";

    return;
  }

  const extension =
    getExcelImageExtension(
      photo.mimeType
    );

  /*
   * ExcelJS tidak bisa langsung
   * menanam HEIC/HEIF/WEBP.
   */
  if (!extension) {
    cell.value =
      "Tersedia di Admin";

    return;
  }

  const configuredRoot =
    process.env
      .ATTENDANCE_STORAGE_PATH ??
    "./storage/attendance";

  const storageRoot =
    path.isAbsolute(
      configuredRoot
    )
      ? configuredRoot
      : path.resolve(
          process.cwd(),
          configuredRoot
        );

  const absolutePath =
    path.resolve(
      storageRoot,
      photo.storagePath
    );

  const relative =
    path.relative(
      storageRoot,
      absolutePath
    );

  /*
   * Proteksi path traversal.
   */
  if (
    relative.startsWith("..") ||
    path.isAbsolute(relative)
  ) {
    cell.value =
      "Path foto tidak valid";

    return;
  }

  try {
    const buffer =
      await readFile(
        absolutePath
      );

    const imageId =
      workbook.addImage({
        buffer,
        extension,
      });

    /*
     * ExcelJS memakai posisi
     * kolom/baris mulai dari 0.
     */
    worksheet.addImage(
      imageId,
      {
        tl: {
          col:
            columnNumber -
            1 +
            0.1,

          row:
            rowNumber -
            1 +
            0.1,
        },

        ext: {
          width: 72,
          height: 72,
        },

        editAs:
          "oneCell",
      }
    );

    cell.value = "";

    const row =
      worksheet.getRow(
        rowNumber
      );

    row.height =
      Math.max(
        row.height ?? 15,
        60
      );
  } catch (error) {
    console.error(error);

    cell.value =
      "Foto tidak ditemukan";
  }
}

export async function GET(
  request: NextRequest
) {
  /*
   * ======================
   * AUTH
   * ======================
   */

  const user =
    await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      {
        error:
          "Belum login.",
      },
      {
        status: 401,
      }
    );
  }

  if (
    user.role === "EMPLOYEE"
  ) {
    return NextResponse.json(
      {
        error:
          "Tidak memiliki akses.",
      },
      {
        status: 403,
      }
    );
  }

  /*
   * ======================
   * FILTER
   * ======================
   */

  const searchParams =
    request.nextUrl
      .searchParams;

  const from =
    searchParams.get(
      "from"
    );

  const to =
    searchParams.get(
      "to"
    );

  const employeeId =
    searchParams.get(
      "employeeId"
    );

  const requestedMode =
    searchParams.get(
      "mode"
    );

  if (
    !from ||
    !to ||
    !isValidDateInput(from) ||
    !isValidDateInput(to)
  ) {
    return NextResponse.json(
      {
        error:
          "Rentang tanggal tidak valid.",
      },
      {
        status: 400,
      }
    );
  }

  const fromDate =
    new Date(
      `${from}T00:00:00.000Z`
    );

  const toDate =
    new Date(
      `${to}T00:00:00.000Z`
    );

  if (
    fromDate.getTime() >
    toDate.getTime()
  ) {
    return NextResponse.json(
      {
        error:
          "Tanggal awal tidak boleh lebih besar dari tanggal akhir.",
      },
      {
        status: 400,
      }
    );
  }

  let mode:
    | "OFFICE"
    | "PROJECT"
    | null = null;

  if (requestedMode) {
    if (
      requestedMode !==
        "OFFICE" &&
      requestedMode !==
        "PROJECT"
    ) {
      return NextResponse.json(
        {
          error:
            "Jenis absensi tidak valid.",
        },
        {
          status: 400,
        }
      );
    }

    mode =
      requestedMode;
  }

  let selectedEmployee:
    | {
        employeeCode:
          string;

        name:
          string;
      }
    | null = null;

  if (employeeId) {
    selectedEmployee =
      await prisma.employee.findUnique({
        where: {
          id:
            employeeId,
        },

        select: {
          employeeCode:
            true,

          name:
            true,
        },
      });

    if (
      !selectedEmployee
    ) {
      return NextResponse.json(
        {
          error:
            "Karyawan tidak ditemukan.",
        },
        {
          status: 404,
        }
      );
    }
  }

  /*
   * ======================
   * ATTENDANCE
   * ======================
   */

  const attendanceDays =
    await prisma.attendanceDay.findMany({
      where: {
        attendanceDate: {
          gte:
            fromDate,

          lte:
            toDate,
        },

        ...(employeeId
          ? {
              employeeId,
            }
          : {}),

        ...(mode
          ? {
              attendanceMode:
                mode,
            }
          : {}),
      },

      select: {
        id: true,

        attendanceDate:
          true,

        attendanceMode:
          true,

        checkInAt:
          true,

        checkOutAt:
          true,

        checkInStatus:
          true,

        checkOutStatus:
          true,

        lateMinutes:
          true,

        earlyLeaveMinutes:
          true,

        overtimeMinutes:
          true,

        notes:
          true,

        employee: {
          select: {
            id: true,

            employeeCode:
              true,

            name:
              true,

            active:
              true,
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

            photo: {
              select: {
                storageDisk:
                  true,

                storagePath:
                  true,

                mimeType:
                  true,
              },
            },
          },

          orderBy: {
            serverReceivedAt:
              "asc",
          },
        },
      },
    });

  /*
   * ======================
   * IZIN / SAKIT / CUTI
   * ======================
   */

  const leaveRequests =
    mode
      ? []
      : await prisma.leaveRequest.findMany({
          where: {
            status:
              "APPROVED",

            startDate: {
              lte:
                toDate,
            },

            endDate: {
              gte:
                fromDate,
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

                employeeCode:
                  true,

                name:
                  true,

                active:
                  true,
              },
            },
          },
        });

  /*
   * ======================
   * NORMALISASI DATA
   * ======================
   */

  const attendanceRows =
    attendanceDays.map(
      (item) => ({
        id:
          `attendance:${item.id}`,

        source:
          "ATTENDANCE" as const,

        reportDate:
          item.attendanceDate,

        attendanceMode:
          item.attendanceMode,

        checkInAt:
          item.checkInAt,

        checkOutAt:
          item.checkOutAt,

        checkInStatus:
          item.checkInStatus,

        checkOutStatus:
          item.checkOutStatus,

        lateMinutes:
          item.lateMinutes,

        earlyLeaveMinutes:
          item.earlyLeaveMinutes,

        overtimeMinutes:
          item.overtimeMinutes,

        notes:
          item.notes,

        employee:
          item.employee,

        checkInPhoto:
          item.events.find(
            (event) =>
              event.eventType ===
              "CHECK_IN"
          )?.photo ??
          null,

        checkOutPhoto:
          item.events.find(
            (event) =>
              event.eventType ===
              "CHECK_OUT"
          )?.photo ??
          null,
      })
    );

  const leaveRows =
    expandApprovedLeaveRows(
      leaveRequests,
      fromDate,
      toDate
    );

  const reportRows = [
    ...attendanceRows,
    ...leaveRows,
  ].sort((a, b) => {
    const dateDifference =
      a.reportDate.getTime() -
      b.reportDate.getTime();

    if (
      dateDifference !== 0
    ) {
      return dateDifference;
    }

    return a.employee.name
      .localeCompare(
        b.employee.name,
        "id"
      );
  });

  /*
   * ======================
   * EXCEL
   * ======================
   */

  const workbook =
    new ExcelJS.Workbook();

  workbook.creator =
    "Sistem Absensi";

  workbook.created =
    new Date();

  const worksheet =
    workbook.addWorksheet(
      "Laporan Absensi",
      {
        views: [
          {
            state:
              "frozen",

            ySplit:
              6,
          },
        ],
      }
    );

  worksheet.pageSetup = {
    orientation:
      "landscape",

    fitToPage:
      true,

    fitToWidth:
      1,

    fitToHeight:
      0,

    paperSize:
      9,
  };

  /*
   * ======================
   * HEADER LAPORAN
   * ======================
   */

  worksheet.mergeCells(
    "A1:O1"
  );

  const titleCell =
    worksheet.getCell(
      "A1"
    );

  titleCell.value =
    "LAPORAN ABSENSI KARYAWAN";

  titleCell.font = {
    bold: true,
    size: 16,
  };

  titleCell.alignment = {
    vertical:
      "middle",

    horizontal:
      "center",
  };

  worksheet.getRow(1)
    .height = 26;

  worksheet.mergeCells(
    "A2:O2"
  );

  worksheet.getCell(
    "A2"
  ).value =
    `Periode: ${formatDate(
      fromDate
    )} - ${formatDate(
      toDate
    )}`;

  worksheet.mergeCells(
    "A3:O3"
  );

  worksheet.getCell(
    "A3"
  ).value =
    `Karyawan: ${
      selectedEmployee
        ? `${selectedEmployee.employeeCode} - ${selectedEmployee.name}`
        : "Semua Karyawan"
    }`;

  worksheet.mergeCells(
    "A4:O4"
  );

  worksheet.getCell(
    "A4"
  ).value =
    `Jenis: ${
      mode === "OFFICE"
        ? "Kantor"
        : mode ===
            "PROJECT"
          ? "In Project"
          : "Semua"
    }`;

  for (
    const rowNumber of [
      2,
      3,
      4,
    ]
  ) {
    worksheet.getCell(
      rowNumber,
      1
    ).alignment = {
      vertical:
        "middle",
    };
  }

  /*
   * Baris 5 sengaja kosong.
   */

  const headerRow =
    worksheet.getRow(6);

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

  headerRow.height =
    28;

  headerRow.alignment = {
    vertical:
      "middle",

    horizontal:
      "center",

    wrapText:
      true,
  };

  headerRow.fill = {
    type:
      "pattern",

    pattern:
      "solid",

    fgColor: {
      argb:
        "FFE5E7EB",
    },
  };

  headerRow.eachCell(
    (cell) => {
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
    }
  );

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
      width: 38,
    },
  ];

  /*
   * ======================
   * DATA
   * ======================
   */

  let rowNumber = 7;

  for (
    const item of
    reportRows
  ) {
    const row =
      worksheet.getRow(
        rowNumber
      );

    if (
      item.source ===
      "ATTENDANCE"
    ) {
      row.values = [
        formatDate(
          item.reportDate
        ),

        item.employee
          .employeeCode,

        item.employee.name,

        item.employee.active
          ? "Aktif"
          : "Nonaktif",

        item.attendanceMode ===
        "PROJECT"
          ? "In Project"
          : "Kantor",

        formatTime(
          item.checkInAt
        ),

        checkInLabel(
          item.attendanceMode,
          item.checkInStatus
        ),

        item.lateMinutes
          ? `${item.lateMinutes} menit`
          : "",

        item.attendanceMode ===
        "PROJECT"
          ? ""
          : formatTime(
              item.checkOutAt
            ),

        checkOutLabel(
          item.attendanceMode,
          item.checkOutStatus
        ),

        item.earlyLeaveMinutes
          ? `${item.earlyLeaveMinutes} menit`
          : "",

        item.overtimeMinutes
          ? `${item.overtimeMinutes} menit`
          : "",

        "",

        "",

        getDescription(
          item
        ),
      ];

      await addPhotoToExcel(
        workbook,
        worksheet,
        rowNumber,
        13,
        item.checkInPhoto
      );

      await addPhotoToExcel(
        workbook,
        worksheet,
        rowNumber,
        14,
        item.checkOutPhoto
      );
    } else {
      row.values = [
        formatDate(
          item.reportDate
        ),

        item.employee
          .employeeCode,

        item.employee.name,

        item.employee.active
          ? "Aktif"
          : "Nonaktif",

        leaveLabel(
          item.leaveType
        ),

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
      vertical:
        "middle",

      wrapText:
        true,
    };

    row.eachCell(
      {
        includeEmpty:
          true,
      },
      (cell) => {
        cell.border = {
          top: {
            style:
              "hair",
          },

          left: {
            style:
              "hair",
          },

          bottom: {
            style:
              "hair",
          },

          right: {
            style:
              "hair",
          },
        };
      }
    );

    rowNumber++;
  }

  /*
   * ======================
   * FOOTER
   * ======================
   */

  const footerRow =
    worksheet.getRow(
      rowNumber + 1
    );

  footerRow.getCell(1)
    .value =
    `Total data: ${reportRows.length}`;

  footerRow.getCell(1)
    .font = {
      bold: true,
    };

  /*
   * ======================
   * OUTPUT
   * ======================
   */

  const buffer =
    await workbook.xlsx
      .writeBuffer();

  const filenameParts = [
    "laporan-absensi",
    from,
    "sampai",
    to,
  ];

  if (
    selectedEmployee
  ) {
    filenameParts.push(
      selectedEmployee
        .employeeCode
    );
  }

  if (mode) {
    filenameParts.push(
      mode === "PROJECT"
        ? "in-project"
        : "kantor"
    );
  }

  const filename =
    `${filenameParts.join(
      "-"
    )}.xlsx`;

  return new NextResponse(
    new Uint8Array(
      buffer
    ),
    {
      status: 200,

      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",

        "Content-Disposition":
          `attachment; filename="${filename}"`,

        "Cache-Control":
          "private, no-store",
      },
    }
  );
}