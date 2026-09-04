export type GpsFreshnessResult =
  | {
      ok: true;

      capturedAt: Date;

      ageSeconds: number;
    }
  | {
      ok: false;

      reason:
        | "INVALID"
        | "STALE"
        | "FUTURE";

      message: string;
    };

function getPositiveEnv(
  name: string,
  fallback: number,
  maximum: number,
) {
  const value =
    Number(
      process.env[name],
    );

  if (
    !Number.isFinite(value) ||
    value <= 0 ||
    value > maximum
  ) {
    return fallback;
  }

  return value;
}

export function getMaxGpsAgeSeconds() {
  return getPositiveEnv(
    "MAX_GPS_AGE_SECONDS",
    120,
    3600,
  );
}

export function getMaxGpsFutureSkewSeconds() {
  return getPositiveEnv(
    "MAX_GPS_FUTURE_SKEW_SECONDS",
    30,
    300,
  );
}

export function validateGpsFreshness(
  capturedAtValue: string,
  serverReceivedAt: Date,
): GpsFreshnessResult {
  const capturedAt =
    new Date(
      capturedAtValue,
    );

  if (
    Number.isNaN(
      capturedAt.getTime(),
    )
  ) {
    return {
      ok: false,

      reason:
        "INVALID",

      message:
        "Waktu pengambilan GPS tidak valid.",
    };
  }

  const differenceMs =
    serverReceivedAt.getTime() -
    capturedAt.getTime();

  const maxAgeMs =
    getMaxGpsAgeSeconds() *
    1000;

  const maxFutureMs =
    getMaxGpsFutureSkewSeconds() *
    1000;

  if (
    differenceMs <
    -maxFutureMs
  ) {
    return {
      ok: false,

      reason:
        "FUTURE",

      message:
        "Waktu GPS perangkat tidak valid. Periksa tanggal dan jam perangkat lalu ambil ulang lokasi.",
    };
  }

  if (
    differenceMs >
    maxAgeMs
  ) {
    return {
      ok: false,

      reason:
        "STALE",

      message:
        "Lokasi sudah terlalu lama. Ambil ulang GPS lalu coba kembali.",
    };
  }

  return {
    ok: true,

    capturedAt,

    ageSeconds:
      Math.max(
        0,
        Math.round(
          differenceMs /
            1000,
        ),
      ),
  };
}