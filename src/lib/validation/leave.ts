import { z } from "zod";

function dateOnlySchema(message: string) {
  return z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, message)
    .refine(
      (value) => {
        const [year, month, day] = value.split("-").map(Number);

        const date = new Date(Date.UTC(year, month - 1, day));

        return (
          date.getUTCFullYear() === year &&
          date.getUTCMonth() === month - 1 &&
          date.getUTCDate() === day
        );
      },
      {
        message,
      },
    );
}

const leaveRequestFields = {
  type: z.enum(["PERMISSION", "SICK", "ANNUAL_LEAVE"]),

  startDate:
  dateOnlySchema(
    "Tanggal mulai tidak valid.",
  ),

endDate:
  dateOnlySchema(
    "Tanggal selesai tidak valid.",
  ),

  reason: z.string().trim().min(3, "Alasan wajib diisi.").max(1000),
};

function validateDateRange(
  data: {
    startDate: string;
    endDate: string;
  },
  ctx: z.RefinementCtx,
) {
  const start = new Date(`${data.startDate}T00:00:00.000Z`);

  const end = new Date(`${data.endDate}T00:00:00.000Z`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return;
  }

  if (start > end) {
    ctx.addIssue({
      code: "custom",
      path: ["endDate"],
      message: "Tanggal selesai tidak boleh sebelum tanggal mulai.",
    });
  }
}

/*
 * Digunakan admin.
 */
export const createLeaveRequestSchema = z
  .object({
    employeeId: z.string().trim().min(1, "Karyawan wajib dipilih."),

    ...leaveRequestFields,
  })
  .superRefine(validateDateRange);

/*
 * Digunakan halaman publik.
 *
 * Browser hanya mengirim
 * employeeCode, bukan employeeId.
 */
export const createPublicLeaveRequestSchema = z
  .object({
    employeeCode: z
      .string()
      .trim()
      .min(1, "Kode karyawan wajib diisi.")
      .max(100),

    ...leaveRequestFields,
  })
  .superRefine(validateDateRange);
