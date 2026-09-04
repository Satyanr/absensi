import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { employeeLookupSchema } from "@/lib/validation/employee";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, {
    scope: "employee-lookup",

    limit: 120,

    windowMs: 60 * 1000,

    message:
      "Terlalu banyak pencarian karyawan. Silakan coba kembali sebentar lagi.",
  });

  if (limited) {
    return limited;
  }
  const code = request.nextUrl.searchParams.get("code");

  const parsed = employeeLookupSchema.safeParse({
    code,
  });

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Kode karyawan tidak valid.",
      },
      {
        status: 400,
      },
    );
  }

  const employee = await prisma.employee.findFirst({
    where: {
      active: true,
      employeeCode: {
        equals: parsed.data.code,
        mode: "insensitive",
      },
    },

    select: {
      employeeCode: true,
      name: true,
      employmentType: true,
    },
  });

  if (!employee) {
    return NextResponse.json(
      {
        error: "Personel tidak ditemukan.",
      },
      {
        status: 404,
      },
    );
  }

  return NextResponse.json({
    employee,
  });
}
