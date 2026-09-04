"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { useToastFeedback } from "@/components/ui/ToastProvider";

type Props = {
  employeeId: string;
  active: boolean;
};

export default function EmployeeStatusButton({ employeeId, active }: Props) {
  const router = useRouter();

  const [loading, setLoading] = useState(false);

  const { setError, setSuccess } = useToastFeedback();

  async function toggleStatus() {
    if (loading) {
      return;
    }

    /*
     * Konfirmasi khusus saat
     * menonaktifkan.
     */
    if (active) {
      const confirmed = window.confirm(
        "Nonaktifkan karyawan ini? Karyawan tidak akan bisa melakukan absensi.",
      );

      if (!confirmed) {
        return;
      }
    }

    setLoading(true);

    try {
      const response = await fetch(`/api/admin/employees/${employeeId}`, {
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
        setError(data.error ?? "Gagal mengubah status.");

        return;
      }

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
      onClick={toggleStatus}
      disabled={loading}
      className={`rounded-lg px-3 py-2 text-xs font-medium ${
        active ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"
      } disabled:opacity-50`}
    >
      {loading ? "Memproses..." : active ? "Nonaktifkan" : "Aktifkan"}
    </button>
  );
}
