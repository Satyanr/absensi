import {
  NextResponse,
} from "next/server";

import { z } from "zod";

import {
  reverseGeocodeCoordinates,
} from "@/lib/attendance/reverse-geocode";

export const runtime =
  "nodejs";

const schema = z.object({
  latitude: z
    .number()
    .min(-90)
    .max(90),

  longitude: z
    .number()
    .min(-180)
    .max(180),
});

type GeoapifyResult = {
  formatted?: string;

  address_line1?: string;

  address_line2?: string;

  street?: string;

  housenumber?: string;

  suburb?: string;

  district?: string;

  city?: string;

  county?: string;

  state?: string;

  postcode?: string;
};

type GeoapifyResponse = {
  results?: GeoapifyResult[];
};

export async function POST(
  request: Request,
) {
  let body: unknown;

  try {
    body =
      await request.json();
  } catch {
    return NextResponse.json(
      {
        error:
          "Request lokasi tidak valid.",
      },
      {
        status: 400,
      },
    );
  }

  const parsed =
    schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          "Koordinat lokasi tidak valid.",
      },
      {
        status: 400,
      },
    );
  }

  const result =
  await reverseGeocodeCoordinates(
    parsed.data.latitude,
    parsed.data.longitude,
  );

  /*
   * Alamat hanya informasi tambahan.
   * Absensi/geofence jangan gagal
   * hanya karena API key belum ada.
   */
  return NextResponse.json(
  {
    ok: true,

    address:
      result.address,

    details:
      result.details,
  },
  {
    headers: {
      "Cache-Control":
        "no-store",
    },
  },
);

  try {
    const params =
      new URLSearchParams({
        lat: String(
          parsed.data.latitude,
        ),

        lon: String(
          parsed.data.longitude,
        ),

        format: "json",

        lang: "id",

        limit: "1",

        apiKey,
      });

    const response =
      await fetch(
        `https://api.geoapify.com/v1/geocode/reverse?${params.toString()}`,
        {
          cache: "no-store",

          signal:
            AbortSignal.timeout(
              5000,
            ),
        },
      );

    if (!response.ok) {
      return NextResponse.json(
        {
          ok: true,
          address: null,
        },
        {
          headers: {
            "Cache-Control":
              "no-store",
          },
        },
      );
    }

    const data =
      (await response.json()) as
        GeoapifyResponse;

    const result =
      data.results?.[0];

    if (!result) {
      return NextResponse.json(
        {
          ok: true,
          address: null,
        },
        {
          headers: {
            "Cache-Control":
              "no-store",
          },
        },
      );
    }

    /*
     * formatted biasanya sudah
     * menghasilkan alamat paling
     * lengkap dan enak dibaca.
     */
    const address =
      result.formatted?.trim() ||
      [
        result.address_line1,
        result.address_line2,
      ]
        .filter(Boolean)
        .join(", ")
        .trim() ||
      null;

    return NextResponse.json(
      {
        ok: true,

        address,

        details: {
          street:
            result.street ??
            null,

          houseNumber:
            result.housenumber ??
            null,

          suburb:
            result.suburb ??
            null,

          district:
            result.district ??
            null,

          city:
            result.city ??
            result.county ??
            null,

          state:
            result.state ??
            null,

          postcode:
            result.postcode ??
            null,
        },
      },
      {
        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  } catch (error) {
    /*
     * Timeout / Geoapify down
     * tidak boleh menghentikan
     * proses absensi.
     */
    console.error(
      "Reverse geocode gagal:",
      error,
    );

    return NextResponse.json(
      {
        ok: true,
        address: null,
      },
      {
        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  }
}