"use client";

import { ChangeEvent, useState } from "react";

import { useRouter } from "next/navigation";

import { useToastFeedback } from "@/components/ui/ToastProvider";

import { LoadingLabel } from "@/components/ui/Loading";

type ReviewAction = "APPROVE" | "REJECT";

type LeaveType = "PERMISSION" | "SICK" | "ANNUAL_LEAVE";

type Props = {
  leaveRequestId: string;

  leaveType: LeaveType;

  hasApprovedDocument: boolean;
};

export default function LeaveReviewActions({
  leaveRequestId,
  leaveType,
  hasApprovedDocument,
}: Props) {
  const router = useRouter();

  const [loadingAction, setLoadingAction] = useState<ReviewAction | null>(null);

  const [finalDocument, setFinalDocument] = useState<File | null>(null);

  const [documentUploading, setDocumentUploading] = useState(false);

  const [localHasApprovedDocument, setLocalHasApprovedDocument] =
    useState(hasApprovedDocument);

  const [fileInputKey, setFileInputKey] = useState(0);

  const { setError, setSuccess } = useToastFeedback();

  const isAnnualLeave = leaveType === "ANNUAL_LEAVE";

  const canApprove = !isAnnualLeave || localHasApprovedDocument;

  function selectFinalDocument(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;

    setError("");
    setSuccess("");

    if (!file) {
      setFinalDocument(null);

      return;
    }

    const name = file.name.toLowerCase();

    const valid = name.endsWith(".docx") || name.endsWith(".pdf");

    if (!valid) {
      setFinalDocument(null);

      setError("Dokumen final harus berupa DOCX atau PDF.");

      setFileInputKey((value) => value + 1);

      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setFinalDocument(null);

      setError("Ukuran dokumen final maksimal 5 MB.");

      setFileInputKey((value) => value + 1);

      return;
    }

    setFinalDocument(file);
  }

  async function uploadFinalDocument() {
    if (!isAnnualLeave || !finalDocument || documentUploading) {
      return;
    }

    setDocumentUploading(true);

    setError("");
    setSuccess("");

    try {
      const form = new FormData();

      form.append("file", finalDocument);

      const response = await fetch(
        `/api/admin/leaves/${leaveRequestId}/approved-document`,
        {
          method: "POST",

          body: form,
        },
      );

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Gagal mengupload dokumen final.");

        return;
      }

      /*
       * Aktifkan approval langsung
       * tanpa harus menunggu refresh
       * selesai.
       */
      setLocalHasApprovedDocument(true);

      setFinalDocument(null);

      setFileInputKey((value) => value + 1);

      setSuccess(
        data.message ??
          "Dokumen final berhasil diupload.",
      );

      router.refresh();
    } catch {
      setError("Terjadi masalah jaringan saat mengupload dokumen final.");
    } finally {
      setDocumentUploading(false);
    }
  }

  async function review(action: ReviewAction) {
    if (loadingAction || documentUploading) {
      return;
    }

    if (action === "APPROVE" && !canApprove) {
      setError(
        "Upload dokumen final yang sudah ditandatangani terlebih dahulu.",
      );

      return;
    }

    const confirmed = window.confirm(
      action === "APPROVE"
        ? isAnnualLeave
          ? "Setujui pengajuan Cuti ini? Saldo cuti akan diperbarui."
          : "Setujui pengajuan ini?"
        : "Tolak pengajuan ini?",
    );

    if (!confirmed) {
      return;
    }

    setLoadingAction(action);

    setError("");
    setSuccess("");

    try {
      const response = await fetch(`/api/admin/leaves/${leaveRequestId}`, {
        method: "PATCH",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          action,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Gagal memproses pengajuan.");

        return;
      }

      router.refresh();
    } catch {
      setError("Terjadi masalah jaringan.");
    } finally {
      setLoadingAction(null);
    }
  }

  return (
    <div className="mt-4">
      {isAnnualLeave && (
        <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm font-semibold text-blue-950">
            Dokumen Final Persetujuan
          </p>

          <p className="mt-1 text-xs leading-5 text-blue-800">
            Download Form Cuti pemohon, lengkapi tanda tangan Atasan dan HRD,
            lalu upload kembali sebagai DOCX atau PDF.
          </p>

          {localHasApprovedDocument && (
            <div className="mt-3 rounded-lg bg-green-100 p-3 text-sm font-medium text-green-800">
              ✓ Dokumen final sudah tersedia. Anda dapat menggantinya selama
              pengajuan masih menunggu.
            </div>
          )}

          <input
            key={fileInputKey}
            type="file"
            accept=".docx,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf"
            disabled={documentUploading || loadingAction !== null}
            onChange={selectFinalDocument}
            className="mt-4 block w-full rounded-xl border border-blue-200 bg-white px-3 py-3 text-sm disabled:opacity-50"
          />

          {finalDocument && (
            <div className="mt-3 rounded-lg bg-white p-3 text-sm text-neutral-700">
              <p className="font-medium">{finalDocument.name}</p>

              <p className="mt-1 text-xs text-neutral-500">
                {(finalDocument.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
          )}

          <button
            type="button"
            disabled={
              !finalDocument || documentUploading || loadingAction !== null
            }
            onClick={uploadFinalDocument}
            className="mt-3 w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            <LoadingLabel
              loading={documentUploading}
              loadingText="Mengupload..."
            >
              {localHasApprovedDocument
                ? "Ganti Dokumen Final"
                : "Upload Dokumen Final"}
            </LoadingLabel>
          </button>
        </div>
      )}

      {isAnnualLeave && !canApprove && (
        <div className="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          Cuti belum dapat disetujui. Upload dokumen final yang sudah
          ditandatangani terlebih dahulu.
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          disabled={loadingAction !== null || documentUploading || !canApprove}
          onClick={() => review("APPROVE")}
          className="rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          <LoadingLabel
            loading={loadingAction === "APPROVE"}
            loadingText="Menyetujui..."
          >
            {isAnnualLeave ? "Setujui Cuti" : "Setujui"}
          </LoadingLabel>
        </button>

        <button
          type="button"
          disabled={loadingAction !== null || documentUploading}
          onClick={() => review("REJECT")}
          className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          <LoadingLabel
            loading={loadingAction === "REJECT"}
            loadingText="Menolak..."
          >
            Tolak
          </LoadingLabel>
        </button>
      </div>
    </div>
  );
}
