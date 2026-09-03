import AdminNavigationClient from "@/components/admin/AdminNavigationClient";

import {
  getCurrentUser,
} from "@/lib/auth/session";

export default async function AdminNavigation() {
  const user =
    await getCurrentUser();

  return (
    <AdminNavigationClient
      role={
        user?.role ?? null
      }
    />
  );
}