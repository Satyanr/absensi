import {
  NextRequest,
  NextResponse,
} from "next/server";

import { prisma } from "@/lib/prisma";

import {
  enforceRateLimit,
} from "@/lib/security/rate-limit";

export async function GET(
  request: NextRequest,
) {
  const limited =
    enforceRateLimit(request, {
      scope:
        "public-personnel-search",

      limit: 60,

      windowMs:
        60 * 1000,

      message:
        "Terlalu banyak pencarian. Silakan coba kembali sebentar lagi.",
    });

  if (limited) {
    return limited;
  }

  const query =
    request.nextUrl.searchParams
      .get("q")
      ?.trim()
      .slice(0, 80) ?? "";

  if (query.length < 3) {
    return NextResponse.json(
      {
        error:
          "Masukkan minimal 3 karakter nama.",
      },
      {
        status: 400,
        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  }

  const employees =
    await prisma.employee.findMany({
      where: {
        active: true,

        OR: [
          {
            name: {
              contains: query,
              mode: "insensitive",
            },
          },

          {
            employeeCode: {
              contains: query,
              mode: "insensitive",
            },
          },
        ],
      },

      select: {
        employeeCode: true,
        name: true,
        employmentType: true,
      },

      orderBy: {
        name: "asc",
      },

      take: 8,
    });

  return NextResponse.json(
    {
      employees,
    },
    {
      headers: {
        "Cache-Control":
          "no-store",
      },
    },
  );
}