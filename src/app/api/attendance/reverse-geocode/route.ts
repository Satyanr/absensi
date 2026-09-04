import { NextResponse } from "next/server";

import { z } from "zod";

import { reverseGeocodeCoordinates } from "@/lib/attendance/reverse-geocode";

import { enforceRateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";

const schema = z.object({
  latitude: z.number().min(-90).max(90),

  longitude: z.number().min(-180).max(180),
});

export async function POST(request: Request) {
  const limited = enforceRateLimit(request, {
    scope: "reverse-geocode",

    limit: 120,

    windowMs: 60 * 1000,

    message: "Terlalu banyak permintaan lokasi. Silakan coba kembali.",
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

  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Koordinat lokasi tidak valid.",
      },
      {
        status: 400,
      },
    );
  }

  const result = await reverseGeocodeCoordinates(
    parsed.data.latitude,
    parsed.data.longitude,
  );

  return NextResponse.json(
    {
      ok: true,

      address: result.address,

      details: result.details,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
