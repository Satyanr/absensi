import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  destroySession,
} from "@/lib/auth/session";

export async function POST(
  _request: NextRequest
) {
  await destroySession();

  /*
   * Gunakan redirect relatif.
   *
   * Jangan:
   * new URL("/admin/login", request.url)
   *
   * karena saat lewat Docker / Cloudflare
   * request.url bisa menggunakan hostname
   * internal container.
   */
  return new NextResponse(null, {
    status: 303,

    headers: {
      Location: "/admin/login",
    },
  });
}