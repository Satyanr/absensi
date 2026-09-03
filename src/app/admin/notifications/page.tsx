import Link from "next/link";

import { redirect } from "next/navigation";

import AdminNavigation from "@/components/admin/AdminNavigation";
import NotificationRetryButton from "@/components/admin/NotificationRetryButton";

import { getCurrentUser } from "@/lib/auth/session";

import { prisma } from "@/lib/prisma";

import { Prisma } from "@/generated/prisma/client";

type Props = {
  searchParams: Promise<{
    status?: string | string[];
  }>;
};

function formatDateTime(value: Date | null) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",

    day: "2-digit",

    month: "short",

    year: "numeric",

    hour: "2-digit",

    minute: "2-digit",
  }).format(value);
}

function typeLabel(value: string) {
  switch (value) {
    case "LEAVE_SUBMITTED":
      return "Pengajuan Baru";

    case "LEAVE_APPROVED":
      return "Disetujui";

    case "LEAVE_REJECTED":
      return "Ditolak";

    case "TEST_EMAIL":
      return "Email Test";

    default:
      return value;
  }
}

export default async function NotificationsPage({ searchParams }: Props) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/admin/login");
  }

  if (user.role !== "ADMIN") {
    redirect("/admin/dashboard");
  }

  const params = await searchParams;

  const requestedStatus = Array.isArray(params.status)
    ? params.status[0]
    : params.status;

  const status =
    requestedStatus === "SENT" ||
    requestedStatus === "FAILED" ||
    requestedStatus === "PENDING"
      ? requestedStatus
      : "ALL";

  let logs: Awaited<ReturnType<typeof prisma.notificationLog.findMany>> = [];

  let sentCount = 0;
  let failedCount = 0;
  let pendingCount = 0;

  let databaseError: string | null = null;

  try {
    [logs, sentCount, failedCount, pendingCount] = await Promise.all([
      prisma.notificationLog.findMany({
        where:
          status === "ALL"
            ? undefined
            : {
                status,
              },

        orderBy: {
          createdAt: "desc",
        },

        take: 100,
      }),

      prisma.notificationLog.count({
        where: {
          status: "SENT",
        },
      }),

      prisma.notificationLog.count({
        where: {
          status: "FAILED",
        },
      }),

      prisma.notificationLog.count({
        where: {
          status: "PENDING",
        },
      }),
    ]);
  } catch (error) {
    console.error("Gagal membaca NotificationLog:", error);

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2021"
    ) {
      databaseError =
        "Tabel notifikasi belum tersedia. Jalankan migration database terlebih dahulu.";
    } else {
      throw error;
    }
  }

  return (
    <main className="min-h-screen bg-neutral-100">
      <div className="mx-auto max-w-7xl p-4 md:p-8">
        <AdminNavigation />

        <div className="mt-6">
          <h1 className="text-2xl font-bold">Notifikasi</h1>

          <p className="mt-1 text-sm text-neutral-500">
            Histori pengiriman email sistem.
          </p>
        </div>

        {databaseError && (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5">
            <p className="font-semibold text-red-800">
              Database Notifikasi Belum Siap
            </p>

            <p className="mt-2 text-sm text-red-700">{databaseError}</p>

            <p className="mt-2 text-xs text-red-600">
              Jalankan: npm run db:deploy
            </p>
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          <Filter
            href="/admin/notifications"
            label={`Semua (${sentCount + failedCount + pendingCount})`}
            active={status === "ALL"}
          />

          <Filter
            href="/admin/notifications?status=SENT"
            label={`Terkirim (${sentCount})`}
            active={status === "SENT"}
          />

          <Filter
            href="/admin/notifications?status=FAILED"
            label={`Gagal (${failedCount})`}
            active={status === "FAILED"}
          />

          <Filter
            href="/admin/notifications?status=PENDING"
            label={`Pending (${pendingCount})`}
            active={status === "PENDING"}
          />
        </div>

        <section className="mt-6 overflow-hidden rounded-2xl bg-white shadow-sm">
          {logs.length === 0 ? (
            <div className="p-10 text-center text-sm text-neutral-500">
              Belum ada histori notifikasi.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-neutral-50 text-xs uppercase text-neutral-500">
                  <tr>
                    <th className="px-5 py-4">Status</th>

                    <th className="px-5 py-4">Jenis</th>

                    <th className="px-5 py-4">Penerima</th>

                    <th className="px-5 py-4">Waktu</th>

                    <th className="px-5 py-4">Percobaan</th>

                    <th className="px-5 py-4">Keterangan</th>

                    <th className="px-5 py-4">Aksi</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-neutral-100">
                  {logs.map((log) => (
                    <tr key={log.id}>
                      <td className="px-5 py-4">
                        <StatusBadge status={log.status} />
                      </td>

                      <td className="px-5 py-4">{typeLabel(log.type)}</td>

                      <td className="px-5 py-4">{log.recipient}</td>

                      <td className="px-5 py-4 whitespace-nowrap">
                        {formatDateTime(
                          log.sentAt ?? log.lastAttemptAt ?? log.createdAt,
                        )}
                      </td>

                      <td className="px-5 py-4">{log.attempts}</td>

                      <td className="max-w-sm px-5 py-4">
                        <span
                          className={
                            log.lastError ? "text-red-600" : "text-neutral-500"
                          }
                        >
                          {log.lastError ?? log.subject ?? "—"}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        {log.status === "FAILED" ? (
                          <NotificationRetryButton notificationId={log.id} />
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function Filter({
  href,
  label,
  active,
}: {
  href: string;

  label: string;

  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-xl px-4 py-2 text-sm font-medium ${
        active
          ? "bg-blue-600 text-white"
          : "bg-white text-neutral-700 shadow-sm"
      }`}
    >
      {label}
    </Link>
  );
}

function StatusBadge({ status }: { status: "PENDING" | "SENT" | "FAILED" }) {
  switch (status) {
    case "SENT":
      return (
        <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
          Terkirim
        </span>
      );

    case "FAILED":
      return (
        <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
          Gagal
        </span>
      );

    default:
      return (
        <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
          Pending
        </span>
      );
  }
}
