import crypto from "node:crypto";
import path from "node:path";

import { mkdir, unlink, writeFile } from "node:fs/promises";

import { AttendanceEventType } from "@/generated/prisma/client";

import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

import { evaluateCheckOut, getAttendanceDate } from "@/lib/attendance/time";

import { checkOutSchema } from "@/lib/validation/attendance";

import { detectImageFile } from "@/lib/security/file-signature";

import { validateGpsFreshness } from "@/lib/attendance/location-security";

import { reverseGeocodeCoordinates } from "@/lib/attendance/reverse-geocode";

import { enforceRateLimit } from "@/lib/security/rate-limit";

class DuplicateCheckOutError extends Error {}

class MissingCheckInError extends Error {}

export async function POST(request: NextRequest) {
  /*
   * Ini waktu resmi.
   *
   * Browser tidak menentukan waktu checkout.
   */
  const serverReceivedAt = new Date();

  const ipLimited = enforceRateLimit(request, {
    scope: "attendance-check-out-ip",

    limit: 300,

    windowMs: 5 * 60 * 1000,
  });

  if (ipLimited) {
    return ipLimited;
  }

  const form = await request.formData();

  const parsed = checkOutSchema.safeParse({
    employeeCode: form.get("employeeCode"),

    latitude: form.get("latitude"),
    longitude: form.get("longitude"),
    accuracy: form.get("accuracy"),

    locationCapturedAt: form.get("locationCapturedAt"),

    clientCapturedAt: form.get("clientCapturedAt"),

    source: form.get("source"),
  });

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Data absen pulang tidak valid.",

        details: parsed.error.flatten(),
      },

      {
        status: 400,
      },
    );
  }

  const employeeLimited = enforceRateLimit(request, {
    scope: "attendance-check-out-employee",

    limit: 10,

    windowMs: 5 * 60 * 1000,

    identity: parsed.data.employeeCode,

    message:
      "Terlalu banyak percobaan absen pulang untuk kode karyawan ini. Silakan coba kembali beberapa saat lagi.",
  });

  if (employeeLimited) {
    return employeeLimited;
  }

  const gpsFreshness = validateGpsFreshness(
    parsed.data.locationCapturedAt,

    serverReceivedAt,
  );

  if (!gpsFreshness.ok) {
    return NextResponse.json(
      {
        error: gpsFreshness.message,
      },
      {
        status: gpsFreshness.reason === "INVALID" ? 400 : 409,
      },
    );
  }

  const photo = form.get("photo");

  if (!(photo instanceof File)) {
    return NextResponse.json(
      {
        error: "Selfie absen pulang wajib diambil.",
      },

      {
        status: 400,
      },
    );
  }

  const maxBytes = Number(
    process.env.MAX_ATTENDANCE_IMAGE_BYTES ?? 5 * 1024 * 1024,
  );

  if (photo.size > maxBytes) {
    return NextResponse.json(
      {
        error: "Ukuran selfie terlalu besar.",
      },

      {
        status: 413,
      },
    );
  }

  /*
   * Cari employee.
   */
  const employee = await prisma.employee.findFirst({
    where: {
      active: true,

      employeeCode: {
        equals: parsed.data.employeeCode,

        mode: "insensitive",
      },
    },

    select: {
      id: true,
      employeeCode: true,
      name: true,
    },
  });

  if (!employee) {
    return NextResponse.json(
      {
        error: "Karyawan tidak ditemukan.",
      },

      {
        status: 404,
      },
    );
  }

  const attendanceDate = getAttendanceDate(serverReceivedAt, "Asia/Jakarta");

  /*
   * Cari policy yang berlaku hari ini.
   */
  const policy = await prisma.attendancePolicy.findFirst({
    where: {
      active: true,

      effectiveFrom: {
        lte: attendanceDate,
      },

      OR: [
        {
          effectiveUntil: null,
        },

        {
          effectiveUntil: {
            gte: attendanceDate,
          },
        },
      ],
    },

    orderBy: {
      effectiveFrom: "desc",
    },
  });

  if (!policy) {
    return NextResponse.json(
      {
        error: "Attendance policy aktif tidak ditemukan.",
      },

      {
        status: 500,
      },
    );
  }

  const geocode = await reverseGeocodeCoordinates(
    parsed.data.latitude,
    parsed.data.longitude,
  );

  const serverAddress = geocode.address;

  /*
   * Persiapkan foto checkout.
   */
  const bytes = Buffer.from(await photo.arrayBuffer());

  const detectedPhoto = detectImageFile(bytes);

  if (!detectedPhoto) {
    return NextResponse.json(
      {
        error: "Isi file selfie tidak valid atau format gambar tidak didukung.",
      },
      {
        status: 400,
      },
    );
  }

  const checksum = crypto.createHash("sha256").update(bytes).digest("hex");

  const extension = detectedPhoto.extension;

  const relativeDirectory = [
    String(attendanceDate.getUTCFullYear()),

    String(attendanceDate.getUTCMonth() + 1).padStart(2, "0"),

    String(attendanceDate.getUTCDate()).padStart(2, "0"),
  ].join("/");

  const filename = `${crypto.randomUUID()}${extension}`;

  const relativePath = `${relativeDirectory}/${filename}`;

  const configuredRoot =
    process.env.ATTENDANCE_STORAGE_PATH ?? "./storage/attendance";

  const storageRoot = path.isAbsolute(configuredRoot)
    ? configuredRoot
    : path.resolve(
        /*turbopackIgnore: true*/
        process.cwd(),
        configuredRoot,
      );

  const directoryPath = path.join(storageRoot, relativeDirectory);

  const absolutePath = path.join(storageRoot, relativePath);

  await mkdir(directoryPath, {
    recursive: true,
  });

  await writeFile(absolutePath, bytes);

  try {
    const result = await prisma.$transaction(async (tx) => {
      /*
       * Ambil AttendanceDay hari ini.
       */
      const attendanceDay = await tx.attendanceDay.findUnique({
        where: {
          employeeId_attendanceDate: {
            employeeId: employee.id,

            attendanceDate,
          },
        },
      });

      if (!attendanceDay || !attendanceDay.checkInAt) {
        throw new MissingCheckInError();
      }

      if (attendanceDay.attendanceMode === "PROJECT") {
        throw new Error("PROJECT_DOES_NOT_CHECK_OUT");
      }

      if (attendanceDay.checkOutAt) {
        throw new DuplicateCheckOutError();
      }

      /*
       * Tentukan pulang awal / normal / lembur.
       */
      const evaluation = evaluateCheckOut(
        serverReceivedAt,
        attendanceDay.checkInAt,
        policy,
        policy.timezone,
      );

      /*
       * Atomic update.
       *
       * Hanya boleh update kalau checkOutAt
       * masih NULL.
       */
      const updated = await tx.attendanceDay.updateMany({
        where: {
          id: attendanceDay.id,

          checkInAt: {
            not: null,
          },

          checkOutAt: null,
        },

        data: {
          checkOutAt: serverReceivedAt,

          checkOutStatus: evaluation.status,

          earlyLeaveMinutes: evaluation.earlyLeaveMinutes,

          overtimeMinutes: evaluation.overtimeMinutes,
        },
      });

      if (updated.count !== 1) {
        throw new DuplicateCheckOutError();
      }

      /*
       * Metadata foto.
       */
      const attachment = await tx.attachment.create({
        data: {
          storageDisk: "local",

          storagePath: relativePath,

          originalFilename: photo.name || null,

          mimeType: detectedPhoto.mimeType,

          fileSize: BigInt(photo.size),

          checksum,
        },
      });

      /*
       * Raw event CHECK_OUT.
       */
      await tx.attendanceEvent.create({
        data: {
          attendanceDayId: attendanceDay.id,

          employeeId: employee.id,

          eventType: AttendanceEventType.CHECK_OUT,

          clientCapturedAt: new Date(parsed.data.clientCapturedAt),

          serverReceivedAt,

          latitude: parsed.data.latitude,

          longitude: parsed.data.longitude,

          locationAccuracy: parsed.data.accuracy,

          locationCapturedAt: gpsFreshness.capturedAt,

          address: serverAddress,

          photoId: attachment.id,

          source: parsed.data.source,

          deviceInfo: {
            userAgent: request.headers.get("user-agent"),

            forwardedFor: request.headers.get("x-forwarded-for"),

            locationIntegrity: {
              addressSource: serverAddress ? "SERVER_GEOAPIFY" : "UNAVAILABLE",

              gpsAgeSeconds: gpsFreshness.ageSeconds,
            },
          },
        },
      });

      return {
        attendanceDayId: attendanceDay.id,

        evaluation,
      };
    });

    return NextResponse.json({
      ok: true,

      message: "Absen pulang berhasil.",

      employee: {
        employeeCode: employee.employeeCode,

        name: employee.name,
      },

      attendance: {
        attendanceDayId: result.attendanceDayId,

        checkOutAt: serverReceivedAt.toISOString(),

        checkOutStatus: result.evaluation.status,

        earlyLeaveMinutes: result.evaluation.earlyLeaveMinutes,

        overtimeMinutes: result.evaluation.overtimeMinutes,
      },
    });
  } catch (error) {
    /*
     * Kalau transaksi DB gagal,
     * jangan tinggalkan orphan photo.
     */
    await unlink(absolutePath).catch(() => undefined);

    if (error instanceof MissingCheckInError) {
      return NextResponse.json(
        {
          error: "Karyawan belum melakukan absen masuk hari ini.",
        },

        {
          status: 409,
        },
      );
    }

    if (error instanceof DuplicateCheckOutError) {
      return NextResponse.json(
        {
          error: "Karyawan sudah melakukan absen pulang hari ini.",
        },

        {
          status: 409,
        },
      );
    }

    if (
      error instanceof Error &&
      error.message === "PROJECT_DOES_NOT_CHECK_OUT"
    ) {
      return NextResponse.json(
        {
          error: "Absensi In Project tidak memerlukan absen pulang.",
        },
        {
          status: 409,
        },
      );
    }

    console.error(error);

    return NextResponse.json(
      {
        error: "Gagal menyimpan absen pulang.",
      },

      {
        status: 500,
      },
    );
  }
}
