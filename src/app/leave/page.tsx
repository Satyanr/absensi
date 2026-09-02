"use client";

import Link from "next/link";

import { useSearchParams } from "next/navigation";

import { FormEvent, useEffect, useState } from "react";

type Employee = {
  employeeCode: string;
  name: string;
};

type LeaveType = "PERMISSION" | "SICK" | "ANNUAL_LEAVE";

export default function PublicLeavePage() {
  const searchParams = useSearchParams();

  const initialEmployeeCode = searchParams.get("employeeCode");

  const [employeeCode, setEmployeeCode] = useState(initialEmployeeCode ?? "");

  const [employee, setEmployee] = useState<Employee | null>(null);

  const [type, setType] = useState<LeaveType>("PERMISSION");

  const [startDate, setStartDate] = useState("");

  const [endDate, setEndDate] = useState("");

  const [reason, setReason] = useState("");

  const [lookupLoading, setLookupLoading] = useState(false);

  const [submitting, setSubmitting] = useState(false);

  const [error, setError] = useState("");

  const [success, setSuccess] = useState("");

  async function lookupEmployee(code: string) {
    const cleanCode = code.trim();

    if (!cleanCode) {
      setError("Kode karyawan wajib diisi.");

      return;
    }

    setLookupLoading(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(
        `/api/employees/lookup?code=${encodeURIComponent(cleanCode)}`,
      );

      const data = await response.json();

      if (!response.ok) {
        setEmployee(null);

        setError(data.error ?? "Karyawan tidak ditemukan.");

        return;
      }

      setEmployee(data.employee);

      setEmployeeCode(data.employee.employeeCode);
    } catch {
      setEmployee(null);

      setError("Terjadi masalah jaringan.");
    } finally {
      setLookupLoading(false);
    }
  }

  useEffect(() => {
    if (!initialEmployeeCode) {
      return;
    }

    void lookupEmployee(initialEmployeeCode);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEmployeeCode]);

  async function searchEmployee(event: FormEvent) {
    event.preventDefault();

    await lookupEmployee(employeeCode);
  }

  async function submitLeave(event: FormEvent) {
    event.preventDefault();

    if (!employee) {
      return;
    }

    if (submitting) {
      return;
    }

    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/leaves", {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          employeeCode: employee.employeeCode,

          type,
          startDate,
          endDate,
          reason,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Gagal mengirim pengajuan.");

        return;
      }

      setSuccess(data.message ?? "Pengajuan berhasil dikirim.");

      setType("PERMISSION");
      setStartDate("");
      setEndDate("");
      setReason("");
    } catch {
      setError("Terjadi masalah jaringan.");
    } finally {
      setSubmitting(false);
    }
  }

  function resetEmployee() {
    setEmployee(null);
    setEmployeeCode("");

    setType("PERMISSION");
    setStartDate("");
    setEndDate("");
    setReason("");

    setError("");
    setSuccess("");
  }

  return (
    <main className="min-h-screen bg-neutral-100 px-4 py-8">
      <div className="mx-auto max-w-md space-y-4">
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold">Izin, Sakit & Cuti</h1>

          <p className="mt-2 text-sm text-neutral-500">
            Kirim pengajuan tanpa login. Pengajuan akan diperiksa oleh admin.
          </p>
        </div>

        {error && (
          <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {success && (
          <div className="rounded-xl bg-green-50 p-4 text-sm font-medium text-green-700">
            {success}
          </div>
        )}

        {lookupLoading && initialEmployeeCode && (
          <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
            <p className="text-sm text-neutral-500">Memuat data karyawan...</p>
          </div>
        )}

        {!employee && !lookupLoading && (
          <form
            onSubmit={searchEmployee}
            className="rounded-2xl bg-white p-6 shadow-sm"
          >
            <label className="text-sm font-medium">Kode Karyawan</label>

            <input
              value={employeeCode}
              onChange={(event) => setEmployeeCode(event.target.value)}
              placeholder="Contoh: EMP001"
              autoComplete="off"
              className="mt-2 w-full rounded-xl border border-neutral-300 px-4 py-3 outline-none focus:border-blue-500"
            />

            <button
              type="submit"
              disabled={lookupLoading}
              className="mt-4 w-full rounded-xl bg-blue-600 py-3 font-semibold text-white disabled:opacity-50"
            >
              {lookupLoading ? "Mencari..." : "Cari Karyawan"}
            </button>
          </form>
        )}

        {employee && (
          <>
            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-neutral-500">
                Karyawan
              </p>

              <h2 className="mt-1 text-xl font-bold">{employee.name}</h2>

              <p className="text-sm text-neutral-500">
                {employee.employeeCode}
              </p>

              <button
                type="button"
                onClick={resetEmployee}
                className="mt-3 text-sm font-medium text-neutral-500 underline"
              >
                Ganti Karyawan
              </button>
            </div>

            <form
              onSubmit={submitLeave}
              className="rounded-2xl bg-white p-6 shadow-sm"
            >
              <h2 className="font-semibold">Buat Pengajuan</h2>

              <div className="mt-5 space-y-4">
                <div>
                  <label className="text-sm font-medium">Jenis Pengajuan</label>

                  <select
                    value={type}
                    onChange={(event) =>
                      setType(event.target.value as LeaveType)
                    }
                    className="mt-2 w-full rounded-xl border border-neutral-300 bg-white px-4 py-3"
                  >
                    <option value="PERMISSION">Izin</option>

                    <option value="SICK">Sakit</option>

                    <option value="ANNUAL_LEAVE">Cuti</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium">Dari</label>

                    <input
                      type="date"
                      value={startDate}
                      onChange={(event) => setStartDate(event.target.value)}
                      required
                      className="mt-2 w-full rounded-xl border border-neutral-300 px-3 py-3"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium">Sampai</label>

                    <input
                      type="date"
                      value={endDate}
                      onChange={(event) => setEndDate(event.target.value)}
                      required
                      className="mt-2 w-full rounded-xl border border-neutral-300 px-3 py-3"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium">Alasan</label>

                  <textarea
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    rows={4}
                    required
                    placeholder={
                      type === "SICK"
                        ? "Contoh: Demam dan perlu istirahat"
                        : type === "ANNUAL_LEAVE"
                          ? "Contoh: Keperluan keluarga"
                          : "Tuliskan alasan pengajuan"
                    }
                    className="mt-2 w-full resize-none rounded-xl border border-neutral-300 px-4 py-3"
                  />
                </div>
              </div>

              <div className="mt-5 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
                Pengajuan tidak langsung disetujui. Status awal selalu menunggu
                persetujuan admin.
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="mt-5 w-full rounded-xl bg-blue-600 py-3 font-semibold text-white disabled:opacity-50"
              >
                {submitting ? "Mengirim..." : "Kirim Pengajuan"}
              </button>
            </form>
          </>
        )}

        <div className="pb-6 text-center">
          <Link href="/" className="text-sm text-neutral-500 underline">
            Kembali ke Absensi
          </Link>
        </div>
      </div>
    </main>
  );
}
