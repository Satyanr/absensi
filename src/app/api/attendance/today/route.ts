import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAttendanceDate } from "@/lib/attendance/time";
import { enforceRateLimit } from "@/lib/security/rate-limit";


export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, {
    scope: "attendance-today",

    limit: 120,

    windowMs: 60 * 1000,

    message: "Terlalu banyak permintaan data kehadiran. Silakan coba kembali.",
  });

  if (limited) {
    return limited;
  }

  const employeeCode = request.nextUrl.searchParams.get("employeeCode");

  if (!employeeCode) {
    return NextResponse.json(
      { error: "Kode karyawan wajib diisi." },
      { status: 400 },
    );
  }

  const employee = await prisma.employee.findFirst({
    where: {
      employeeCode: {
        equals: employeeCode,
        mode: "insensitive",
      },
      active: true,
    },
    select: {
      id: true,
      employeeCode: true,
      name: true,
    },
  });

  if (!employee) {
    return NextResponse.json(
      { error: "Karyawan tidak ditemukan." },
      { status: 404 },
    );
  }

  /*
   * Untuk sekarang kita hanya mengecek apakah ada attendance hari ini.
   * Penanganan timezone Asia/Jakarta yang lebih proper akan kita pusatkan
   * di attendance service saat mulai membuat transaksi check-in/check-out.
   */
  const attendanceDate = getAttendanceDate(new Date(), "Asia/Jakarta");

  const attendance = await prisma.attendanceDay.findUnique({
    where: {
      employeeId_attendanceDate: {
        employeeId: employee.id,

        attendanceDate,
      },
    },
    select: {
      attendanceMode: true,

      checkInAt: true,
      checkOutAt: true,

      checkInStatus: true,
      checkOutStatus: true,

      status: true,
    },
  });

  return NextResponse.json({
    employee: {
      employeeCode: employee.employeeCode,
      name: employee.name,
    },

    attendance: {
      attendanceMode: attendance?.attendanceMode ?? null,

      checkedIn: Boolean(attendance?.checkInAt),
      checkedOut: Boolean(attendance?.checkOutAt),
      checkInAt: attendance?.checkInAt ?? null,
      checkOutAt: attendance?.checkOutAt ?? null,
      checkInStatus: attendance?.checkInStatus ?? null,
      checkOutStatus: attendance?.checkOutStatus ?? null,
    },
  });
}
