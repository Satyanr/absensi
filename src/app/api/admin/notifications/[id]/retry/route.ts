import {
  NextResponse,
} from "next/server";

import {
  getCurrentUser,
} from "@/lib/auth/session";

import {
  retryNotificationLog,
} from "@/lib/notification/retry";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(
  _request: Request,
  context: RouteContext,
) {
  const user =
    await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      {
        error:
          "Belum login.",
      },
      {
        status: 401,
      },
    );
  }

  if (
    user.role !==
    "ADMIN"
  ) {
    return NextResponse.json(
      {
        error:
          "Hanya Admin yang dapat mengirim ulang notifikasi.",
      },
      {
        status: 403,
      },
    );
  }

  const { id } =
    await context.params;

  const result =
    await retryNotificationLog(
      id,
    );

  if (!result.ok) {
    return NextResponse.json(
      {
        error:
          result.message,
      },
      {
        status:
          result.status,
      },
    );
  }

  return NextResponse.json({
    ok: true,

    message:
      result.message,
  });
}