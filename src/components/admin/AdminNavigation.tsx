"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navigation = [
  {
    href: "/admin/dashboard",
    label: "Dashboard",
  },
  {
    href: "/admin/employees",
    label: "Karyawan",
  },
  {
    href: "/admin/users",
    label: "User",
  },
  {
    href: "/admin/reports",
    label: "Laporan",
  },
  {
    href: "/admin/leaves",
    label: "Izin & Cuti",
  },
];

export default function AdminNavigation() {
  const pathname = usePathname();

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <Link href="/admin/dashboard" className="text-lg font-bold">
            Absensi Admin
          </Link>

          <p className="text-xs text-neutral-500">Sistem Absensi Karyawan</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <nav className="flex flex-wrap gap-2">
            {navigation.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(`${item.href}/`);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-xl px-4 py-2 text-sm font-medium ${
                    active
                      ? "bg-blue-600 text-white"
                      : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              className="rounded-xl border border-neutral-300 px-4 py-2 text-sm font-medium"
            >
              Keluar
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
