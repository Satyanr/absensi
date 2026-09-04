"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { useToastFeedback } from "@/components/ui/ToastProvider";

import { LoadingLabel } from "@/components/ui/Loading";

type Props = {
  userId: string;

  active: boolean;

  isCurrentUser?: boolean;
};

export default function UserStatusButton({
  userId,
  active,
  isCurrentUser = false,
}: Props) {
  const router = useRouter();

  const [loading, setLoading] = useState(false);

  const { setError, setSuccess } = useToastFeedback();

  async function updateStatus() {
    if (loading || isCurrentUser) {
      return;
    }

    const confirmed = window.confirm(
      active ? "Nonaktifkan user ini?" : "Aktifkan kembali user ini?",
    );

    if (!confirmed) {
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          active: !active,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Gagal mengubah status user.");

        return;
      }

      setSuccess(
        data.message ??
          (active
            ? "User berhasil dinonaktifkan."
            : "User berhasil diaktifkan."),
      );

      router.refresh();
    } catch {
      setError("Terjadi masalah jaringan.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={updateStatus}
      disabled={loading || isCurrentUser}
      className={`rounded-lg px-3 py-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"
      }`}
    >
      {isCurrentUser ? (
        "Akun Anda"
      ) : (
        <LoadingLabel loading={loading} loadingText="Memproses...">
          {active ? "Nonaktifkan" : "Aktifkan"}
        </LoadingLabel>
      )}
    </button>
  );
}
