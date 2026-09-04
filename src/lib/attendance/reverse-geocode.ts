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

export type ReverseGeocodeResult = {
  address: string | null;

  details: {
    street: string | null;

    houseNumber: string | null;

    suburb: string | null;

    district: string | null;

    city: string | null;

    state: string | null;

    postcode: string | null;
  } | null;
};

export async function reverseGeocodeCoordinates(
  latitude: number,
  longitude: number,
): Promise<ReverseGeocodeResult> {
  const apiKey =
    process.env.GEOAPIFY_API_KEY?.trim();

  if (!apiKey) {
    return {
      address: null,

      details: null,
    };
  }

  try {
    const params =
      new URLSearchParams({
        lat: String(latitude),

        lon: String(longitude),

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
      return {
        address: null,

        details: null,
      };
    }

    const data =
      (await response.json()) as
        GeoapifyResponse;

    const result =
      data.results?.[0];

    if (!result) {
      return {
        address: null,

        details: null,
      };
    }

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

    return {
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
    };
  } catch (error) {
    /*
     * Reverse geocode hanya
     * informasi tambahan.
     *
     * Tidak boleh menggagalkan
     * absensi.
     */
    console.error(
      "Reverse geocode gagal:",
      error,
    );

    return {
      address: null,

      details: null,
    };
  }
}