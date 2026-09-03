import {
  redirect,
} from "next/navigation";

import AdminNavigation from "@/components/admin/AdminNavigation";
import UserCreateForm from "@/components/admin/UserCreateForm";
import UserStatusButton from "@/components/admin/UserStatusButton";

import {
  getCurrentUser,
} from "@/lib/auth/session";

import {
  prisma,
} from "@/lib/prisma";

function roleLabel(
  role: string,
) {
  switch (role) {
    case "ADMIN":
      return "Admin";

    case "LEADER":
      return "Leader";

    default:
      return role;
  }
}

export default async function UsersPage() {
  const currentUser =
    await getCurrentUser();

  if (!currentUser) {
    redirect(
      "/admin/login",
    );
  }

  /*
   * User management
   * hanya ADMIN.
   */
  if (
    currentUser.role !==
    "ADMIN"
  ) {
    redirect(
      "/admin/dashboard",
    );
  }

  const users =
    await prisma.user.findMany({
      where: {
        role: {
          in: [
            "ADMIN",
            "LEADER",
          ],
        },
      },

      select: {
        id: true,

        email: true,

        username: true,

        role: true,

        active: true,

        createdAt: true,
      },

      orderBy: [
        {
          active: "desc",
        },

        {
          role: "asc",
        },

        {
          email: "asc",
        },
      ],
    });

  return (
    <main className="min-h-screen bg-neutral-100">
      <div className="mx-auto max-w-6xl p-4 md:p-8">
        <AdminNavigation />

        <div className="mt-6">
          <h1 className="text-2xl font-bold">
            User
          </h1>

          <p className="mt-1 text-sm text-neutral-500">
            Kelola akun Admin
            dan Leader.
          </p>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[360px_1fr]">
          <div>
            <UserCreateForm />
          </div>

          <section className="overflow-hidden rounded-2xl bg-white shadow-sm">
            <div className="border-b border-neutral-200 p-5">
              <h2 className="font-semibold">
                Daftar User
              </h2>

              <p className="mt-1 text-sm text-neutral-500">
                {users.length} user
                terdaftar.
              </p>
            </div>

            {users.length === 0 ? (
              <div className="p-10 text-center text-sm text-neutral-500">
                Belum ada user.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-neutral-50 text-xs uppercase text-neutral-500">
                    <tr>
                      <th className="px-5 py-4">
                        User
                      </th>

                      <th className="px-5 py-4">
                        Role
                      </th>

                      <th className="px-5 py-4">
                        Status
                      </th>

                      <th className="px-5 py-4">
                        Aksi
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-neutral-100">
                    {users.map(
                      (user) => (
                        <tr
                          key={
                            user.id
                          }
                        >
                          <td className="px-5 py-4">
                            <p className="font-medium">
                              {user.email ??
                                "—"}
                            </p>

                            <p className="text-xs text-neutral-500">
                              {user.username
                                ? `@${user.username}`
                                : "Tanpa username"}
                            </p>
                          </td>

                          <td className="px-5 py-4">
                            {roleLabel(
                              user.role,
                            )}
                          </td>

                          <td className="px-5 py-4">
                            {user.active ? (
                              <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
                                Aktif
                              </span>
                            ) : (
                              <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-500">
                                Nonaktif
                              </span>
                            )}
                          </td>

                          <td className="px-5 py-4">
                            <UserStatusButton
                              userId={
                                user.id
                              }
                              active={
                                user.active
                              }
                              isCurrentUser={
                                user.id ===
                                currentUser.id
                              }
                            />
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}