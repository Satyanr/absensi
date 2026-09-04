"use client";

import { FormEvent, useState } from "react";

import { useRouter } from "next/navigation";

import { useToastFeedback } from "@/components/ui/ToastProvider";

import { LoadingLabel } from "@/components/ui/Loading";

export default function EmployeeCreateForm() {
  const router = useRouter();

  const [employeeCode, setEmployeeCode] = useState("");

  const [name, setName] = useState("");

  const [email, setEmail] = useState("");

  const [phone, setPhone] = useState("");

  const [joinDate, setJoinDate] = useState("");

  const [leaveEligible, setLeaveEligible] = useState(true);

  const [loading, setLoading] = useState(false);

  const { setError, setSuccess } = useToastFeedback();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (loading) {
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/admin/employees", {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          employeeCode,
          name,
          email,
          phone,
          joinDate,
          leaveEligible,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Gagal menambah karyawan.");

        return;
      }

      setSuccess("Karyawan berhasil ditambahkan.");

      /*
       * Kosongkan form.
       */
      setEmployeeCode("");
      setName("");
      setEmail("");
      setPhone("");
      setJoinDate("");
      setLeaveEligible(true);

      /*
       * Refresh Server Component
       * agar daftar karyawan terbaru
       * langsung muncul.
       */
      router.refresh();
    } catch {
      setError("Terjadi masalah jaringan.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl bg-white p-5 shadow-sm"
    >
      <div>
        <h2 className="text-lg font-semibold">Tambah Karyawan</h2>

        <p className="mt-1 text-sm text-neutral-500">
          Tambahkan karyawan baru ke sistem absensi.
        </p>
      </div>

      <div className="mt-5 space-y-4">
        <div>
          <label className="text-sm font-medium">Kode Karyawan</label>

          <input
            value={employeeCode}
            onChange={(event) => setEmployeeCode(event.target.value)}
            placeholder="Contoh: EMP003"
            autoComplete="off"
            className="mt-2 w-full rounded-xl border border-neutral-300 px-4 py-3 outline-none focus:border-blue-500"
          />
        </div>

        <div>
          <label className="text-sm font-medium">Nama</label>

          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Nama karyawan"
            className="mt-2 w-full rounded-xl border border-neutral-300 px-4 py-3 outline-none focus:border-blue-500"
          />
        </div>

        <div>
          <label className="text-sm font-medium">Email</label>

          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Opsional"
            className="mt-2 w-full rounded-xl border border-neutral-300 px-4 py-3 outline-none focus:border-blue-500"
          />
        </div>

        <div>
          <label className="text-sm font-medium">Telepon</label>

          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="Opsional"
            className="mt-2 w-full rounded-xl border border-neutral-300 px-4 py-3 outline-none focus:border-blue-500"
          />
        </div>

        <div>
          <label className="text-sm font-medium">Tanggal Masuk</label>

          <input
            type="date"
            value={joinDate}
            onChange={(event) => setJoinDate(event.target.value)}
            className="mt-2 w-full rounded-xl border border-neutral-300 px-4 py-3 outline-none focus:border-blue-500"
          />
        </div>

        <label className="flex items-center gap-3 rounded-xl bg-neutral-50 p-4">
          <input
            type="checkbox"
            checked={leaveEligible}
            onChange={(event) => setLeaveEligible(event.target.checked)}
          />

          <div>
            <p className="text-sm font-medium">Berhak Cuti</p>

            <p className="text-xs text-neutral-500">
              Karyawan dapat memiliki saldo cuti.
            </p>
          </div>
        </label>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="mt-5 w-full rounded-xl bg-blue-600 py-3 font-semibold text-white disabled:opacity-50"
      >
        <LoadingLabel loading={loading} loadingText="Menyimpan...">
          Simpan
        </LoadingLabel>
      </button>
    </form>
  );
}
