import {
  NextResponse,
} from "next/server";

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

type RateLimitOptions = {
  scope: string;

  limit: number;

  windowMs: number;

  identity?: string | null;

  message?: string;
};

type RateLimitGlobal = typeof globalThis & {
  __absensiRateLimitStore?: Map<
    string,
    RateLimitEntry
  >;

  __absensiRateLimitOperations?: number;
};

const rateLimitGlobal =
  globalThis as RateLimitGlobal;

const store =
  rateLimitGlobal
    .__absensiRateLimitStore ??
  new Map<
    string,
    RateLimitEntry
  >();

rateLimitGlobal.__absensiRateLimitStore =
  store;

function getClientIp(
  request: Request,
) {
  /*
   * Cloudflare Quick Tunnel.
   */
  const cloudflareIp =
    request.headers
      .get(
        "cf-connecting-ip",
      )
      ?.trim();

  if (cloudflareIp) {
    return cloudflareIp;
  }

  /*
   * Fallback proxy.
   */
  const forwardedFor =
    request.headers
      .get(
        "x-forwarded-for",
      )
      ?.split(",")[0]
      ?.trim();

  if (forwardedFor) {
    return forwardedFor;
  }

  const realIp =
    request.headers
      .get("x-real-ip")
      ?.trim();

  return realIp ||
    "unknown";
}

function cleanup(
  now: number,
) {
  const operations =
    (
      rateLimitGlobal
        .__absensiRateLimitOperations ??
      0
    ) + 1;

  rateLimitGlobal.__absensiRateLimitOperations =
    operations;

  /*
   * Tidak perlu scan Map
   * di setiap request.
   */
  if (
    operations % 100 !== 0 &&
    store.size < 5000
  ) {
    return;
  }

  for (
    const [key, entry]
    of store
  ) {
    if (
      entry.resetAt <= now
    ) {
      store.delete(key);
    }
  }

  /*
   * Safety agar Map tidak tumbuh
   * tanpa batas ketika diserang
   * banyak IP/identity berbeda.
   */
  if (
    store.size > 10000
  ) {
    let remove =
      store.size - 8000;

    for (
      const key
      of store.keys()
    ) {
      store.delete(key);

      remove -= 1;

      if (
        remove <= 0
      ) {
        break;
      }
    }
  }
}

export function enforceRateLimit(
  request: Request,
  options: RateLimitOptions,
) {
  const now =
    Date.now();

  cleanup(now);

  const ip =
    getClientIp(request);

  const identity =
    options.identity
      ?.trim()
      .toLowerCase()
      .slice(0, 100);

  const key = [
    options.scope,
    ip,

    identity ||
      "-",
  ].join(":");

  const current =
    store.get(key);

  let entry:
    RateLimitEntry;

  if (
    !current ||
    current.resetAt <= now
  ) {
    entry = {
      count: 1,

      resetAt:
        now +
        options.windowMs,
    };

    store.set(
      key,
      entry,
    );
  } else {
    entry = {
      ...current,

      count:
        current.count +
        1,
    };

    store.set(
      key,
      entry,
    );
  }

  if (
    entry.count <=
    options.limit
  ) {
    return null;
  }

  const retryAfterSeconds =
    Math.max(
      1,

      Math.ceil(
        (
          entry.resetAt -
          now
        ) / 1000,
      ),
    );

  return NextResponse.json(
    {
      error:
        options.message ??
        "Terlalu banyak permintaan. Silakan coba kembali beberapa saat lagi.",
    },
    {
      status: 429,

      headers: {
        "Retry-After":
          String(
            retryAfterSeconds,
          ),

        "X-RateLimit-Limit":
          String(
            options.limit,
          ),

        "X-RateLimit-Remaining":
          "0",

        "Cache-Control":
          "no-store",
      },
    },
  );
}