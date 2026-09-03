import Link from "next/link";

import {
  notFound,
  redirect,
} from "next/navigation";

import AdminNavigation from "@/components/admin/AdminNavigation";
import UserEditForm from "@/components/admin/UserEditForm";

import {
  getCurrentUser,
} from "@/lib/auth/session";

import {
  prisma,
} from "@/lib/prisma";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export default async function UserEditPage({
  params,
}: Props) {
  const currentUser =
    await getCurrentUser();

  if (!currentUser) {
    redirect(
      "/admin/login",
    );
  }

  if (
    currentUser.role !==
    "ADMIN"
  ) {
    redirect(
      "/admin/dashboard",
    );
  }

  const { id } =
    await params;

  const user =
    await prisma.user.findFirst({
      where: {
        id,

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
      },
    });

  if (!user || !user.email) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-neutral-100">
      <div className="mx-auto max-w-6xl p-4 md:p-8">
        <AdminNavigation />

        <div className="mx-auto mt-6 max-w-xl">
          <Link
            href="/admin/users"
            className="text-sm text-blue-600"
          >
            ← Kembali ke User
          </Link>

          <div className="mt-4">
            <UserEditForm
              user={{
                id:
                  user.id,

                email:
                  user.email,

                username:
                  user.username,

                role:
                  user.role,
              }}
              isCurrentUser={
                user.id ===
                currentUser.id
              }
            />
          </div>

          <div className="mt-4 rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-neutral-500">
              Status User
            </p>

            <p className="mt-1 font-semibold">
              {user.active
                ? "Aktif"
                : "Nonaktif"}
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}