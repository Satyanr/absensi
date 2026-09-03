"use client";

import {
  FormEvent,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

type Props = {
  leaveRequestId:
    string;

  employeeName:
    string;

  startDate:
    string;

  endDate:
    string;
};

export default function LeaveAdjustmentForm({
  leaveRequestId,
  employeeName,
  startDate:
    originalStartDate,
  endDate:
    originalEndDate,
}: Props) {
  const router =
    useRouter();

  const [
    open,
    setOpen,
  ] = useState(false);

  const [
    startDate,
    setStartDate,
  ] = useState(
    originalStartDate,
  );

  const [
    endDate,
    setEndDate,
  ] = useState(
    originalEndDate,
  );

  const [
    reason,
    setReason,
  ] = useState("");

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  async function submit(
    event: FormEvent,
  ) {
    event.preventDefault();

    if (loading) {
      return;
    }

    const confirmed =
      window.confirm(
        `Koreksi periode Cuti ${employeeName}?\n\nSaldo hari yang dibatalkan akan otomatis dikembalikan.`,
      );

    if (!confirmed) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response =
        await fetch(
          `/api/admin/leaves/${leaveRequestId}/adjust`,
          {
            method:
              "PATCH",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                startDate,
                endDate,
                reason,
              }),
          },
        );

      const data =
        await response.json();

      if (!response.ok) {
        setError(
          data.error ??
            "Gagal mengoreksi Cuti.",
        );

        return;
      }

      window.alert(
        data.message ??
          "Cuti berhasil dikoreksi.",
      );

      setOpen(false);

      router.refresh();
    } catch {
      setError(
        "Terjadi masalah jaringan.",
      );
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() =>
          setOpen(true)
        }
        className="mt-3 rounded-xl border border-amber-500 px-4 py-2 text-sm font-semibold text-amber-700"
      >
        Koreksi Cuti
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-semibold text-amber-950">
            Koreksi Periode Cuti
          </p>

          <p className="mt-1 text-xs leading-5 text-amber-800">
            Hanya dapat memperpendek
            periode yang sudah
            disetujui. Saldo akan
            dikembalikan otomatis.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError("");
          }}
          className="text-sm font-medium text-neutral-500"
        >
          Tutup
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded-lg bg-red-100 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium">
            Dari
          </label>

          <input
            type="date"
            value={
              startDate
            }
            min={
              originalStartDate
            }
            max={
              endDate
            }
            onChange={(
              event,
            ) =>
              setStartDate(
                event.target
                  .value,
              )
            }
            required
            className="mt-2 w-full rounded-xl border border-amber-200 bg-white px-3 py-3"
          />
        </div>

        <div>
          <label className="text-xs font-medium">
            Sampai
          </label>

          <input
            type="date"
            value={
              endDate
            }
            min={
              startDate
            }
            max={
              originalEndDate
            }
            onChange={(
              event,
            ) =>
              setEndDate(
                event.target
                  .value,
              )
            }
            required
            className="mt-2 w-full rounded-xl border border-amber-200 bg-white px-3 py-3"
          />
        </div>
      </div>

      <div className="mt-3">
        <label className="text-xs font-medium">
          Alasan Koreksi
        </label>

        <textarea
          value={reason}
          onChange={(
            event,
          ) =>
            setReason(
              event.target
                .value,
            )
          }
          required
          minLength={3}
          maxLength={500}
          rows={3}
          placeholder="Contoh: Karyawan kembali bekerja lebih awal karena kebutuhan operasional."
          className="mt-2 w-full resize-none rounded-xl border border-amber-200 bg-white px-3 py-3"
        />
      </div>

      <div className="mt-3 rounded-lg bg-white p-3 text-xs leading-5 text-neutral-600">
        Dokumen final yang sudah
        ditandatangani tetap disimpan
        sebagai arsip approval awal.
        Tanggal hasil koreksi menjadi
        tanggal resmi di sistem dan
        laporan.
      </div>

      <button
        type="submit"
        disabled={loading}
        className="mt-4 w-full rounded-xl bg-amber-600 py-3 text-sm font-semibold text-white disabled:opacity-50"
      >
        {loading
          ? "Menyimpan..."
          : "Simpan Koreksi Cuti"}
      </button>
    </form>
  );
}