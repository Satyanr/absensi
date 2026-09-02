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

  const date = new Date(
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
  return value
    .toISOString()
    .slice(0, 10);
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

      second:
        "2-digit",

      hourCycle:
        "h23",
    }
  ).format(value);
}

function checkInLabel(
  mode: "OFFICE" | "PROJECT",
  status: string | null
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
  status: string | null
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

function getDescription(
  item: {
    attendanceMode:
      | "OFFICE"
      | "PROJECT";

    lateMinutes: number;

    earlyLeaveMinutes:
      number;

    overtimeMinutes:
      number;

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

  const values:
    string[] = [];

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

/*
 * Proteksi CSV / Excel:
 * - escape tanda kutip
 * - cegah formula injection
 */
function csvValue(
  value:
    | string
    | number
    | null
    | undefined
) {
  let text =
    value === null ||
    value === undefined
      ? ""
      : String(value);

  if (
    /^[=+\-@]/.test(text)
  ) {
    text = `'${text}`;
  }

  return `"${text.replace(
    /"/g,
    '""'
  )}"`;
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
    !isValidDateInput(
      from
    ) ||
    !isValidDateInput(
      to
    )
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

  /*
   * Jika filter employee dipakai,
   * pastikan employee ada.
   *
   * Karyawan nonaktif tetap boleh
   * ditarik untuk histori.
   */
  let selectedEmployee:
    | {
        employeeCode:
          string;
      }
    | null = null;

  if (employeeId) {
    selectedEmployee =
      await prisma.employee.findUnique({
        where: {
          id: employeeId,
        },

        select: {
          employeeCode:
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
   * QUERY DATABASE
   * ======================
   */

  const records =
    await prisma.attendanceDay.findMany({
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
              attendanceMode:
                mode,
            }
          : {}),
      },

      select: {
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
            employeeCode:
              true,

            name:
              true,

            active:
              true,
          },
        },
      },

      orderBy: [
        {
          attendanceDate:
            "asc",
        },

        {
          employee: {
            name: "asc",
          },
        },
      ],
    });

  /*
   * ======================
   * CSV
   * ======================
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

  const rows =
    records.map(
      (item) => [
        formatDate(
          item.attendanceDate
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

        item.lateMinutes,

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

        item.earlyLeaveMinutes,

        item.overtimeMinutes,

        getDescription(
          item
        ),
      ]
    );

  /*
   * Kita pakai ; sebagai separator.
   *
   * Ini biasanya lebih nyaman
   * untuk Excel dengan regional
   * setting Indonesia.
   */
  const separator = ";";

  const csv = [
    header
      .map(csvValue)
      .join(separator),

    ...rows.map(
      (row) =>
        row
          .map(csvValue)
          .join(separator)
    ),
  ].join("\r\n");

  /*
   * UTF-8 BOM agar karakter
   * Indonesia aman di Excel.
   */
  const content =
    `\uFEFF${csv}`;

  /*
   * ======================
   * FILENAME
   * ======================
   */

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
    )}.csv`;

  return new NextResponse(
    content,
    {
      status: 200,

      headers: {
        "Content-Type":
          "text/csv; charset=utf-8",

        "Content-Disposition":
          `attachment; filename="${filename}"`,

        "Cache-Control":
          "no-store",
      },
    }
  );
}