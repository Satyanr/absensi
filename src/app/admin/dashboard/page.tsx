import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";
import { getAttendanceDate } from "@/lib/attendance/time";
import { prisma } from "@/lib/prisma";
import AdminNavigation from "@/components/admin/AdminNavigation";

function formatTime(value: Date | null) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(value);
}

function getCheckInLabel(
  attendanceMode: "OFFICE" | "PROJECT",
  status: "ON_TIME" | "LATE" | "OVERTIME" | "LEGACY" | null,
) {
  if (attendanceMode === "PROJECT") {
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
      return "—";
  }
}

function getCheckOutLabel(
  attendanceMode: "OFFICE" | "PROJECT",
  status: "NORMAL" | "EARLY_LEAVE" | "OVERTIME" | "LEGACY" | null,
) {
  if (attendanceMode === "PROJECT") {
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

export default async function DashboardPage() {
  /*
   * Pastikan dashboard hanya bisa dibuka
   * oleh user yang sudah login.
   */
  const user = await getCurrentUser();

  if (!user) {
    redirect("/admin/login");
  }

  /*
   * Employee biasa tidak boleh masuk dashboard.
   */
  if (user.role === "EMPLOYEE") {
    redirect("/");
  }

  const now = new Date();

  const attendanceDate = getAttendanceDate(now, "Asia/Jakarta");

  /*
   * Ambil semua absensi hari ini.
   */
  const attendanceDays = await prisma.attendanceDay.findMany({
    where: {
      attendanceDate,
    },

    select: {
      id: true,

      attendanceMode: true,

      checkInAt: true,
      checkOutAt: true,

      checkInStatus: true,
      checkOutStatus: true,

      lateMinutes: true,
      earlyLeaveMinutes: true,
      overtimeMinutes: true,

      employee: {
        select: {
          employeeCode: true,
          name: true,
        },
      },
    },

    orderBy: [
      {
        checkInAt: "asc",
      },

      {
        employeeId: "asc",
      },
    ],
  });

  /*
   * Jumlah karyawan aktif.
   */
  const totalEmployees = await prisma.employee.count({
    where: {
      active: true,
    },
  });

  const totalPresent = attendanceDays.length;

  const totalOffice = attendanceDays.filter(
    (attendance) => attendance.attendanceMode === "OFFICE",
  ).length;

  const totalProject = attendanceDays.filter(
    (attendance) => attendance.attendanceMode === "PROJECT",
  ).length;

  const totalLate = attendanceDays.filter(
    (attendance) =>
      attendance.attendanceMode === "OFFICE" &&
      attendance.checkInStatus === "LATE",
  ).length;

  const displayName =
    user.employee?.name ?? user.username ?? user.email ?? "Admin";

  return (
    <main className="min-h-screen bg-neutral-100">
      <div className="mx-auto max-w-6xl p-4 md:p-8">
        {/* HEADER */}
        <AdminNavigation />

        <div className="mt-6">
          <p className="text-sm text-neutral-500">Dashboard Absensi</p>

          <h1 className="text-2xl font-bold">Halo, {displayName}</h1>

          <p className="mt-1 text-sm text-neutral-500">{formatDate(now)}</p>
        </div>

        {/* SUMMARY */}
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
          <SummaryCard title="Karyawan Aktif" value={totalEmployees} />

          <SummaryCard title="Hadir" value={totalPresent} />

          <SummaryCard title="Kantor" value={totalOffice} />

          <SummaryCard title="In Project" value={totalProject} />

          <SummaryCard title="Terlambat" value={totalLate} />
        </div>

        {/* ATTENDANCE TABLE */}
        <section className="mt-6 overflow-hidden rounded-2xl bg-white shadow-sm">
          <div className="border-b border-neutral-200 p-5">
            <h2 className="font-semibold">Absensi Hari Ini</h2>

            <p className="mt-1 text-sm text-neutral-500">
              {totalPresent} karyawan sudah melakukan absensi.
            </p>
          </div>

          {attendanceDays.length === 0 ? (
            <div className="p-10 text-center text-sm text-neutral-500">
              Belum ada absensi hari ini.
            </div>
          ) : (
            <>
              {/* MOBILE */}
              <div className="divide-y divide-neutral-100 md:hidden">
                {attendanceDays.map((attendance) => (
                  <div key={attendance.id} className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">
                          {attendance.employee.name}
                        </p>

                        <p className="text-xs text-neutral-500">
                          {attendance.employee.employeeCode}
                        </p>
                      </div>

                      <ModeBadge mode={attendance.attendanceMode} />
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-neutral-500">Masuk</p>

                        <p className="font-medium">
                          {formatTime(attendance.checkInAt)}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-neutral-500">Pulang</p>

                        <p className="font-medium">
                          {attendance.attendanceMode === "PROJECT"
                            ? "—"
                            : formatTime(attendance.checkOutAt)}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-neutral-500">Status Masuk</p>

                        <p className="font-medium">
                          {getCheckInLabel(
                            attendance.attendanceMode,
                            attendance.checkInStatus,
                          )}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-neutral-500">
                          Status Pulang
                        </p>

                        <p className="font-medium">
                          {getCheckOutLabel(
                            attendance.attendanceMode,
                            attendance.checkOutStatus,
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* DESKTOP */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <thead className="bg-neutral-50 text-xs uppercase text-neutral-500">
                    <tr>
                      <th className="px-5 py-4">Karyawan</th>

                      <th className="px-5 py-4">Mode</th>

                      <th className="px-5 py-4">Masuk</th>

                      <th className="px-5 py-4">Status Masuk</th>

                      <th className="px-5 py-4">Pulang</th>

                      <th className="px-5 py-4">Status Pulang</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-neutral-100">
                    {attendanceDays.map((attendance) => (
                      <tr key={attendance.id}>
                        <td className="px-5 py-4">
                          <p className="font-medium">
                            {attendance.employee.name}
                          </p>

                          <p className="text-xs text-neutral-500">
                            {attendance.employee.employeeCode}
                          </p>
                        </td>

                        <td className="px-5 py-4">
                          <ModeBadge mode={attendance.attendanceMode} />
                        </td>

                        <td className="px-5 py-4 font-medium">
                          {formatTime(attendance.checkInAt)}
                        </td>

                        <td className="px-5 py-4">
                          {getCheckInLabel(
                            attendance.attendanceMode,
                            attendance.checkInStatus,
                          )}
                        </td>

                        <td className="px-5 py-4 font-medium">
                          {attendance.attendanceMode === "PROJECT"
                            ? "—"
                            : formatTime(attendance.checkOutAt)}
                        </td>

                        <td className="px-5 py-4">
                          {getCheckOutLabel(
                            attendance.attendanceMode,
                            attendance.checkOutStatus,
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function SummaryCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <p className="text-xs text-neutral-500">{title}</p>

      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}

function ModeBadge({ mode }: { mode: "OFFICE" | "PROJECT" }) {
  if (mode === "PROJECT") {
    return (
      <span className="inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
        In Project
      </span>
    );
  }

  return (
    <span className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
      Kantor
    </span>
  );
}
