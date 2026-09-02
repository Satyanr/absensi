import { redirect } from "next/navigation";

import AdminNavigation from "@/components/admin/AdminNavigation";
import LeaveCreateForm from "@/components/admin/LeaveCreateForm";

import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import LeaveReviewActions from "@/components/admin/LeaveReviewActions";
import LeaveBalanceForm from "@/components/admin/LeaveBalanceForm";

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(value);
}

function typeLabel(type: "PERMISSION" | "SICK" | "ANNUAL_LEAVE") {
  switch (type) {
    case "PERMISSION":
      return "Izin";

    case "SICK":
      return "Sakit";

    case "ANNUAL_LEAVE":
      return "Cuti";
  }
}

function statusLabel(
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED",
) {
  switch (status) {
    case "PENDING":
      return "Menunggu";

    case "APPROVED":
      return "Disetujui";

    case "REJECTED":
      return "Ditolak";

    case "CANCELLED":
      return "Dibatalkan";
  }
}

export default async function LeavesPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/admin/login");
  }

  if (user.role === "EMPLOYEE") {
    redirect("/");
  }

  const [employees, leaveRequests] = await Promise.all([
    prisma.employee.findMany({
      where: {
        active: true,
      },

      select: {
        id: true,
        employeeCode: true,
        name: true,
        leaveEligible: true,
      },

      orderBy: {
        name: "asc",
      },
    }),

    prisma.leaveRequest.findMany({
      select: {
        id: true,
        type: true,
        startDate: true,
        endDate: true,
        reason: true,
        status: true,
        submittedAt: true,

        employee: {
          select: {
            employeeCode: true,
            name: true,
          },
        },
      },

      orderBy: {
        submittedAt: "desc",
      },

      take: 100,
    }),
  ]);

  const pending = leaveRequests.filter(
    (item) => item.status === "PENDING",
  ).length;

  return (
    <main className="min-h-screen bg-neutral-100">
      <div className="mx-auto max-w-7xl p-4 md:p-8">
        <AdminNavigation />

        <div className="mt-6">
          <h1 className="text-2xl font-bold">Izin, Sakit & Cuti</h1>

          <p className="mt-1 text-sm text-neutral-500">
            Kelola ketidakhadiran karyawan.
          </p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <SummaryCard title="Total Pengajuan" value={leaveRequests.length} />

          <SummaryCard title="Menunggu" value={pending} />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[380px_1fr]">
          <div className="space-y-6">
            <LeaveCreateForm employees={employees} />

            <LeaveBalanceForm employees={employees} />
          </div>

          <section className="overflow-hidden rounded-2xl bg-white shadow-sm">
            <div className="border-b border-neutral-200 p-5">
              <h2 className="font-semibold">Daftar Pengajuan</h2>

              <p className="mt-1 text-sm text-neutral-500">
                Maksimal 100 pengajuan terbaru.
              </p>
            </div>

            {leaveRequests.length === 0 ? (
              <div className="p-10 text-center text-sm text-neutral-500">
                Belum ada pengajuan.
              </div>
            ) : (
              <div className="divide-y divide-neutral-100">
                {leaveRequests.map((item) => (
                  <div key={item.id} className="p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-semibold">{item.employee.name}</p>

                        <p className="text-xs text-neutral-500">
                          {item.employee.employeeCode}
                        </p>
                      </div>

                      <div className="flex gap-2">
                        <TypeBadge type={item.type} />

                        <StatusBadge status={item.status} />
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-neutral-500">Dari</p>

                        <p className="font-medium">
                          {formatDate(item.startDate)}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-neutral-500">Sampai</p>

                        <p className="font-medium">
                          {formatDate(item.endDate)}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 rounded-xl bg-neutral-50 p-3">
                      <p className="text-xs text-neutral-500">Alasan</p>

                      <p className="mt-1 text-sm">{item.reason}</p>
                    </div>

                    {item.status === "PENDING" && (
                      <LeaveReviewActions leaveRequestId={item.id} />
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

function SummaryCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <p className="text-xs text-neutral-500">{title}</p>

      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}

function TypeBadge({ type }: { type: "PERMISSION" | "SICK" | "ANNUAL_LEAVE" }) {
  return (
    <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
      {typeLabel(type)}
    </span>
  );
}

function StatusBadge({
  status,
}: {
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
}) {
  const className =
    status === "APPROVED"
      ? "bg-green-50 text-green-700"
      : status === "REJECTED"
        ? "bg-red-50 text-red-700"
        : status === "CANCELLED"
          ? "bg-neutral-100 text-neutral-600"
          : "bg-amber-50 text-amber-700";

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-medium ${className}`}>
      {statusLabel(status)}
    </span>
  );
}
