"use client";

import { FormEvent, useState } from "react";

import { useRouter } from "next/navigation";

import { useToastFeedback } from "@/components/ui/ToastProvider";

import { LoadingLabel } from "@/components/ui/Loading";

export default function UserCreateForm() {
  const router = useRouter();

  const [email, setEmail] = useState("");

  const [username, setUsername] = useState("");

  const [password, setPassword] = useState("");

  const [role, setRole] = useState<"ADMIN" | "LEADER">("LEADER");

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
      const response = await fetch("/api/admin/users", {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          email,

          username: username.trim() || undefined,

          password,

          role,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Gagal menambahkan user.");

        return;
      }

      setSuccess("User berhasil ditambahkan.");

      setEmail("");
      setUsername("");
      setPassword("");
      setRole("LEADER");

      router.refresh();
    } catch {
      setError("Terjadi masalah jaringan.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-2xl bg-white p-5 shadow-sm">
      <h2 className="font-semibold">Tambah User</h2>

      <p className="mt-1 text-sm text-neutral-500">
        Buat akun Admin atau Leader.
      </p>

      <div className="mt-5 space-y-4">
        <div>
          <label htmlFor="user-email" className="text-sm font-medium">
            Email
          </label>

          <input
            id="user-email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-2 w-full rounded-xl border border-neutral-300 px-4 py-3"
          />
        </div>

        <div>
          <label htmlFor="username" className="text-sm font-medium">
            Username
          </label>

          <input
            id="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Opsional"
            className="mt-2 w-full rounded-xl border border-neutral-300 px-4 py-3"
          />
        </div>

        <div>
          <label htmlFor="user-password" className="text-sm font-medium">
            Password
          </label>

          <input
            id="user-password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-2 w-full rounded-xl border border-neutral-300 px-4 py-3"
          />

          <p className="mt-1 text-xs text-neutral-500">Minimal 8 karakter.</p>
        </div>

        <div>
          <label htmlFor="user-role" className="text-sm font-medium">
            Role
          </label>

          <select
            id="user-role"
            value={role}
            onChange={(event) =>
              setRole(event.target.value as "ADMIN" | "LEADER")
            }
            className="mt-2 w-full rounded-xl border border-neutral-300 bg-white px-4 py-3"
          >
            <option value="LEADER">Leader</option>

            <option value="ADMIN">Admin</option>
          </select>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-blue-600 py-3 font-semibold text-white disabled:opacity-50"
        >
          <LoadingLabel loading={loading} loadingText="Menyimpan...">
            Tambah User
          </LoadingLabel>
        </button>
      </div>
    </form>
  );
}
