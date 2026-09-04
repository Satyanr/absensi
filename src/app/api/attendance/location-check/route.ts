import { NextResponse } from "next/server";

import { z } from "zod";

import { prisma } from "@/lib/prisma";

import { findNearestAttendanceLocation } from "@/lib/attendance/geofence";

import { enforceRateLimit } from "@/lib/security/rate-limit";

const locationSchema = z.object({
  latitude: z.number().min(-90).max(90),

  longitude: z.number().min(-180).max(180),

  accuracy: z.number().min(0).max(10000),
});

function getMaxAccuracy() {
  const value = Number(process.env.MAX_OFFICE_GPS_ACCURACY_METERS ?? 500);

  if (!Number.isFinite(value) || value <= 0 || value > 10000) {
    return 500;
  }

  return value;
}

const MAX_ACCURACY = getMaxAccuracy();

export async function POST(request: Request) {
  const limited = enforceRateLimit(request, {
    scope: "location-check",

    limit: 180,

    windowMs: 60 * 1000,

    message:
      "Terlalu banyak pemeriksaan lokasi. Silakan ambil GPS kembali beberapa saat lagi.",
  });

  if (limited) {
    return limited;
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: "Request lokasi tidak valid.",
      },
      {
        status: 400,
      },
    );
  }

  const parsed = locationSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Data GPS tidak valid.",
      },
      {
        status: 400,
      },
    );
  }

  const locations = await prisma.attendanceLocation.findMany({
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

  if (locations.length === 0) {
    return NextResponse.json(
      {
        error: "Lokasi kantor aktif belum diatur.",
      },
      {
        status: 503,
      },
    );
  }

  const nearest = findNearestAttendanceLocation(
    parsed.data.latitude,
    parsed.data.longitude,
    locations,
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

  const accuracyGood = parsed.data.accuracy <= MAX_ACCURACY;

  const withinRadius = nearest.distanceMeters <= nearest.radiusMeters;

  return NextResponse.json(
    {
      ok: true,

      allowed: accuracyGood && withinRadius,

      accuracyGood,

      nearestOffice: {
        name: nearest.name,

        distanceMeters: Math.round(nearest.distanceMeters),
      },
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
