"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        identifier: form.get("identifier"),
        secret: form.get("secret"),
      }),
    });
    const data = await response.json();
    setLoading(false);
    if (!response.ok) return setError(data.error ?? "Login gagal.");
    router.replace("/admin/dashboard");
    router.refresh();
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-5">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-sm border border-black/5 space-y-4"
      >
        <div>
          <h1 className="text-2xl font-semibold">Absensi</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Masuk dengan employee code/username/email.
          </p>
        </div>
        <label className="block text-sm font-medium">
          Identitas
          <input
            name="identifier"
            autoComplete="username"
            required
            className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-3"
          />
        </label>
        <label className="block text-sm font-medium">
          Password / PIN
          <input
            name="secret"
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            required
            className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-3"
          />
        </label>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button
          disabled={loading}
          className="w-full rounded-xl bg-black text-white py-3 font-medium disabled:opacity-50"
        >
          {loading ? "Memproses..." : "Masuk"}
        </button>
      </form>
    </main>
  );
}
