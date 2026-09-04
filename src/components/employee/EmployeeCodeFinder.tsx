"use client";

import { useState } from "react";

import { LoadingLabel } from "@/components/ui/Loading";

import { useToastFeedback } from "@/components/ui/ToastProvider";

export type EmployeeResult = {
  employeeCode: string;

  name: string;

  employmentType: "EMPLOYEE" | "INTERN";
};

export default function EmployeeCodeFinder({
  onSelect,
}: {
  onSelect: (employee: EmployeeResult) => void;
}) {
  const [open, setOpen] = useState(false);

  const [query, setQuery] = useState("");

  const [results, setResults] = useState<EmployeeResult[]>([]);

  const [loading, setLoading] = useState(false);

  const [searched, setSearched] = useState(false);

  const { setError } = useToastFeedback();

  async function search() {
    const cleanQuery = query.trim();

    if (cleanQuery.length < 3) {
      setError("Masukkan minimal 3 karakter nama.");

      return;
    }

    if (loading) {
      return;
    }

    setLoading(true);
    setSearched(false);
    setResults([]);
    setError("");

    try {
      const response = await fetch(
        `/api/employees/search?q=${encodeURIComponent(cleanQuery)}`,
        {
          cache: "no-store",
        },
      );

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Pencarian gagal.");

        return;
      }

      setResults(Array.isArray(data.employees) ? data.employees : []);

      setSearched(true);
    } catch {
      setError("Terjadi masalah jaringan saat mencari personel.");
    } finally {
      setLoading(false);
    }
  }

  function close() {
    setOpen(false);
    setQuery("");
    setResults([]);
    setSearched(false);
  }

  return (
    <>
      <button
        type="button"
        disabled={loading}
        onClick={() => setOpen(true)}
        className="mt-3 w-full rounded-xl border border-blue-200 bg-blue-50 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
      >
        🔍 Tidak tahu kode? Cari nama saya
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[110] flex items-end bg-black/40 sm:items-center sm:justify-center sm:p-5"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              close();
            }
          }}
        >
          <div className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-md sm:rounded-3xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold">Cari Kode Anda</h2>

                <p className="mt-1 text-sm text-neutral-500">
                  Cari berdasarkan nama atau kode personel.
                </p>
              </div>

              <button
                type="button"
                onClick={close}
                className="rounded-lg px-3 py-1 text-xl text-neutral-500 hover:bg-neutral-100"
                aria-label="Tutup"
              >
                ×
              </button>
            </div>

            {/*
             * JANGAN pakai <form> di sini.
             * Finder berada di dalam form
             * halaman Absensi/Cuti.
             */}
            <div className="mt-5">
              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);

                  setSearched(false);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    event.stopPropagation();

                    void search();
                  }
                }}
                autoFocus
                autoComplete="off"
                placeholder="Contoh: Budi atau EMP001"
                className="w-full rounded-xl border border-neutral-300 px-4 py-3 outline-none focus:border-blue-500"
              />

              <button
                type="button"
                onClick={() => void search()}
                disabled={loading}
                className="mt-3 w-full rounded-xl bg-blue-600 py-3 font-semibold text-white disabled:opacity-50"
              >
                <LoadingLabel loading={loading} loadingText="Mencari...">
                  Cari Personel
                </LoadingLabel>
              </button>
            </div>

            <div className="mt-4 divide-y divide-neutral-100">
              {results.map((employee) => (
                <button
                  key={employee.employeeCode}
                  type="button"
                  onClick={() => {
                    onSelect(employee);

                    close();
                  }}
                  className="flex w-full items-center justify-between gap-4 py-4 text-left hover:bg-neutral-50"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{employee.name}</p>

                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-neutral-500">
                        {employee.employeeCode}
                      </span>

                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          employee.employmentType === "INTERN"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-blue-50 text-blue-700"
                        }`}
                      >
                        {employee.employmentType === "INTERN"
                          ? "Magang"
                          : "Karyawan"}
                      </span>
                    </div>
                  </div>

                  <span className="shrink-0 text-xl text-neutral-400">›</span>
                </button>
              ))}

              {searched && results.length === 0 && (
                <div className="py-8 text-center">
                  <p className="text-sm font-medium text-neutral-600">
                    Personel tidak ditemukan.
                  </p>

                  <p className="mt-1 text-xs text-neutral-400">
                    Coba gunakan sebagian nama atau kode personel.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
