import crypto from "node:crypto";
import path from "node:path";

import { mkdir, unlink, writeFile } from "node:fs/promises";
import { detectImageFile } from "@/lib/security/file-signature";
import { validateGpsFreshness } from "@/lib/attendance/location-security";

import { reverseGeocodeCoordinates } from "@/lib/attendance/reverse-geocode";

import {
  AttendanceDayStatus,
  AttendanceEventType,
  AttendanceMode,
  CheckInStatus,
  Prisma,
} from "@/generated/prisma/client";

import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

import { evaluateCheckIn, getAttendanceDate } from "@/lib/attendance/time";

import { checkInSchema } from "@/lib/validation/attendance";

import { findNearestAttendanceLocation } from "@/lib/attendance/geofence";

class DuplicateCheckInError extends Error {}

function getExtension(mimeType: string) {
  switch (mimeType) {
    case "image/png":
      return ".png";

    case "image/webp":
      return ".webp";

    case "image/heic":
      return ".heic";

    case "image/heif":
      return ".heif";

    default:
      return ".jpg";
  }
}

function getMaxAccuracy() {
  const value = Number(process.env.MAX_OFFICE_GPS_ACCURACY_METERS ?? 500);

  if (!Number.isFinite(value) || value <= 0 || value > 10000) {
    return 500;
  }

  return value;
}

