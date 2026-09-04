"use client";

import {
  FormEvent,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

import {
  useToastFeedback,
} from "@/components/ui/ToastProvider";

type Employee = {
  id: string;
  employeeCode: string;
  name: string;
  email: string | null;
  phone: string | null;
  joinDate: string | null;
  leaveEligible: boolean;
};

export default function EmployeeEditForm({
  employee,
}: {
  employee: Employee;
}) {
  const router =
    useRouter();

  const [
    employeeCode,
    setEmployeeCode,
  ] =
    useState(
      employee.employeeCode
    );

  const [name, setName] =
    useState(employee.name);

  const [email, setEmail] =
    useState(
      employee.email ?? ""
    );

  const [phone, setPhone] =
    useState(
      employee.phone ?? ""
    );

  const [
    joinDate,
    setJoinDate,
  ] =
    useState(
      employee.joinDate ?? ""
    );

  const [
    leaveEligible,
    setLeaveEligible,
  ] =
    useState(
      employee.leaveEligible
    );

  const [
    loading,
    setLoading,
  ] = useState(false);

const {
  setError,
  setSuccess,
} =
  useToastFeedback();

  async function submit(
    event: FormEvent
  ) {
    event.preventDefault();

    if (loading) {
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const response =
        await fetch(
          `/api/admin/employees/${employee.id}`,
          {
            method: "PATCH",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              employeeCode,
              name,

              email:
                email || null,

              phone:
                phone || null,

              joinDate:
                joinDate || null,

              leaveEligible,
            }),
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        setError(
          data.error ??
            "Gagal menyimpan perubahan."
        );

        return;
      }

      setSuccess(
        "Data karyawan berhasil diperbarui."
      );

      router.refresh();
    } catch {
      setError(
        "Terjadi masalah jaringan."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl bg-white p-5 shadow-sm"
    >
      <h2 className="text-lg font-semibold">
        Edit Karyawan
      </h2>

      <div className="mt-5 space-y-4">
        <Field
          label="Kode Karyawan"
          value={employeeCode}
          onChange={
            setEmployeeCode
          }
        />

        <Field
          label="Nama"
          value={name}
          onChange={setName}
        />

        <Field
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
        />

        <Field
          label="Telepon"
          value={phone}
          onChange={setPhone}
        />

        <div>
          <label className="text-sm font-medium">
            Tanggal Masuk
          </label>

          <input
            type="date"
            value={joinDate}
            onChange={(event) =>
              setJoinDate(
                event.target.value
              )
            }
            className="mt-2 w-full rounded-xl border border-neutral-300 px-4 py-3"
          />
        </div>

        <label className="flex items-center gap-3 rounded-xl bg-neutral-50 p-4">
          <input
            type="checkbox"
            checked={
              leaveEligible
            }
            onChange={(event) =>
              setLeaveEligible(
                event.target
                  .checked
              )
            }
          />

          <span className="text-sm font-medium">
            Berhak Cuti
          </span>
        </label>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="mt-5 w-full rounded-xl bg-blue-600 py-3 font-semibold text-white disabled:opacity-50"
      >
        {loading
          ? "Menyimpan..."
          : "Simpan Perubahan"}
      </button>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (
    value: string
  ) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="text-sm font-medium">
        {label}
      </label>

      <input
        type={type}
        value={value}
        onChange={(event) =>
          onChange(
            event.target.value
          )
        }
        className="mt-2 w-full rounded-xl border border-neutral-300 px-4 py-3"
      />
    </div>
  );
}