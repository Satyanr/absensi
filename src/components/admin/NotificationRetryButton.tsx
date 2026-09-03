"use client";

import {
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

export default function NotificationRetryButton({
  notificationId,
}: {
  notificationId: string;
}) {
  const router =
    useRouter();

  const [loading, setLoading] =
    useState(false);

  async function retry() {
    if (loading) {
      return;
    }

    const confirmed =
      window.confirm(
        "Kirim ulang notifikasi ini?",
      );

    if (!confirmed) {
      return;
    }

    setLoading(true);

    try {
      const response =
        await fetch(
          `/api/admin/notifications/${notificationId}/retry`,
          {
            method:
              "POST",
          },
        );

      const data =
        await response.json();

      if (!response.ok) {
        window.alert(
          data.error ??
            "Gagal mengirim ulang email.",
        );

        return;
      }

      window.alert(
        data.message,
      );

      router.refresh();
    } catch {
      window.alert(
        "Terjadi masalah jaringan.",
      );
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
      {loading
        ? "Mengirim..."
        : "Kirim Ulang"}
    </button>
  );
}