export async function POST(request: NextRequest) {
  /*
   * Ini waktu resmi absensi.
   * Jangan gunakan waktu browser sebagai otoritas.
   */
  const serverReceivedAt = new Date();

  const form = await request.formData();

  const parsed = checkInSchema.safeParse({
    employeeCode: form.get("employeeCode"),

    attendanceMode: form.get("attendanceMode"),

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
        error: "Data absensi tidak valid.",

        details: parsed.error.flatten(),
      },
      {
        status: 400,
      },
    );
  }

  /*
   * Selfie wajib baik OFFICE maupun PROJECT.
   */
  const photo = form.get("photo");

  if (!(photo instanceof File)) {
    return NextResponse.json(
      {
        error: "Selfie wajib diambil.",
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
   * Cari employee dari kode.
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

  const attendanceMode =
    parsed.data.attendanceMode === "PROJECT"
      ? AttendanceMode.PROJECT
      : AttendanceMode.OFFICE;

  const isProject = attendanceMode === AttendanceMode.PROJECT;

  let locationCapturedAt: Date | null = null;

  let gpsAgeSeconds: number | null = null;

  if (parsed.data.locationCapturedAt) {
    const freshness = validateGpsFreshness(
      parsed.data.locationCapturedAt,

      serverReceivedAt,
    );

    if (!freshness.ok) {
      return NextResponse.json(
        {
          error: freshness.message,
        },
        {
          status: freshness.reason === "INVALID" ? 400 : 409,
        },
      );
    }

    locationCapturedAt = freshness.capturedAt;

    gpsAgeSeconds = freshness.ageSeconds;
  }

  const MAX_ACCURACY = getMaxAccuracy();

  let geofence: {
    locationId: string;

    locationName: string;

    radiusMeters: number;

    distanceMeters: number;
  } | null = null;

  /*
   * Tentukan tanggal berdasarkan WIB.
   */
  const attendanceDate = getAttendanceDate(serverReceivedAt, "Asia/Jakarta");

  /*
   * PROJECT tidak memiliki ON_TIME/LATE.
   */
  let evaluation: {
    status: CheckInStatus | null;

    lateMinutes: number;
  } = {
    status: null,
    lateMinutes: 0,
  };

  /*
   * Attendance policy hanya berlaku
   * untuk absensi kantor.
   */
  if (!isProject) {
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

    evaluation = evaluateCheckIn(serverReceivedAt, policy, policy.timezone);
  }

  /*
   * =========================
   * OFFICE GEOFENCE
   * =========================
   *
   * Hanya CHECK-IN OFFICE.
   *
   * PROJECT tidak memakai
   * geofence.
   */
  if (!isProject) {
    const latitude = parsed.data.latitude;

    const longitude = parsed.data.longitude;

    const accuracy = parsed.data.accuracy;

    /*
     * Sebenarnya schema sudah
     * mewajibkan ini untuk OFFICE,
     * tapi tetap dibuat defensif.
     */
    if (
      latitude === undefined ||
      longitude === undefined ||
      accuracy === undefined
    ) {
      return NextResponse.json(
        {
          error: "GPS wajib untuk absensi kantor.",
        },
        {
          status: 400,
        },
      );
    }

    if (accuracy > MAX_ACCURACY) {
      return NextResponse.json(
        {
          error: "Akurasi GPS terlalu rendah. Silakan ambil ulang lokasi.",
        },
        {
          status: 409,
        },
      );
    }

    const officeLocations = await prisma.attendanceLocation.findMany({
      where: {
        active: true,
      },

      select: {
        id: true,

        name: true,

        latitude: true,

        longitude: true,

        radiusMeters: true,
      },
    });

    if (officeLocations.length === 0) {
      return NextResponse.json(
        {
          error: "Lokasi kantor aktif belum diatur.",
        },
        {
          status: 500,
        },
      );
    }

    const nearest = findNearestAttendanceLocation(
      latitude,
      longitude,
      officeLocations,
    );

    if (!nearest) {
      return NextResponse.json(
        {
          error: "Lokasi kantor tidak valid.",
        },
        {
          status: 500,
        },
      );
    }

    geofence = {
      locationId: nearest.id,

      locationName: nearest.name,

      radiusMeters: nearest.radiusMeters,

      distanceMeters: nearest.distanceMeters,
    };

    if (nearest.distanceMeters > nearest.radiusMeters) {
      return NextResponse.json(
        {
          error: `Anda berada di luar area kantor. Kantor terdekat: ${nearest.name}, jarak ${Math.round(
            nearest.distanceMeters,
          )} meter.`,

          nearestOffice: {
            name: nearest.name,

            distanceMeters: Math.round(nearest.distanceMeters),
          },
        },
        {
          status: 409,
        },
      );
    }
  }

  let serverAddress:
  string | null = null;

if (
  parsed.data.latitude !==
    undefined &&
  parsed.data.longitude !==
    undefined
) {
  const geocode =
    await reverseGeocodeCoordinates(
      parsed.data.latitude,
      parsed.data.longitude,
    );

  serverAddress =
    geocode.address;
}

  /*
   * Persiapkan selfie.
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

  /*
   * File ditulis terlebih dahulu.
   * Jika database gagal, file
   * akan dihapus kembali.
   */
  await writeFile(absolutePath, bytes);

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        /*
         * =========================
         * CEK LEAVE APPROVED
         * =========================
         *
         * Employee yang sudah memiliki
         * Izin/Sakit/Cuti APPROVED pada
         * hari ini tidak boleh check-in.
         */
        const approvedLeave = await tx.leaveRequest.findFirst({
          where: {
            employeeId: employee.id,

            status: "APPROVED",

            startDate: {
              lte: attendanceDate,
            },

            endDate: {
              gte: attendanceDate,
            },
          },

          select: {
            type: true,
          },
        });

        if (approvedLeave) {
          throw new Error(`APPROVED_LEAVE_CONFLICT:${approvedLeave.type}`);
        }
        /*
         * Satu employee hanya memiliki
         * satu AttendanceDay per tanggal.
         */
        const attendanceDay = await tx.attendanceDay.upsert({
          where: {
            employeeId_attendanceDate: {
              employeeId: employee.id,

              attendanceDate,
            },
          },

          update: {},

          create: {
            employeeId: employee.id,

            attendanceDate,

            attendanceMode,

            status: AttendanceDayStatus.PRESENT,
          },
        });

        /*
         * Jangan mengizinkan record
         * yang sudah ada berubah mode.
         *
         * Misalnya:
         * pagi sudah OFFICE,
         * lalu mencoba PROJECT.
         */
        if (attendanceDay.attendanceMode !== attendanceMode) {
          throw new Error("ATTENDANCE_MODE_CONFLICT");
        }

        /*
         * Atomic check-in.
         *
         * Hanya berhasil jika
         * checkInAt masih NULL.
         */
        const updated = await tx.attendanceDay.updateMany({
          where: {
            id: attendanceDay.id,

            checkInAt: null,
          },

          data: {
            checkInAt: serverReceivedAt,

            checkInStatus: evaluation.status,

            lateMinutes: evaluation.lateMinutes,

            attendanceMode,
          },
        });

        if (updated.count !== 1) {
          throw new DuplicateCheckInError();
        }

        /*
         * Metadata selfie.
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
         * Raw attendance event.
         */
        await tx.attendanceEvent.create({
          data: {
            attendanceDayId: attendanceDay.id,

            employeeId: employee.id,

            attendanceMode,

            eventType: AttendanceEventType.CHECK_IN,

            clientCapturedAt: new Date(parsed.data.clientCapturedAt),

            serverReceivedAt,

            latitude: parsed.data.latitude ?? null,

            longitude: parsed.data.longitude ?? null,

            locationAccuracy: parsed.data.accuracy ?? null,

            locationCapturedAt: parsed.data.locationCapturedAt
              ? new Date(parsed.data.locationCapturedAt)
              : null,

            address: parsed.data.address ?? null,

            outsideGeofence: isProject ? null : false,

            distanceMeters: geofence ? geofence.distanceMeters : null,

            photoId: attachment.id,

            source: parsed.data.source,

            deviceInfo: {
              userAgent: request.headers.get("user-agent"),

              forwardedFor: request.headers.get("x-forwarded-for"),

              geofence: geofence
                ? {
                    attendanceLocationId: geofence.locationId,

                    attendanceLocationName: geofence.locationName,

                    radiusMeters: geofence.radiusMeters,

                    distanceMeters: Math.round(geofence.distanceMeters),
                  }
                : null,
            },
          },
        });

        return {
          attendanceDayId: attendanceDay.id,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    return NextResponse.json({
      ok: true,

      message: isProject ? "In Project berhasil." : "Absen masuk berhasil.",

      employee: {
        employeeCode: employee.employeeCode,

        name: employee.name,
      },

      attendance: {
        attendanceDayId: result.attendanceDayId,

        attendanceMode,

        checkInAt: serverReceivedAt.toISOString(),

        checkInStatus: evaluation.status,

        lateMinutes: evaluation.lateMinutes,

        completed: isProject,
      },
    });
  } catch (error) {
    /*
     * Jangan tinggalkan orphan file.
     */
    await unlink(absolutePath).catch(() => undefined);

    if (error instanceof DuplicateCheckInError) {
      return NextResponse.json(
        {
          error: "Karyawan sudah melakukan absensi hari ini.",
        },
        {
          status: 409,
        },
      );
    }

    if (
      error instanceof Error &&
      error.message.startsWith("APPROVED_LEAVE_CONFLICT:")
    ) {
      const leaveType = error.message.split(":")[1];

      const label =
        leaveType === "SICK"
          ? "Sakit"
          : leaveType === "PERMISSION"
            ? "Izin"
            : "Cuti";

      return NextResponse.json(
        {
          error: `Absensi tidak dapat dilakukan karena Anda memiliki ${label} yang sudah disetujui untuk hari ini.`,
        },
        {
          status: 409,
        },
      );
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034"
    ) {
      return NextResponse.json(
        {
          error:
            "Data absensi berubah bersamaan dengan pengajuan izin/cuti. Silakan coba kembali.",
        },
        {
          status: 409,
        },
      );
    }

    if (
      error instanceof Error &&
      error.message === "ATTENDANCE_MODE_CONFLICT"
    ) {
      return NextResponse.json(
        {
          error:
            "Jenis absensi hari ini sudah ditentukan dan tidak dapat diubah.",
        },
        {
          status: 409,
        },
      );
    }

    console.error(error);

    return NextResponse.json(
      {
        error: "Gagal menyimpan absensi.",
      },
      {
        status: 500,
      },
    );
  }
}
