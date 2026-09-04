"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { useToastFeedback } from "@/components/ui/ToastProvider";

import { LoadingLabel } from "@/components/ui/Loading";

export default function NotificationRetryButton({
  notificationId,
}: {
  notificationId: string;
}) {
  const router = useRouter();

  const [loading, setLoading] = useState(false);

  const { setError, setSuccess } = useToastFeedback();

  async function retry() {
    if (loading) {
      return;
    }

    const confirmed = window.confirm("Kirim ulang notifikasi ini?");

    if (!confirmed) {
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        `/api/admin/notifications/${notificationId}/retry`,
        {
          method: "POST",
        },
      );

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Gagal mengirim ulang email.");

        return;
      }

      setSuccess(data.message);

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
      disabled={loading}
      onClick={retry}
      className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 disabled:opacity-50"
    >
      <LoadingLabel loading={loading} loadingText="Mengirim...">
        Kirim Ulang
      </LoadingLabel>
    </button>
  );
}
