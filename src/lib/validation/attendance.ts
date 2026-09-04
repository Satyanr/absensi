import { z } from "zod";

const attendanceSourceSchema = z.enum(["WEB_CAMERA", "WEB_FILE_CAPTURE"]);

const attendanceModeSchema = z.preprocess(
  (value) => {
    /*
     * Frontend lama belum mengirim attendanceMode.
     * Sementara kita anggap OFFICE agar flow lama
     * tidak langsung rusak.
     */
    if (value === null || value === "") {
      return "OFFICE";
    }

    return value;
  },
  z.enum(["OFFICE", "PROJECT"]),
);

const optionalLatitude = z.preprocess(
  (value) => (value === null || value === "" ? undefined : value),
  z.coerce.number().min(-90).max(90).optional(),
);

const optionalLongitude = z.preprocess(
  (value) => (value === null || value === "" ? undefined : value),
  z.coerce.number().min(-180).max(180).optional(),
);

const optionalAccuracy = z.preprocess(
  (value) => (value === null || value === "" ? undefined : value),
  z.coerce.number().min(0).max(10000).optional(),
);

const optionalDateTime = z.preprocess(
  (value) => (value === null || value === "" ? undefined : value),
  z.string().datetime().optional(),
);

/*
 * CHECK-IN
 *
 * OFFICE:
 * - GPS wajib
 * - selfie wajib
 * - mengikuti policy jam kerja
 *
 * PROJECT:
 * - GPS optional
 * - selfie wajib
 * - waktu fleksibel
 */
export const checkInSchema = z
  .object({
    employeeCode: z.string().trim().min(1).max(50),

    attendanceMode: attendanceModeSchema,

    latitude: optionalLatitude,

    longitude: optionalLongitude,

    accuracy: optionalAccuracy,

    locationCapturedAt: optionalDateTime,

    clientCapturedAt: z.string().datetime(),

    source: attendanceSourceSchema,
  })
  .superRefine((data, ctx) => {
    const gpsProvided =
      data.latitude !== undefined ||
      data.longitude !== undefined ||
      data.accuracy !== undefined ||
      Boolean(data.locationCapturedAt);

    /*
     * OFFICE selalu wajib GPS.
     *
     * PROJECT boleh tanpa GPS.
     * Tetapi kalau salah satu
     * data GPS dikirim, semuanya
     * harus lengkap.
     */
    const gpsRequired = data.attendanceMode === "OFFICE" || gpsProvided;

    if (!gpsRequired) {
      return;
    }

    if (data.latitude === undefined) {
      ctx.addIssue({
        code: "custom",

        path: ["latitude"],

        message: "Latitude lokasi wajib.",
      });
    }

    if (data.longitude === undefined) {
      ctx.addIssue({
        code: "custom",

        path: ["longitude"],

        message: "Longitude lokasi wajib.",
      });
    }

    if (data.accuracy === undefined) {
      ctx.addIssue({
        code: "custom",

        path: ["accuracy"],

        message: "Akurasi lokasi wajib.",
      });
    }

    if (!data.locationCapturedAt) {
      ctx.addIssue({
        code: "custom",

        path: ["locationCapturedAt"],

        message: "Waktu pengambilan lokasi wajib.",
      });
    }
  });

/*
 * CHECK-OUT hanya untuk OFFICE.
 *
 * GPS tetap wajib.
 */
export const checkOutSchema = z.object({
  employeeCode: z.string().trim().min(1).max(50),

  latitude: z.coerce.number().min(-90).max(90),

  longitude: z.coerce.number().min(-180).max(180),

  accuracy: z.coerce.number().min(0).max(10000),

  locationCapturedAt: z.string().datetime(),

  clientCapturedAt: z.string().datetime(),

  source: attendanceSourceSchema,
});
