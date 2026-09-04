import Link from "next/link";

import { notFound, redirect } from "next/navigation";

import EmployeeEditForm from "@/components/admin/EmployeeEditForm";

import { getCurrentUser } from "@/lib/auth/session";

import { prisma } from "@/lib/prisma";

import AdminNavigation from "@/components/admin/AdminNavigation";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export default async function EmployeeEditPage({ params }: Props) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/admin/login");
  }

  if (user.role !== "ADMIN" && user.role !== "LEADER") {
    redirect("/");
  }

  const { id } = await params;

  const employee = await prisma.employee.findUnique({
    where: {
      id,
    },

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
  });

  if (!employee) {
    notFound();
  }

  const joinDate = employee.joinDate
    ? employee.joinDate.toISOString().slice(0, 10)
    : null;

  return (
    <main className="min-h-screen bg-neutral-100">
      <div className="mx-auto max-w-6xl p-4 md:p-8">
        <AdminNavigation />

        <div className="mx-auto mt-6 max-w-xl">
          <Link href="/admin/employees" className="text-sm text-blue-600">
            ← Kembali ke Data Karyawan
          </Link>

          <div className="mt-4">
            <EmployeeEditForm
              employee={{
                id: employee.id,
                employeeCode: employee.employeeCode,
                name: employee.name,
                email: employee.email,
                phone: employee.phone,
                joinDate,
                leaveEligible: employee.leaveEligible,
              }}
            />
          </div>

          <div className="mt-4 rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-neutral-500">Status Karyawan</p>

            <p className="mt-1 font-semibold">
              {employee.active ? "Aktif" : "Nonaktif"}
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
