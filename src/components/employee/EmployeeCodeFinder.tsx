"use client";

import {
  FormEvent,
  useState,
} from "react";

import {
  LoadingLabel,
} from "@/components/ui/Loading";

import {
  useToastFeedback,
} from "@/components/ui/ToastProvider";

export type EmployeeResult = {
  employeeCode: string;

  name: string;

  employmentType:
    | "EMPLOYEE"
    | "INTERN";
};


export default function EmployeeCodeFinder({
  onSelect,
}: {
  onSelect: (
    employee:
      EmployeeResult,
  ) => void;
}) {
  const [open, setOpen] =
    useState(false);

  const [query, setQuery] =
    useState("");

  const [
    results,
    setResults,
  ] = useState<
    EmployeeResult[]
  >([]);

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    searched,
    setSearched,
  ] = useState(false);

  const {
    setError,
  } = useToastFeedback();

  async function search(
    event: FormEvent,
  ) {
    event.preventDefault();

    const cleanQuery =
      query.trim();

    if (
      cleanQuery.length < 3
    ) {
      setError(
        "Masukkan minimal 3 karakter nama.",
      );

      return;
    }

    if (loading) {
      return;
    }

    setLoading(true);
    setSearched(false);

    try {
      const response =
        await fetch(
          `/api/employees/search?q=${encodeURIComponent(
            cleanQuery,
          )}`,
        );

      const data =
        await response.json();

      if (!response.ok) {
        setError(
          data.error ??
            "Pencarian gagal.",
        );

        return;
      }

      setResults(
        data.employees ?? [],
      );

      setSearched(true);
    } catch {
      setError(
        "Terjadi masalah jaringan.",
      );
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
        onClick={() =>
          setOpen(true)
        }
        className="mt-3 w-full rounded-xl border border-blue-200 bg-blue-50 py-3 text-sm font-semibold text-blue-700"
      >
        🔍 Tidak tahu kode? Cari nama saya
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] flex items-end bg-black/40 sm:items-center sm:justify-center sm:p-5">
          <div className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-md sm:rounded-3xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold">
                  Cari Kode Anda
                </h2>

                <p className="mt-1 text-sm text-neutral-500">
                  Ketik minimal 3 karakter nama.
                </p>
              </div>

              <button
                type="button"
                onClick={close}
                className="rounded-lg px-3 py-1 text-xl text-neutral-500"
                aria-label="Tutup"
              >
                ×
              </button>
            </div>

            <form
              onSubmit={search}
              className="mt-5"
            >
              <input
                value={query}
                onChange={(
                  event,
                ) =>
                  setQuery(
                    event.target
                      .value,
                  )
                }
                autoFocus
                placeholder="Contoh: Budi"
                className="w-full rounded-xl border border-neutral-300 px-4 py-3 outline-none focus:border-blue-500"
              />

              <button
                type="submit"
                disabled={loading}
                className="mt-3 w-full rounded-xl bg-blue-600 py-3 font-semibold text-white disabled:opacity-50"
              >
                <LoadingLabel
                  loading={
                    loading
                  }
                  loadingText="Mencari..."
                >
                  Cari
                </LoadingLabel>
              </button>
            </form>

            <div className="mt-4 divide-y divide-neutral-100">
              {results.map(
                (employee) => (
                  <button
                    key={
                      employee.employeeCode
                    }
                    type="button"
                    onClick={() => {
                      onSelect(
                        employee,
                      );

                      close();
                    }}
                    className="flex w-full items-center justify-between gap-4 py-4 text-left"
                  >
                    <div>
                      <p className="font-semibold">
                        {
                          employee.name
                        }
                      </p>

                      <div className="mt-1 flex items-center gap-2">
                        <span className="text-sm text-neutral-500">
                          {
                            employee.employeeCode
                          }
                        </span>

                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            employee.employmentType ===
                            "INTERN"
                              ? "bg-amber-50 text-amber-700"
                              : "bg-blue-50 text-blue-700"
                          }`}
                        >
                          {employee.employmentType ===
                          "INTERN"
                            ? "Magang"
                            : "Karyawan"}
                        </span>
                      </div>
                    </div>

                    <span className="text-xl text-neutral-400">
                      ›
                    </span>
                  </button>
                ),
              )}

              {searched &&
                results.length ===
                  0 && (
                  <p className="py-8 text-center text-sm text-neutral-500">
                    Nama tidak ditemukan.
                  </p>
                )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
