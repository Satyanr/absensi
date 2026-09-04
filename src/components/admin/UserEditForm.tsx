"use client";

import { FormEvent, useState } from "react";

import { useRouter } from "next/navigation";

import { useToastFeedback } from "@/components/ui/ToastProvider";

import { LoadingLabel } from "@/components/ui/Loading";

type UserData = {
  id: string;

  email: string;

  username: string | null;

  role: "ADMIN" | "LEADER";
};

type Props = {
  user: UserData;

  isCurrentUser: boolean;
};

export default function UserEditForm({ user, isCurrentUser }: Props) {
  const router = useRouter();

  const [email, setEmail] = useState(user.email);

  const [username, setUsername] = useState(user.username ?? "");

  const [role, setRole] = useState<"ADMIN" | "LEADER">(user.role);

  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);

  const { setError, setSuccess } = useToastFeedback();

  async function submit(event: FormEvent) {
    event.preventDefault();

    if (loading) {
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const newPassword = password.trim();

      const roleChanged = role !== user.role;

      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          email,

          username: username.trim() || null,

          role,

          ...(newPassword
            ? {
                password: newPassword,
              }
            : {}),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Gagal menyimpan perubahan.");

        return;
      }

      /*
       * Password / role sendiri
       * menyebabkan session dicabut.
       */
      if (isCurrentUser && (newPassword || roleChanged)) {
        window.location.href = "/admin/login";

        return;
      }

      setPassword("");

      setSuccess("User berhasil diperbarui.");

      router.refresh();
    } catch {
      setError("Terjadi masalah jaringan.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-2xl bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold">Edit User</h2>

      {isCurrentUser && (
        <div className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          Ini adalah akun yang sedang Anda gunakan. Mengganti password atau role
          akan mengakhiri sesi login saat ini.
        </div>
      )}

      <div className="mt-5 space-y-4">
        <div>
          <label className="text-sm font-medium">Email</label>

          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-2 w-full rounded-xl border border-neutral-300 px-4 py-3"
          />
        </div>

        <div>
          <label className="text-sm font-medium">Username</label>

          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Opsional"
            className="mt-2 w-full rounded-xl border border-neutral-300 px-4 py-3"
          />
        </div>

        <div>
          <label className="text-sm font-medium">Role</label>

          <select
            value={role}
            onChange={(event) =>
              setRole(event.target.value as "ADMIN" | "LEADER")
            }
            className="mt-2 w-full rounded-xl border border-neutral-300 bg-white px-4 py-3"
          >
            <option value="ADMIN">Admin</option>

            <option value="LEADER">Leader</option>
          </select>
        </div>

        <div>
          <label className="text-sm font-medium">Reset Password</label>

          <input
            type="password"
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Kosongkan jika tidak diganti"
            className="mt-2 w-full rounded-xl border border-neutral-300 px-4 py-3"
          />

          <p className="mt-1 text-xs text-neutral-500">
            Minimal 8 karakter. Semua sesi user akan dicabut jika password
            diubah.
          </p>
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="mt-5 w-full rounded-xl bg-blue-600 py-3 font-semibold text-white disabled:opacity-50"
      >
        <LoadingLabel loading={loading} loadingText="Menyimpan...">
          Simpan Perubahan
        </LoadingLabel>
      </button>
    </form>
  );
}
