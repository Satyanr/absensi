"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToastFeedback } from "@/components/ui/ToastProvider";
import { LoadingLabel } from "@/components/ui/Loading";

type Props = {
  leaveRequestId: string;
  employeeName: string;
  period: string;
};

export default function LeaveDeleteButton({
  leaveRequestId,
  employeeName,
  period,
}: Props) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { setError, setSuccess } = useToastFeedback();

  async function remove() {
    if (
      loading ||
      !window.confirm(
        `Hapus pengajuan ${employeeName} (${period})? Pengajuan dan lampirannya akan dihapus permanen. Saldo cuti yang terpakai dikembalikan dan status izin/sakit/cuti pada tanggal terkait dihapus.`,
      )
    ) {
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/admin/leaves/${leaveRequestId}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Gagal menghapus pengajuan.");
        return;
      }
      setSuccess(data.message);
      router.refresh();
    } catch {
      setError("Terjadi masalah jaringan saat menghapus pengajuan.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={remove}
      disabled={loading}
      className="mt-4 rounded-xl border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50"
    >
      <LoadingLabel loading={loading} loadingText="Menghapus...">
        Hapus Pengajuan
      </LoadingLabel>
    </button>
  );
}
