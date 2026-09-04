import Link from "next/link";

import { redirect } from "next/navigation";

import EmployeeCreateForm from "@/components/admin/EmployeeCreateForm";

import { getCurrentUser } from "@/lib/auth/session";

import { prisma } from "@/lib/prisma";

import EmployeeStatusButton from "@/components/admin/EmployeeStatusButton";

import AdminNavigation from "@/components/admin/AdminNavigation";

function formatJoinDate(value: Date | null) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(value);
}

type Props = {
  searchParams: Promise<{
    q?: string | string[];
  }>;
};

export default async function EmployeesPage({ searchParams }: Props) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/admin/login");
  }

  if (user.role !== "ADMIN" && user.role !== "LEADER") {
    redirect("/");
  }

  const params = await searchParams;

  const rawQuery = Array.isArray(params.q) ? params.q[0] : params.q;

  const query = rawQuery?.trim().slice(0, 80) ?? "";

  const [employees, totalEmployees, activeEmployees] = await Promise.all([
    prisma.employee.findMany({
      where:
        query.length > 0
          ? {
              OR: [
                {
                  employeeCode: {
                    contains: query,

                    mode: "insensitive",
                  },
                },

                {
                  name: {
                    contains: query,

                    mode: "insensitive",
                  },
                },

                {
                  email: {
                    contains: query,

                    mode: "insensitive",
                  },
                },

                {
                  phone: {
                    contains: query,
                  },
                },
              ],
            }
          : undefined,

      select: {
        id: true,

        employeeCode: true,

        name: true,

        email: true,

        phone: true,

        joinDate: true,

        leaveEligible: true,

        active: true,
      },

      orderBy: [
        {
          active: "desc",
        },

        {
          name: "asc",
        },
      ],

      /*
       * Cegah halaman terlalu berat
       * kalau data nanti sangat banyak.
       */
      take: 200,
    }),

    prisma.employee.count(),

    prisma.employee.count({
      where: {
        active: true,
      },
    }),
  ]);

  return (
    <main className="min-h-screen bg-neutral-100">
      <div className="mx-auto max-w-6xl p-4 md:p-8">
        {/* HEADER */}
        <AdminNavigation />

        <div className="mt-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Data Karyawan</h1>

            <p className="mt-1 text-sm text-neutral-500">
              Kelola karyawan yang dapat melakukan absensi.
            </p>
          </div>

          <div className="w-fit rounded-xl bg-white px-4 py-3 text-sm shadow-sm">
            <span className="text-neutral-500">Aktif:</span>{" "}
            <span className="font-semibold">{activeEmployees}</span>
            <span className="text-neutral-400"> / {totalEmployees}</span>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[360px_1fr]">
          {/* FORM */}
          <div>
            <EmployeeCreateForm />
          </div>

          {/* LIST */}
          <section className="overflow-hidden rounded-2xl bg-white shadow-sm">
            <div className="border-b border-neutral-200 p-5">
              <h2 className="font-semibold">Daftar Karyawan</h2>

              <p className="mt-1 text-sm text-neutral-500">
                Cari berdasarkan nama, kode karyawan, email, atau nomor telepon.
              </p>

              <form
                method="get"
                className="mt-4 flex flex-col gap-2 sm:flex-row"
              >
                <input
                  type="search"
                  name="q"
                  defaultValue={query}
                  placeholder="Contoh: EMP001 atau Budi"
                  autoComplete="off"
                  className="min-w-0 flex-1 rounded-xl border border-neutral-300 px-4 py-3 text-sm outline-none focus:border-blue-500"
                />

                <button
                  type="submit"
                  className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white"
                >
                  Cari
                </button>

                {query && (
                  <Link
                    href="/admin/employees"
                    className="rounded-xl border border-neutral-300 px-5 py-3 text-center text-sm font-semibold text-neutral-600"
                  >
                    Reset
                  </Link>
                )}
              </form>

              <p className="mt-3 text-xs text-neutral-500">
                {query
                  ? `${employees.length} hasil untuk "${query}"`
                  : `${totalEmployees} karyawan terdaftar.`}
              </p>
            </div>

            {employees.length === 0 ? (
              <div className="p-10 text-center text-sm text-neutral-500">
                {query
                  ? `Tidak ada karyawan yang cocok dengan "${query}".`
                  : "Belum ada karyawan."}
              </div>
            ) : (
              <>
                {/* MOBILE */}
                <div className="divide-y divide-neutral-100 md:hidden">
                  {employees.map((employee) => (
                    <div key={employee.id} className="p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{employee.name}</p>

                          <p className="text-xs text-neutral-500">
                            {employee.employeeCode}
                          </p>
                        </div>

                        <StatusBadge active={employee.active} />
                      </div>

                      <div className="mt-4 space-y-2 text-sm">
                        <InfoRow label="Email" value={employee.email ?? "—"} />

                        <InfoRow
                          label="Telepon"
                          value={employee.phone ?? "—"}
                        />

                        <InfoRow
                          label="Tanggal Masuk"
                          value={formatJoinDate(employee.joinDate)}
                        />

                        <InfoRow
                          label="Cuti"
                          value={employee.leaveEligible ? "Ya" : "Tidak"}
                        />
                      </div>

                      {/* AKSI MOBILE */}
                      <div className="mt-4 flex gap-2">
                        <Link
                          href={`/admin/employees/${employee.id}/edit`}
                          className="flex-1 rounded-lg bg-blue-50 px-3 py-2 text-center text-xs font-medium text-blue-700"
                        >
                          Edit
                        </Link>

                        <EmployeeStatusButton
                          employeeId={employee.id}
                          active={employee.active}
                        />
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

                        <th className="px-5 py-4">Kontak</th>

                        <th className="px-5 py-4">Tgl Masuk</th>

                        <th className="px-5 py-4">Cuti</th>

                        <th className="px-5 py-4">Status</th>

                        <th className="px-5 py-4">Aksi</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-neutral-100">
                      {employees.map((employee) => (
                        <tr key={employee.id}>
                          <td className="px-5 py-4">
                            <p className="font-medium">{employee.name}</p>

                            <p className="text-xs text-neutral-500">
                              {employee.employeeCode}
                            </p>
                          </td>

                          <td className="px-5 py-4">
                            <p>{employee.email ?? "—"}</p>

                            <p className="text-xs text-neutral-500">
                              {employee.phone ?? "—"}
                            </p>
                          </td>

                          <td className="px-5 py-4">
                            {formatJoinDate(employee.joinDate)}
                          </td>

                          <td className="px-5 py-4">
                            {employee.leaveEligible ? "Ya" : "Tidak"}
                          </td>

                          <td className="px-5 py-4">
                            <StatusBadge active={employee.active} />
                          </td>

                          <td className="px-5 py-4">
                            <div className="flex gap-2">
                              <Link
                                href={`/admin/employees/${employee.id}/edit`}
                                className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700"
                              >
                                Edit
                              </Link>

                              <EmployeeStatusButton
                                employeeId={employee.id}
                                active={employee.active}
                              />
                            </div>
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
      </div>
    </main>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return active ? (
    <span className="inline-flex rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
      Aktif
    </span>
  ) : (
    <span className="inline-flex rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-500">
      Nonaktif
    </span>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-neutral-500">{label}</span>

      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
