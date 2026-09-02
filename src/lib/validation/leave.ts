import { z } from "zod";

export const createLeaveRequestSchema = z
  .object({
    employeeId: z
      .string()
      .trim()
      .min(1, "Karyawan wajib dipilih."),

    type: z.enum([
      "PERMISSION",
      "SICK",
      "ANNUAL_LEAVE",
    ]),

    startDate: z
      .string()
      .regex(
        /^\d{4}-\d{2}-\d{2}$/,
        "Tanggal mulai tidak valid."
      ),

    endDate: z
      .string()
      .regex(
        /^\d{4}-\d{2}-\d{2}$/,
        "Tanggal selesai tidak valid."
      ),

    reason: z
      .string()
      .trim()
      .min(3, "Alasan wajib diisi.")
      .max(1000),
  })
  .superRefine((data, ctx) => {
    const start = new Date(
      `${data.startDate}T00:00:00.000Z`
    );

    const end = new Date(
      `${data.endDate}T00:00:00.000Z`
    );

    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime())
    ) {
      return;
    }

    if (start > end) {
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message:
          "Tanggal selesai tidak boleh sebelum tanggal mulai.",
      });
    }
  });