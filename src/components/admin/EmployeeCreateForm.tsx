"use client";

import { FormEvent, useState } from "react";

import { useRouter } from "next/navigation";

import { useToastFeedback } from "@/components/ui/ToastProvider";

import { LoadingLabel } from "@/components/ui/Loading";

export default function EmployeeCreateForm() {
  const router = useRouter();

  type EmploymentType = "EMPLOYEE" | "INTERN";

  const [employmentType, setEmploymentType] =
    useState<EmploymentType>("EMPLOYEE");

  const [codeNumber, setCodeNumber] = useState("");

  const codePrefix = employmentType === "INTERN" ? "MAG" : "EMP";

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
          employmentType,
          codeNumber,
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

      setSuccess(data.message ?? "Personel berhasil ditambahkan.");

      /*
       * Kosongkan form.
       */
      setEmploymentType("EMPLOYEE");
      setCodeNumber("");
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
        <h2 className="text-lg font-semibold">Tambah Personel</h2>

        <p className="mt-1 text-sm text-neutral-500">
          Tambahkan karyawan atau magang baru ke sistem absensi.
        </p>
      </div>

      <div className="mt-5 space-y-4">
        <div>
          <label className="text-sm font-medium">Jenis Personel</label>

          <select
            value={employmentType}
            onChange={(event) => {
              const next = event.target.value as EmploymentType;

              setEmploymentType(next);

              setLeaveEligible(next === "EMPLOYEE");
            }}
            className="mt-2 w-full rounded-xl border border-neutral-300 bg-white px-4 py-3"
          >
            <option value="EMPLOYEE">Karyawan</option>

            <option value="INTERN">Magang</option>
          </select>
        </div>

        <div>
          <label className="text-sm font-medium">Kode</label>

          <div className="mt-2 flex overflow-hidden rounded-xl border border-neutral-300 focus-within:border-blue-500">
            <div className="flex min-w-[72px] items-center justify-center border-r border-neutral-300 bg-neutral-100 px-4 font-bold text-neutral-600">
              {codePrefix}
            </div>

            <input
              value={codeNumber}
              onChange={(event) =>
                setCodeNumber(
                  event.target.value.replace(/\D/g, "").slice(0, 10),
                )
              }
              required
              inputMode="numeric"
              placeholder="001"
              autoComplete="off"
              className="min-w-0 flex-1 px-4 py-3 outline-none"
            />
          </div>

          <p className="mt-1 text-xs text-neutral-500">
            Kode:{" "}
            <span className="font-semibold">
              {codePrefix}
              {codeNumber || "___"}
            </span>
          </p>
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
