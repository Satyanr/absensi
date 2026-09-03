"use client";

import {
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

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
  const router =
    useRouter();

  const [loading, setLoading] =
    useState(false);

  async function updateStatus() {
    if (
      loading ||
      isCurrentUser
    ) {
      return;
    }

    const confirmed =
      window.confirm(
        active
          ? "Nonaktifkan user ini?"
          : "Aktifkan kembali user ini?",
      );

    if (!confirmed) {
      return;
    }

    setLoading(true);

    try {
      const response =
        await fetch(
          `/api/admin/users/${userId}`,
          {
            method:
              "PATCH",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                active:
                  !active,
              }),
          },
        );

      const data =
        await response.json();

      if (!response.ok) {
        window.alert(
          data.error ??
            "Gagal mengubah status user.",
        );

        return;
      }

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
      onClick={updateStatus}
      disabled={
        loading ||
        isCurrentUser
      }
      className={`rounded-lg px-3 py-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? "bg-red-50 text-red-700"
          : "bg-green-50 text-green-700"
      }`}
    >
      {isCurrentUser
        ? "Akun Anda"
        : loading
          ? "Memproses..."
          : active
            ? "Nonaktifkan"
            : "Aktifkan"}
    </button>
  );
}