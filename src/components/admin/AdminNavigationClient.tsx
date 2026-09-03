"use client";

import Link from "next/link";

import {
  usePathname,
} from "next/navigation";

type Role =
  | "EMPLOYEE"
  | "OFFICER"
  | "LEADER"
  | "ADMIN"
  | null;

type Props = {
  role: Role;
};

const navigation = [
  {
    href:
      "/admin/dashboard",

    label:
      "Dashboard",

    roles: [
      "ADMIN",
      "LEADER",
    ],
  },

  {
    href:
      "/admin/employees",

    label:
      "Karyawan",

    roles: [
      "ADMIN",
      "LEADER",
    ],
  },

  {
    href:
      "/admin/users",

    label:
      "User",

    roles: [
      "ADMIN",
    ],
  },

  {
    href:
      "/admin/reports",

    label:
      "Laporan",

    roles: [
      "ADMIN",
      "LEADER",
    ],
  },

  {
    href:
      "/admin/leaves",

    label:
      "Izin & Cuti",

    roles: [
      "ADMIN",
      "LEADER",
    ],
  },
];

export default function AdminNavigationClient({
  role,
}: Props) {
  const pathname =
    usePathname();

  const items =
    navigation.filter(
      (item) =>
        role &&
        item.roles.includes(
          role,
        ),
    );

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <Link
            href="/admin/dashboard"
            className="text-lg font-bold"
          >
            Absensi Admin
          </Link>

          <p className="text-xs text-neutral-500">
            Sistem Absensi
            Karyawan
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <nav className="flex flex-wrap gap-2">
            {items.map(
              (item) => {
                const active =
                  pathname ===
                    item.href ||
                  pathname.startsWith(
                    `${item.href}/`,
                  );

                return (
                  <Link
                    key={
                      item.href
                    }
                    href={
                      item.href
                    }
                    className={`rounded-xl px-4 py-2 text-sm font-medium ${
                      active
                        ? "bg-blue-600 text-white"
                        : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
                    }`}
                  >
                    {
                      item.label
                    }
                  </Link>
                );
              },
            )}
          </nav>

          <form
            action="/api/auth/logout"
            method="post"
          >
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