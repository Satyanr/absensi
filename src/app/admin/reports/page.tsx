import Link from "next/link";
import { redirect } from "next/navigation";

import AdminNavigation from "@/components/admin/AdminNavigation";

import { getCurrentUser } from "@/lib/auth/session";
import { getAttendanceDate } from "@/lib/attendance/time";
import { prisma } from "@/lib/prisma";
import { expandApprovedLeaveRows } from "@/lib/reports/leave";

type AttendanceModeFilter = "ALL" | "OFFICE" | "PROJECT";

type Props = {
  searchParams: Promise<{
    from?: string | string[];
    to?: string | string[];
    employeeId?: string | string[];
    mode?: string | string[];
  }>;
};

function isValidDateInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function toDatabaseDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(value);
}

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

function getCheckInLabel(
  mode: "OFFICE" | "PROJECT",

  status: "ON_TIME" | "LATE" | "OVERTIME" | "LEGACY" | null,
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
      return "—";
  }
}

function getCheckOutLabel(
  mode: "OFFICE" | "PROJECT",

  status: "NORMAL" | "EARLY_LEAVE" | "OVERTIME" | "LEGACY" | null,
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

export default async function ReportsPage({ searchParams }: Props) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/admin/login");
  }

  if (user.role === "EMPLOYEE") {
    redirect("/");
  }

  const params = await searchParams;

  /*
   * =========================
   * TANGGAL
   * =========================
   */

  const today = getAttendanceDate(new Date(), "Asia/Jakarta");

  const todayInput = today.toISOString().slice(0, 10);

  const requestedFrom = typeof params.from === "string" ? params.from : "";

  const requestedTo = typeof params.to === "string" ? params.to : "";

  const fromInput =
    requestedFrom && isValidDateInput(requestedFrom)
      ? requestedFrom
      : todayInput;

  const toInput =
    requestedTo && isValidDateInput(requestedTo) ? requestedTo : todayInput;

  const fromDate = toDatabaseDate(fromInput);

  const toDate = toDatabaseDate(toInput);

  const invalidRange = fromDate.getTime() > toDate.getTime();

  /*
   * =========================
   * FILTER KARYAWAN
   * =========================
   */

  const requestedEmployee =
    typeof params.employeeId === "string" ? params.employeeId : "";

  const selectedEmployeeId = requestedEmployee || "ALL";

  /*
   * Semua employee tetap
   * ditampilkan di filter,
   * termasuk yang sudah nonaktif.
   *
   * Ini penting untuk laporan
   * historis.
   */
  const employees = await prisma.employee.findMany({
    select: {
      id: true,
      employeeCode: true,
      name: true,
      active: true,
    },

    orderBy: {
      name: "asc",
    },
  });

  /*
   * =========================
   * FILTER MODE
   * =========================
   */

  const requestedMode = typeof params.mode === "string" ? params.mode : "";

  const selectedMode: AttendanceModeFilter =
    requestedMode === "OFFICE" || requestedMode === "PROJECT"
      ? requestedMode
      : "ALL";

  /*
   * =========================
   * QUERY LAPORAN
   * =========================
   */

  const attendanceDays = invalidRange
    ? []
    : await prisma.attendanceDay.findMany({
        where: {
          attendanceDate: {
            gte: fromDate,
            lte: toDate,
          },

          ...(selectedEmployeeId !== "ALL"
            ? {
                employeeId: selectedEmployeeId,
              }
            : {}),

          ...(selectedMode !== "ALL"
            ? {
                attendanceMode: selectedMode,
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

          events: {
            where: {
              photoId: {
                not: null,
              },
            },

            select: {
              id: true,
              eventType: true,
              photoId: true,
            },

            orderBy: {
              serverReceivedAt: "asc",
            },
          },

          employee: {
            select: {
              id: true,

              employeeCode: true,

              name: true,

              active: true,
            },
          },
        },

        orderBy: [
          {
            attendanceDate: "asc",
          },

          {
            employee: {
              name: "asc",
            },
          },
        ],
      });

  /*
   * =========================
   * IZIN / SAKIT / CUTI
   * =========================
   *
   * Hanya APPROVED yang masuk
   * laporan resmi.
   *
   * Kalau filter Kantor /
   * In Project dipilih,
   * leave tidak ditampilkan.
   */
  const leaveRequests =
    invalidRange || selectedMode !== "ALL"
      ? []
      : await prisma.leaveRequest.findMany({
          where: {
            status: "APPROVED",

            /*
             * Ambil leave yang
             * bersinggungan dengan
             * rentang laporan.
             */
            startDate: {
              lte: toDate,
            },

            endDate: {
              gte: fromDate,
            },

            ...(selectedEmployeeId !== "ALL"
              ? {
                  employeeId: selectedEmployeeId,
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

          orderBy: [
            {
              startDate: "asc",
            },

            {
              employee: {
                name: "asc",
              },
            },
          ],
        });

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

    checkInPhotoEventId:
      item.events.find(
        (event) => event.eventType === "CHECK_IN" && event.photoId,
      )?.id ?? null,

    checkOutPhotoEventId:
      item.events.find(
        (event) => event.eventType === "CHECK_OUT" && event.photoId,
      )?.id ?? null,

    employee: item.employee,
  }));

  const leaveRows = expandApprovedLeaveRows(leaveRequests, fromDate, toDate);

  /*
   * AttendanceDay + LeaveRequest
   * menjadi satu laporan.
   */
  const reportRows = [...attendanceRows, ...leaveRows].sort((a, b) => {
    const dateDifference = a.reportDate.getTime() - b.reportDate.getTime();

    if (dateDifference !== 0) {
      return dateDifference;
    }

    return a.employee.name.localeCompare(b.employee.name, "id");
  });

  /*
   * =========================
   * SUMMARY
   * =========================
   */

  const totalAttendance = attendanceRows.length;

  const totalEmployees = new Set(reportRows.map((item) => item.employee.id))
    .size;

  const totalOffice = attendanceDays.filter(
    (item) => item.attendanceMode === "OFFICE",
  ).length;

  const totalProject = attendanceDays.filter(
    (item) => item.attendanceMode === "PROJECT",
  ).length;

  const totalPermission = leaveRows.filter(
    (item) => item.leaveType === "PERMISSION",
  ).length;

  const totalSick = leaveRows.filter(
    (item) => item.leaveType === "SICK",
  ).length;

  const totalLeave = leaveRows.filter(
    (item) => item.leaveType === "ANNUAL_LEAVE",
  ).length;

  const totalLate = attendanceDays.filter(
    (item) => item.attendanceMode === "OFFICE" && item.checkInStatus === "LATE",
  ).length;

  const totalEarlyLeave = attendanceDays.filter(
    (item) =>
      item.attendanceMode === "OFFICE" && item.checkOutStatus === "EARLY_LEAVE",
  ).length;

  const totalOvertime = attendanceDays.filter(
    (item) =>
      item.attendanceMode === "OFFICE" &&
      (item.checkInStatus === "OVERTIME" || item.checkOutStatus === "OVERTIME"),
  ).length;

  /*
   * URL export mengikuti
   * filter yang sama persis.
   */
  const exportParams = new URLSearchParams({
    from: fromInput,
    to: toInput,
  });

  if (selectedEmployeeId !== "ALL") {
    exportParams.set("employeeId", selectedEmployeeId);
  }

  if (selectedMode !== "ALL") {
    exportParams.set("mode", selectedMode);
  }

  const exportUrl = `/api/admin/reports/export?${exportParams.toString()}`;
  const excelExportUrl = `/api/admin/reports/export-xlsx?${exportParams.toString()}`;

  const selectedEmployee =
    selectedEmployeeId === "ALL"
      ? null
      : employees.find((employee) => employee.id === selectedEmployeeId);

  return (
    <main className="min-h-screen bg-neutral-100">
      <div className="mx-auto max-w-7xl p-4 md:p-8">
        <AdminNavigation />

        {/* HEADER */}
        <div className="mt-6">
          <h1 className="text-2xl font-bold">Laporan Absensi</h1>

          <p className="mt-1 text-sm text-neutral-500">
            Tarik data berdasarkan rentang tanggal, karyawan, dan jenis absensi.
          </p>
        </div>

        {/* FILTER */}
        <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm">
          <form
            method="get"
            className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4"
          >
            {/* FROM */}
            <div>
              <label htmlFor="from" className="text-sm font-medium">
                Tanggal Awal
              </label>

              <input
                id="from"
                name="from"
                type="date"
                defaultValue={fromInput}
                className="mt-2 w-full rounded-xl border border-neutral-300 px-4 py-3"
              />
            </div>

            {/* TO */}
            <div>
              <label htmlFor="to" className="text-sm font-medium">
                Tanggal Akhir
              </label>

              <input
                id="to"
                name="to"
                type="date"
                defaultValue={toInput}
                className="mt-2 w-full rounded-xl border border-neutral-300 px-4 py-3"
              />
            </div>

            {/* EMPLOYEE */}
            <div>
              <label htmlFor="employeeId" className="text-sm font-medium">
                Karyawan
              </label>

              <select
                id="employeeId"
                name="employeeId"
                defaultValue={selectedEmployeeId}
                className="mt-2 w-full rounded-xl border border-neutral-300 bg-white px-4 py-3"
              >
                <option value="ALL">Semua Karyawan</option>

                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.employeeCode} - {employee.name}
                    {!employee.active ? " (Nonaktif)" : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* MODE */}
            <div>
              <label htmlFor="mode" className="text-sm font-medium">
                Jenis Absensi
              </label>

              <select
                id="mode"
                name="mode"
                defaultValue={selectedMode}
                className="mt-2 w-full rounded-xl border border-neutral-300 bg-white px-4 py-3"
              >
                <option value="ALL">Semua Mode</option>

                <option value="OFFICE">Kantor</option>

                <option value="PROJECT">In Project</option>
              </select>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row xl:col-span-4">
              <button
                type="submit"
                className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white"
              >
                Tampilkan
              </button>

              <Link
                href="/admin/reports"
                className="rounded-xl border border-neutral-300 px-5 py-3 text-center text-sm font-medium"
              >
                Reset / Hari Ini
              </Link>
            </div>
          </form>

          {invalidRange && (
            <div className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">
              Tanggal awal tidak boleh lebih besar dari tanggal akhir.
            </div>
          )}
        </section>

        {!invalidRange && (
          <>
            {/* FILTER INFO */}
            <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                Data yang ditampilkan
              </p>

              <div className="mt-3 grid gap-3 text-sm md:grid-cols-3">
                <div>
                  <p className="text-neutral-500">Periode</p>

                  <p className="font-semibold">
                    {formatDate(fromDate)}
                    {" — "}
                    {formatDate(toDate)}
                  </p>
                </div>

                <div>
                  <p className="text-neutral-500">Karyawan</p>

                  <p className="font-semibold">
                    {selectedEmployee
                      ? `${selectedEmployee.employeeCode} - ${selectedEmployee.name}`
                      : "Semua Karyawan"}
                  </p>
                </div>

                <div>
                  <p className="text-neutral-500">Jenis Absensi</p>

                  <p className="font-semibold">
                    {selectedMode === "OFFICE"
                      ? "Kantor"
                      : selectedMode === "PROJECT"
                        ? "In Project"
                        : "Semua Mode"}
                  </p>
                </div>
              </div>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <a
                  href={excelExportUrl}
                  className="inline-flex w-full justify-center rounded-xl bg-green-600 px-5 py-3 text-sm font-semibold text-white sm:w-auto"
                >
                  Export Excel Lengkap
                </a>

                <a
                  href={exportUrl}
                  className="inline-flex w-full justify-center rounded-xl border border-neutral-300 bg-white px-5 py-3 text-sm font-semibold text-neutral-700 sm:w-auto"
                >
                  CSV Ringkas
                </a>
              </div>
            </section>

            {/* SUMMARY */}
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5 xl:grid-cols-10">
              <SummaryCard title="Hari Hadir" value={totalAttendance} />

              <SummaryCard title="Karyawan" value={totalEmployees} />

              <SummaryCard title="Kantor" value={totalOffice} />

              <SummaryCard title="In Project" value={totalProject} />

              <SummaryCard title="Izin" value={totalPermission} />

              <SummaryCard title="Sakit" value={totalSick} />

              <SummaryCard title="Cuti" value={totalLeave} />

              <SummaryCard title="Terlambat" value={totalLate} />

              <SummaryCard title="Pulang Awal" value={totalEarlyLeave} />

              <SummaryCard title="Lembur" value={totalOvertime} />
            </div>

            {/* DATA */}
            <section className="mt-6 overflow-hidden rounded-2xl bg-white shadow-sm">
              <div className="border-b border-neutral-200 p-5">
                <h2 className="font-semibold">Detail Absensi</h2>

                <p className="mt-1 text-sm text-neutral-500">
                  {reportRows.length} data ditemukan.
                </p>
              </div>

              {reportRows.length === 0 ? (
                <div className="p-10 text-center text-sm text-neutral-500">
                  Tidak ada data yang sesuai dengan filter.
                </div>
              ) : (
                <>
                  {/* MOBILE */}
                  <div className="divide-y divide-neutral-100 lg:hidden">
                    {reportRows.map((item) => (
                      <div key={item.id} className="p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs text-neutral-500">
                              {formatDate(item.reportDate)}
                            </p>

                            <p className="mt-1 font-semibold">
                              {item.employee.name}
                            </p>

                            <p className="text-xs text-neutral-500">
                              {item.employee.employeeCode}
                            </p>
                          </div>

                          {item.source === "ATTENDANCE" ? (
                            <ModeBadge mode={item.attendanceMode} />
                          ) : (
                            <LeaveBadge type={item.leaveType} />
                          )}
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                          {item.source === "ATTENDANCE" ? (
                            <>
                              <Info
                                label="Masuk"
                                value={formatTime(item.checkInAt)}
                              />

                              <Info
                                label="Pulang"
                                value={
                                  item.attendanceMode === "PROJECT"
                                    ? "—"
                                    : formatTime(item.checkOutAt)
                                }
                              />

                              <Info
                                label="Status Masuk"
                                value={getCheckInLabel(
                                  item.attendanceMode,
                                  item.checkInStatus,
                                )}
                              />

                              <Info
                                label="Status Pulang"
                                value={getCheckOutLabel(
                                  item.attendanceMode,
                                  item.checkOutStatus,
                                )}
                              />
                            </>
                          ) : (
                            <>
                              <Info
                                label="Jenis"
                                value={leaveTypeLabel(item.leaveType)}
                              />

                              <Info label="Status" value="Disetujui" />
                            </>
                          )}
                        </div>

                        {item.source === "ATTENDANCE" && (
                          <div className="mt-4">
                            <p className="text-xs text-neutral-500">
                              Selfie Absensi
                            </p>

                            <div className="mt-2 flex flex-wrap gap-2">
                              {item.checkInPhotoEventId && (
                                <a
                                  href={`/api/admin/attendance-events/${item.checkInPhotoEventId}/photo`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="rounded-lg border border-blue-600 px-3 py-2 text-sm font-semibold text-blue-600"
                                >
                                  Foto Masuk
                                </a>
                              )}

                              {item.checkOutPhotoEventId && (
                                <a
                                  href={`/api/admin/attendance-events/${item.checkOutPhotoEventId}/photo`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="rounded-lg border border-neutral-400 px-3 py-2 text-sm font-semibold"
                                >
                                  Foto Pulang
                                </a>
                              )}

                              {!item.checkInPhotoEventId &&
                                !item.checkOutPhotoEventId && (
                                  <span className="text-sm text-neutral-400">
                                    Tidak ada foto
                                  </span>
                                )}
                            </div>
                          </div>
                        )}

                        <div className="mt-4">
                          <p className="text-xs text-neutral-500">Keterangan</p>

                          <p className="mt-1 text-sm">
                            {item.source === "ATTENDANCE"
                              ? getDescription(item)
                              : item.reason}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* DESKTOP */}
                  <div className="hidden overflow-x-auto lg:block">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-neutral-50 text-xs uppercase text-neutral-500">
                        <tr>
                          <th className="px-5 py-4">Tanggal</th>

                          <th className="px-5 py-4">Karyawan</th>

                          <th className="px-5 py-4">Jenis</th>

                          <th className="px-5 py-4">Masuk</th>

                          <th className="px-5 py-4">Status Masuk</th>

                          <th className="px-5 py-4">Pulang</th>

                          <th className="px-5 py-4">Status Pulang</th>

                          <th className="px-5 py-4">Selfie</th>

                          <th className="px-5 py-4">Keterangan</th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-neutral-100">
                        {reportRows.map((item) => (
                          <tr key={item.id}>
                            <td className="whitespace-nowrap px-5 py-4">
                              {formatDate(item.reportDate)}
                            </td>

                            <td className="px-5 py-4">
                              <p className="font-medium">
                                {item.employee.name}
                              </p>

                              <p className="text-xs text-neutral-500">
                                {item.employee.employeeCode}
                              </p>
                            </td>

                            <td className="px-5 py-4">
                              {item.source === "ATTENDANCE" ? (
                                <ModeBadge mode={item.attendanceMode} />
                              ) : (
                                <LeaveBadge type={item.leaveType} />
                              )}
                            </td>

                            <td className="whitespace-nowrap px-5 py-4">
                              {item.source === "ATTENDANCE"
                                ? formatTime(item.checkInAt)
                                : "—"}
                            </td>

                            <td className="px-5 py-4">
                              {item.source === "ATTENDANCE"
                                ? getCheckInLabel(
                                    item.attendanceMode,
                                    item.checkInStatus,
                                  )
                                : "Disetujui"}
                            </td>

                            <td className="whitespace-nowrap px-5 py-4">
                              {item.source === "ATTENDANCE"
                                ? item.attendanceMode === "PROJECT"
                                  ? "—"
                                  : formatTime(item.checkOutAt)
                                : "—"}
                            </td>

                            <td className="px-5 py-4">
                              {item.source === "ATTENDANCE"
                                ? getCheckOutLabel(
                                    item.attendanceMode,
                                    item.checkOutStatus,
                                  )
                                : "—"}
                            </td>

                            <td className="px-5 py-4">
                              {item.source === "ATTENDANCE" ? (
                                <div className="flex min-w-32 flex-col gap-2">
                                  {item.checkInPhotoEventId && (
                                    <a
                                      href={`/api/admin/attendance-events/${item.checkInPhotoEventId}/photo`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-sm font-semibold text-blue-600 underline"
                                    >
                                      Foto Masuk
                                    </a>
                                  )}

                                  {item.checkOutPhotoEventId && (
                                    <a
                                      href={`/api/admin/attendance-events/${item.checkOutPhotoEventId}/photo`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-sm font-semibold text-blue-600 underline"
                                    >
                                      Foto Pulang
                                    </a>
                                  )}

                                  {!item.checkInPhotoEventId &&
                                    !item.checkOutPhotoEventId && (
                                      <span className="text-neutral-400">
                                        —
                                      </span>
                                    )}
                                </div>
                              ) : (
                                "—"
                              )}
                            </td>

                            <td className="px-5 py-4 text-neutral-600">
                              {item.source === "ATTENDANCE"
                                ? getDescription(item)
                                : item.reason}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </section>
          </>
        )}
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
  return mode === "PROJECT" ? (
    <span className="inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
      In Project
    </span>
  ) : (
    <span className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
      Kantor
    </span>
  );
}

function leaveTypeLabel(type: "PERMISSION" | "SICK" | "ANNUAL_LEAVE") {
  switch (type) {
    case "PERMISSION":
      return "Izin";

    case "SICK":
      return "Sakit";

    case "ANNUAL_LEAVE":
      return "Cuti";
  }
}

function LeaveBadge({
  type,
}: {
  type: "PERMISSION" | "SICK" | "ANNUAL_LEAVE";
}) {
  const label = leaveTypeLabel(type);

  const className =
    type === "SICK"
      ? "bg-red-50 text-red-700"
      : type === "ANNUAL_LEAVE"
        ? "bg-green-50 text-green-700"
        : "bg-purple-50 text-purple-700";

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${className}`}
    >
      {label}
    </span>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-neutral-500">{label}</p>

      <p className="font-medium">{value}</p>
    </div>
  );
}

function getDescription(item: {
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

  return values.length ? values.join(" • ") : "Normal";
}
