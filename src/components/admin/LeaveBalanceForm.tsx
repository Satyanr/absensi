"use client";

import {
  FormEvent,
  useEffect,
  useState,
} from "react";

type Employee = {
  id: string;
  employeeCode: string;
  name: string;
  leaveEligible: boolean;
};

export default function LeaveBalanceForm({
  employees,
}: {
  employees: Employee[];
}) {
  const eligibleEmployees =
    employees.filter(
      (employee) =>
        employee.leaveEligible
    );

  const [employeeId, setEmployeeId] =
    useState("");

  const [year, setYear] =
    useState(
      new Date().getFullYear()
    );

  const [
    entitlement,
    setEntitlement,
  ] = useState(12);

  const [
    carriedOver,
    setCarriedOver,
  ] = useState(0);

  const [
    adjusted,
    setAdjusted,
  ] = useState(0);

  const [used, setUsed] =
    useState(0);

  const [loading, setLoading] =
    useState(false);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState("");

  const [success, setSuccess] =
    useState("");

  const remaining =
    entitlement +
    carriedOver +
    adjusted -
    used;

  useEffect(() => {
    if (!employeeId) {
      setUsed(0);
      setEntitlement(12);
      setCarriedOver(0);
      setAdjusted(0);

      return;
    }

    let cancelled = false;

    async function loadBalance() {
      setLoading(true);
      setError("");
      setSuccess("");

      try {
        const response =
          await fetch(
            `/api/admin/leave-balances?employeeId=${encodeURIComponent(
              employeeId
            )}&year=${year}`
          );

        const data =
          await response.json();

        if (cancelled) {
          return;
        }

        if (!response.ok) {
          setError(
            data.error ??
              "Gagal mengambil saldo cuti."
          );

          return;
        }

        /*
         * Kalau record belum ada,
         * default hak cuti 12 hari.
         */
        setEntitlement(
          data.exists
            ? data.balance
                .entitlement
            : 12
        );

        setCarriedOver(
          data.balance
            .carriedOver
        );

        setAdjusted(
          data.balance.adjusted
        );

        setUsed(
          data.balance.used
        );
      } catch {
        if (!cancelled) {
          setError(
            "Terjadi masalah jaringan."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadBalance();

    return () => {
      cancelled = true;
    };
  }, [
    employeeId,
    year,
  ]);

  async function submit(
    event: FormEvent
  ) {
    event.preventDefault();

    if (!employeeId) {
      setError(
        "Pilih karyawan terlebih dahulu."
      );

      return;
    }

    if (saving) {
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const response =
        await fetch(
          "/api/admin/leave-balances",
          {
            method: "PUT",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              employeeId,
              year,
              entitlement,
              carriedOver,
              adjusted,
            }),
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        setError(
          data.error ??
            "Gagal menyimpan saldo cuti."
        );

        return;
      }

      setUsed(
        data.balance.used
      );

      setSuccess(
        "Saldo cuti berhasil disimpan."
      );
    } catch {
      setError(
        "Terjadi masalah jaringan."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl bg-white p-5 shadow-sm"
    >
      <h2 className="text-lg font-semibold">
        Saldo Cuti
      </h2>

      <p className="mt-1 text-sm text-neutral-500">
        Atur hak dan saldo cuti tahunan karyawan.
      </p>

      {error && (
        <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="mt-4 rounded-xl bg-green-50 p-3 text-sm text-green-700">
          {success}
        </div>
      )}

      <div className="mt-5 space-y-4">
        <div>
          <label className="text-sm font-medium">
            Karyawan
          </label>

          <select
            value={employeeId}
            onChange={(event) =>
              setEmployeeId(
                event.target.value
              )
            }
            required
            className="mt-2 w-full rounded-xl border border-neutral-300 bg-white px-4 py-3"
          >
            <option value="">
              Pilih Karyawan
            </option>

            {eligibleEmployees.map(
              (employee) => (
                <option
                  key={employee.id}
                  value={employee.id}
                >
                  {
                    employee.employeeCode
                  }{" "}
                  - {employee.name}
                </option>
              )
            )}
          </select>
        </div>

        <div>
          <label className="text-sm font-medium">
            Tahun
          </label>

          <input
            type="number"
            min={2000}
            max={2100}
            value={year}
            onChange={(event) =>
              setYear(
                Number(
                  event.target.value
                )
              )
            }
            className="mt-2 w-full rounded-xl border border-neutral-300 px-4 py-3"
          />
        </div>

        {employeeId && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">
                  Hak Cuti
                </label>

                <input
                  type="number"
                  min={0}
                  value={
                    entitlement
                  }
                  onChange={(
                    event
                  ) =>
                    setEntitlement(
                      Number(
                        event.target
                          .value
                      )
                    )
                  }
                  disabled={loading}
                  className="mt-2 w-full rounded-xl border border-neutral-300 px-4 py-3 disabled:bg-neutral-100"
                />
              </div>

              <div>
                <label className="text-sm font-medium">
                  Carry Over
                </label>

                <input
                  type="number"
                  min={0}
                  value={
                    carriedOver
                  }
                  onChange={(
                    event
                  ) =>
                    setCarriedOver(
                      Number(
                        event.target
                          .value
                      )
                    )
                  }
                  disabled={loading}
                  className="mt-2 w-full rounded-xl border border-neutral-300 px-4 py-3 disabled:bg-neutral-100"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">
                Penyesuaian
              </label>

              <input
                type="number"
                value={adjusted}
                onChange={(event) =>
                  setAdjusted(
                    Number(
                      event.target.value
                    )
                  )
                }
                disabled={loading}
                className="mt-2 w-full rounded-xl border border-neutral-300 px-4 py-3 disabled:bg-neutral-100"
              />

              <p className="mt-1 text-xs text-neutral-500">
                Bisa positif atau negatif.
                Contoh: 2 atau -1.
              </p>
            </div>

            <div className="rounded-xl bg-neutral-50 p-4">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>
                    Hak Cuti
                  </span>

                  <span className="font-medium">
                    {entitlement}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span>
                    Carry Over
                  </span>

                  <span className="font-medium">
                    {carriedOver}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span>
                    Penyesuaian
                  </span>

                  <span className="font-medium">
                    {adjusted}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span>
                    Terpakai
                  </span>

                  <span className="font-medium">
                    {used}
                  </span>
                </div>

                <div className="border-t border-neutral-200 pt-2">
                  <div className="flex justify-between">
                    <span className="font-semibold">
                      Sisa
                    </span>

                    <span
                      className={`text-lg font-bold ${
                        remaining < 0
                          ? "text-red-600"
                          : "text-green-700"
                      }`}
                    >
                      {remaining} hari
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <button
        type="submit"
        disabled={
          saving ||
          loading ||
          !employeeId
        }
        className="mt-5 w-full rounded-xl bg-blue-600 py-3 font-semibold text-white disabled:opacity-50"
      >
        {saving
          ? "Menyimpan..."
          : "Simpan Saldo Cuti"}
      </button>
    </form>
  );
}