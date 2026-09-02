import { z } from "zod";

export const employeeLookupSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Kode karyawan wajib diisi.")
    .max(50, "Kode karyawan terlalu panjang."),
});
