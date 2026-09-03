"use client";

import Link from "next/link";

import { useSearchParams } from "next/navigation";

import { FormEvent, Suspense, useEffect, useState } from "react";

type Employee = {
  employeeCode: string;
  name: string;
};

type LeaveType = "PERMISSION" | "SICK" | "ANNUAL_LEAVE";

function normalizeEmployeeCode(value: string) {
  const cleaned = value.toUpperCase().replace(/\s+/g, "");

  const suffix = cleaned.startsWith("EMP") ? cleaned.slice(3) : cleaned;

  return `EMP${suffix}`;
}

function PublicLeaveContent() {
  const searchParams = useSearchParams();

  const initialEmployeeCode = searchParams.get("employeeCode");

  const [employeeCode, setEmployeeCode] = useState(
    normalizeEmployeeCode(initialEmployeeCode ?? ""),
  );

  const [employee, setEmployee] = useState<Employee | null>(null);

  const [type, setType] = useState<LeaveType>("PERMISSION");

  const [startDate, setStartDate] = useState("");

  const [endDate, setEndDate] = useState("");

  const [reason, setReason] = useState("");

  const [attachment, setAttachment] = useState<File | null>(null);

  const [attachmentResetKey, setAttachmentResetKey] = useState(0);

  const [templateDownloading, setTemplateDownloading] = useState(false);

  const [lookupLoading, setLookupLoading] = useState(false);

  const [submitting, setSubmitting] = useState(false);

  const [error, setError] = useState("");

  const [success, setSuccess] = useState("");

  async function lookupEmployee(code: string) {
    const cleanCode = normalizeEmployeeCode(code.trim());

    if (cleanCode === "EMP") {
      setError("Nomor kode karyawan wajib diisi.");

      return;
    }

    setEmployeeCode(cleanCode);
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
      const form = new FormData();

      form.append("employeeCode", employee.employeeCode);

      form.append("type", type);

      form.append("startDate", startDate);

      form.append("endDate", endDate);

      form.append("reason", reason);

      if (attachment) {
        form.append("attachment", attachment);
      }

      const response = await fetch("/api/leaves", {
        method: "POST",

        body: form,
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
      setAttachment(null);

      setAttachmentResetKey((value) => value + 1);
    } catch {
      setError("Terjadi masalah jaringan.");
    } finally {
      setSubmitting(false);
    }
  }

  async function downloadAnnualLeaveForm() {
    if (!employee) {
      return;
    }

    if (!startDate || !endDate) {
      setError("Isi tanggal mulai dan tanggal selesai terlebih dahulu.");

      return;
    }

    if (reason.trim().length < 3) {
      setError("Isi alasan cuti terlebih dahulu.");

      return;
    }

    if (templateDownloading) {
      return;
    }

    setTemplateDownloading(true);

    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/leaves/annual-form", {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          employeeCode: employee.employeeCode,

          startDate,
          endDate,
          reason,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);

        setError(data?.error ?? "Gagal membuat Form Pengajuan Cuti.");

        return;
      }

      const blob = await response.blob();

      const url = URL.createObjectURL(blob);

      const link = document.createElement("a");

      link.href = url;

      link.download = `Form-Cuti-${employee.employeeCode}-${startDate}.docx`;

      document.body.appendChild(link);

      link.click();

      link.remove();

      /*
       * Beri Safari sedikit waktu
       * sebelum blob URL dibuang.
       */
      window.setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 1000);
    } catch {
      setError("Terjadi masalah jaringan saat membuat form cuti.");
    } finally {
      setTemplateDownloading(false);
    }
  }

  function resetEmployee() {
    setEmployee(null);
    setEmployeeCode("EMP");

    setType("PERMISSION");
    setStartDate("");
    setEndDate("");
    setReason("");
    setAttachment(null);

    setAttachmentResetKey((value) => value + 1);

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
              onChange={(event) =>
                setEmployeeCode(normalizeEmployeeCode(event.target.value))
              }
              placeholder="EMP001"
              autoComplete="off"
              className="mt-2 w-full rounded-xl border border-neutral-300 px-4 py-3 outline-none focus:border-blue-500"
            />
            <p className="mt-1 text-xs text-neutral-500">
              Prefix EMP otomatis. Cukup ketik nomor karyawan, contoh 001.
            </p>

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
                    onChange={(event) => {
                      const nextType = event.target.value as LeaveType;

                      setType(nextType);

                      /*
                       * Jangan sampai file Cuti
                       * terbawa ke Izin/Sakit
                       * atau sebaliknya.
                       */
                      setAttachment(null);

                      setAttachmentResetKey((value) => value + 1);

                      setError("");
                    }}
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

                  {type !== "ANNUAL_LEAVE" && (
                    <div>
                      <label className="text-sm font-medium">
                        Lampiran Bukti
                      </label>

                      <p className="mt-1 text-xs text-neutral-500">
                        Opsional. Bisa foto bukti, surat dokter, atau PDF.
                        Maksimal 5 MB.
                      </p>

                      <input
                        key={attachmentResetKey}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
                        onChange={(event) => {
                          const file = event.target.files?.[0] ?? null;

                          setError("");

                          if (!file) {
                            setAttachment(null);

                            return;
                          }

                          if (file.size > 5 * 1024 * 1024) {
                            setAttachment(null);

                            setError("Ukuran lampiran maksimal 5 MB.");

                            setAttachmentResetKey((value) => value + 1);

                            return;
                          }

                          setAttachment(file);
                        }}
                        className="mt-2 block w-full rounded-xl border border-neutral-300 bg-white px-3 py-3 text-sm"
                      />

                      {attachment && (
                        <div className="mt-2 rounded-xl bg-green-50 p-3 text-sm text-green-700">
                          ✓ {attachment.name}
                        </div>
                      )}
                    </div>
                  )}

                  {type === "ANNUAL_LEAVE" && (
                    <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                      <p className="font-medium text-blue-900">
                        Form Pengajuan Cuti
                      </p>

                      <p className="mt-1 text-sm text-blue-800">
                        Isi tanggal dan alasan di atas, lalu download form Word
                        yang sudah diisi sebagian oleh sistem.
                      </p>

                      <button
                        type="button"
                        onClick={downloadAnnualLeaveForm}
                        disabled={
                          templateDownloading ||
                          !startDate ||
                          !endDate ||
                          reason.trim().length < 3
                        }
                        className="mt-4 w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        {templateDownloading
                          ? "Membuat Form..."
                          : "Download Form Cuti"}
                      </button>

                      <div className="mt-5 border-t border-blue-200 pt-4">
                        <label className="text-sm font-semibold text-blue-950">
                          Upload Form yang Sudah Dilengkapi
                        </label>

                        <p className="mt-1 text-xs leading-5 text-blue-800">
                          Setelah form Word dilengkapi, upload kembali file
                          .docx di sini. File ini akan diteruskan ke admin untuk
                          proses persetujuan.
                        </p>

                        <input
                          key={attachmentResetKey}
                          type="file"
                          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                          onChange={(event) => {
                            const file = event.target.files?.[0] ?? null;

                            setError("");

                            if (!file) {
                              setAttachment(null);

                              return;
                            }

                            const validExtension = file.name
                              .toLowerCase()
                              .endsWith(".docx");

                            if (!validExtension) {
                              setAttachment(null);

                              setError(
                                "Form Cuti harus berupa file Word .docx.",
                              );

                              setAttachmentResetKey((value) => value + 1);

                              return;
                            }

                            if (file.size > 5 * 1024 * 1024) {
                              setAttachment(null);

                              setError("Ukuran Form Cuti maksimal 5 MB.");

                              setAttachmentResetKey((value) => value + 1);

                              return;
                            }

                            setAttachment(file);
                          }}
                          className="mt-3 block w-full rounded-xl border border-blue-200 bg-white px-3 py-3 text-sm"
                        />

                        {attachment && (
                          <div className="mt-3 rounded-xl bg-green-100 p-3 text-sm font-medium text-green-800">
                            ✓ {attachment.name}
                          </div>
                        )}
                      </div>

                      <div className="mt-3 text-xs leading-5 text-blue-800">
                        Jabatan, Departemen, Alamat Selama Cuti, No. HP,
                        Pengganti Tugas, dan tanda tangan masih dilengkapi
                        manual di Word.
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-5 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
                Pengajuan tidak langsung disetujui. Status awal selalu menunggu
                persetujuan admin.
              </div>

              <button
                type="submit"
                disabled={
                  submitting || (type === "ANNUAL_LEAVE" && !attachment)
                }
                className="mt-5 w-full rounded-xl bg-blue-600 py-3 font-semibold text-white disabled:opacity-50"
              >
                {submitting
                  ? "Mengirim..."
                  : type === "ANNUAL_LEAVE" && !attachment
                    ? "Upload Form Cuti Terlebih Dahulu"
                    : "Kirim Pengajuan"}
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

function LeavePageFallback() {
  return (
    <main className="min-h-screen bg-neutral-100 px-4 py-8">
      <div className="mx-auto max-w-md">
        <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
          <p className="text-sm text-neutral-500">
            Memuat halaman pengajuan...
          </p>
        </div>
      </div>
    </main>
  );
}

export default function PublicLeavePage() {
  return (
    <Suspense fallback={<LeavePageFallback />}>
      <PublicLeaveContent />
    </Suspense>
  );
}
