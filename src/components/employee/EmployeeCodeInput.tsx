"use client";

import EmployeeCodeFinder, {
  type EmployeeResult,
} from "@/components/employee/EmployeeCodeFinder";

type EmploymentType = "EMPLOYEE" | "INTERN";

function readCode(value: string) {
  const clean = value.toUpperCase().replace(/\s+/g, "");

  if (clean.startsWith("MAG")) {
    return {
      type: "INTERN" as const,

      number: clean.slice(3).replace(/\D/g, ""),
    };
  }

  return {
    type: "EMPLOYEE" as const,

    number: clean.replace(/^EMP/, "").replace(/\D/g, ""),
  };
}

export function normalizePersonnelCode(value: string) {
  const parsed = readCode(value);

  const prefix = parsed.type === "INTERN" ? "MAG" : "EMP";

  return `${prefix}${parsed.number}`;
}

export default function EmployeeCodeInput({
  value,
  onChange,
  onEmployeeSelect,
  disabled = false,
}: {
  value: string;

  onChange: (value: string) => void;

  onEmployeeSelect?: (employee: EmployeeResult) => void;

  disabled?: boolean;
}) {
  const parsed = readCode(value);

  const prefix = parsed.type === "INTERN" ? "MAG" : "EMP";

  function changeType(type: EmploymentType) {
    onChange(`${type === "INTERN" ? "MAG" : "EMP"}${parsed.number}`);
  }

  return (
    <div>
      <label className="text-sm font-medium">Jenis Personel</label>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => changeType("EMPLOYEE")}
          className={`rounded-xl border px-3 py-3 text-sm font-semibold ${
            parsed.type === "EMPLOYEE"
              ? "border-blue-600 bg-blue-50 text-blue-700"
              : "border-neutral-200 text-neutral-600"
          }`}
        >
          Karyawan
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={() => changeType("INTERN")}
          className={`rounded-xl border px-3 py-3 text-sm font-semibold ${
            parsed.type === "INTERN"
              ? "border-amber-500 bg-amber-50 text-amber-700"
              : "border-neutral-200 text-neutral-600"
          }`}
        >
          Magang
        </button>
      </div>

      <label className="mt-4 block text-sm font-medium">Kode</label>

      <div className="mt-2 flex overflow-hidden rounded-xl border border-neutral-300 focus-within:border-blue-500">
        <span className="flex min-w-[72px] items-center justify-center border-r border-neutral-300 bg-neutral-100 px-4 font-bold text-neutral-600">
          {prefix}
        </span>

        <input
          value={parsed.number}
          disabled={disabled}
          inputMode="numeric"
          onChange={(event) =>
            onChange(
              `${prefix}${event.target.value.replace(/\D/g, "").slice(0, 10)}`,
            )
          }
          placeholder="001"
          autoComplete="off"
          className="min-w-0 flex-1 px-4 py-3 outline-none disabled:bg-neutral-100"
        />
      </div>

      <EmployeeCodeFinder
        onSelect={(employee) => {
          onChange(employee.employeeCode);

          onEmployeeSelect?.(employee);
        }}
      />
    </div>
  );
}
