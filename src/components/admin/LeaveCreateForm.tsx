"use client";

import { FormEvent, useState } from "react";

import { useRouter } from "next/navigation";

import { useToastFeedback } from "@/components/ui/ToastProvider";

type Employee = {
  id: string;
  employeeCode: string;
  name: string;
  leaveEligible: boolean;
};

export default function LeaveCreateForm({
  employees,
}: {
  employees: Employee[];
}) {
  const router = useRouter();

  const [employeeId, setEmployeeId] = useState("");

  const [type, setType] = useState<"PERMISSION" | "SICK">("PERMISSION");

  const [startDate, setStartDate] = useState("");

  const [endDate, setEndDate] = useState("");

  const [reason, setReason] = useState("");

  const [loading, setLoading] = useState(false);

  const { setError, setSuccess } = useToastFeedback();

  async function submit(event: FormEvent) {
    event.preventDefault();

    if (loading) {
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/admin/leaves", {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          employeeId,
          type,
          startDate,
          endDate,
          reason,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Gagal membuat pengajuan.");

        return;
      }

      setSuccess("Pengajuan berhasil dibuat.");

      setEmployeeId("");
      setType("PERMISSION");
      setStartDate("");
      setEndDate("");
      setReason("");

      router.refresh();
    } catch {
      setError("Terjadi masalah jaringan.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-2xl bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold">Buat Pengajuan</h2>

      <p className="mt-1 text-sm text-neutral-500">
        Catat izin atau sakit karyawan. Pengajuan Cuti dilakukan oleh pemohon
        melalui halaman publik.
      </p>

      <div className="mt-5 space-y-4">
        <div>
          <label className="text-sm font-medium">Karyawan</label>

          <select
            value={employeeId}
            onChange={(event) => setEmployeeId(event.target.value)}
            required
            className="mt-2 w-full rounded-xl border border-neutral-300 bg-white px-4 py-3"
          >
            <option value="">Pilih Karyawan</option>

            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.employeeCode} - {employee.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-sm font-medium">Jenis</label>

          <select
            value={type}
            onChange={(event) =>
              setType(event.target.value as "PERMISSION" | "SICK")
            }
            className="mt-2 w-full rounded-xl border border-neutral-300 bg-white px-4 py-3"
          >
            <option value="PERMISSION">Izin</option>

            <option value="SICK">Sakit</option>
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
            placeholder="Contoh: Keperluan keluarga"
            className="mt-2 w-full resize-none rounded-xl border border-neutral-300 px-4 py-3"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="mt-5 w-full rounded-xl bg-blue-600 py-3 font-semibold text-white disabled:opacity-50"
      >
        {loading ? "Menyimpan..." : "Simpan Pengajuan"}
      </button>
    </form>
  );
}
