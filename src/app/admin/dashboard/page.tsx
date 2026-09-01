import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const displayName = user.employee?.name ?? user.username ?? user.email ?? "User";

  return (
    <main className="min-h-screen p-5 max-w-xl mx-auto">
      <section className="rounded-2xl bg-white p-6 border border-black/5 shadow-sm">
        <p className="text-sm text-neutral-500">Phase 1 foundation</p>
        <h1 className="mt-1 text-2xl font-semibold">Halo, {displayName}</h1>
        <p className="mt-3 text-neutral-600">Autentikasi session-based, PostgreSQL, Prisma, dan deployment Docker sudah disiapkan. Kamera + GPS masuk Phase 2.</p>
        <dl className="grid grid-cols-2 gap-3 mt-5 text-sm"><div><dt className="text-neutral-500">Role</dt><dd className="font-medium">{user.role}</dd></div><div><dt className="text-neutral-500">Employee</dt><dd className="font-medium">{user.employee?.employeeCode ?? "—"}</dd></div></dl>
        <form action="/api/auth/logout" method="post"><button className="mt-6 rounded-xl border border-neutral-300 px-4 py-2">Keluar</button></form>
      </section>
    </main>
  );
}
