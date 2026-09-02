"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ReviewAction =
  | "APPROVE"
  | "REJECT";

export default function LeaveReviewActions({
  leaveRequestId,
}: {
  leaveRequestId: string;
}) {
  const router = useRouter();

  const [
    loadingAction,
    setLoadingAction,
  ] = useState<ReviewAction | null>(
    null
  );

  const [error, setError] =
    useState("");

  async function review(
    action: ReviewAction
  ) {
    if (loadingAction) {
      return;
    }

    const confirmed =
      window.confirm(
        action === "APPROVE"
          ? "Setujui pengajuan ini?"
          : "Tolak pengajuan ini?"
      );

    if (!confirmed) {
      return;
    }

    setLoadingAction(action);
    setError("");

    try {
      const response = await fetch(
        `/api/admin/leaves/${leaveRequestId}`,
        {
          method: "PATCH",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            action,
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        setError(
          data.error ??
            "Gagal memproses pengajuan."
        );

        return;
      }

      router.refresh();
    } catch {
      setError(
        "Terjadi masalah jaringan."
      );
    } finally {
      setLoadingAction(null);
    }
  }

  return (
    <div className="mt-4">
      {error && (
        <div className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={loadingAction !== null}
          onClick={() =>
            review("APPROVE")
          }
          className="rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {loadingAction === "APPROVE"
            ? "Menyetujui..."
            : "Setujui"}
        </button>

        <button
          type="button"
          disabled={loadingAction !== null}
          onClick={() =>
            review("REJECT")
          }
          className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {loadingAction === "REJECT"
            ? "Menolak..."
            : "Tolak"}
        </button>
      </div>
    </div>
  );
}