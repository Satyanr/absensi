import { z } from "zod";

const optionalEmail = z.preprocess(
  (value) => (value === null || value === "" ? undefined : value),
  z.string().trim().email("Format email tidak valid.").max(120).optional(),
);

const optionalPhone = z.preprocess(
  (value) => (value === null || value === "" ? undefined : value),
  z.string().trim().max(30).optional(),
);

const optionalJoinDate = z.preprocess(
  (value) => (value === null || value === "" ? undefined : value),
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal masuk tidak valid.")
    .optional(),
);

export const createEmployeeSchema = z.object({
  employmentType: z.enum(["EMPLOYEE", "INTERN"]),

  codeNumber: z
    .string()
    .trim()
    .min(1, "Nomor kode wajib diisi.")
    .max(10)
    .regex(/^\d+$/, "Nomor kode hanya boleh berisi angka."),

  name: z.string().trim().min(2, "Nama wajib diisi.").max(120),

  email: optionalEmail,

  phone: optionalPhone,

  joinDate: optionalJoinDate,

  leaveEligible: z.boolean().optional(),
});

const nullableEmail = z.preprocess((value) => {
  if (value === "" || value === null) {
    return null;
  }

  return value;
}, z.string().trim().email("Format email tidak valid.").max(120).nullable());

const nullablePhone = z.preprocess((value) => {
  if (value === "" || value === null) {
    return null;
  }

  return value;
}, z.string().trim().max(30).nullable());

const nullableJoinDate = z.preprocess(
  (value) => {
    if (value === "" || value === null) {
      return null;
    }

    return value;
  },
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal masuk tidak valid.")
    .nullable(),
);

export const updateEmployeeSchema = z
  .object({
    employeeCode: z
      .string()
      .trim()
      .min(1, "Kode karyawan wajib diisi.")
      .max(50)
      .regex(
        /^[A-Za-z0-9_-]+$/,
        "Kode hanya boleh berisi huruf, angka, - atau _.",
      )
      .transform((value) => value.toUpperCase())
      .optional(),

    employmentType: z.enum(["EMPLOYEE", "INTERN"]).optional(),

    name: z.string().trim().min(2, "Nama wajib diisi.").max(120).optional(),

    email: nullableEmail.optional(),

    phone: nullablePhone.optional(),

    joinDate: nullableJoinDate.optional(),

    leaveEligible: z.boolean().optional(),

    active: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Tidak ada perubahan yang dikirim.",
  });
