import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

import { createEmployeeSchema } from "@/lib/validation/admin-employee";

export async function POST(request: NextRequest) {
  /*
   * API admin wajib login.
   */
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      {
        error: "Belum login.",
      },
      {
        status: 401,
      },
    );
  }

  if (user.role !== "ADMIN" && user.role !== "LEADER") {
    return NextResponse.json(
      {
        error: "Hanya Admin atau Leader yang dapat mengelola karyawan.",
      },
      {
        status: 403,
      },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: "Request tidak valid.",
      },
      {
        status: 400,
      },
    );
  }

  const parsed = createEmployeeSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Data karyawan tidak valid.",

        details: parsed.error.flatten(),
      },
      {
        status: 400,
      },
    );
  }

  const prefix = parsed.data.employmentType === "INTERN" ? "MAG" : "EMP";

  const employeeCode = `${prefix}${parsed.data.codeNumber}`;

  /*
   * Cek kode karyawan.
   */
  const existingCode = await prisma.employee.findFirst({
    where: {
      employeeCode: {
        equals: employeeCode,

        mode: "insensitive",
      },
    },

    select: {
      id: true,
    },
  });

  if (existingCode) {
    return NextResponse.json(
      {
        error: "Kode karyawan sudah digunakan.",
      },
      {
        status: 409,
      },
    );
  }

  /*
   * Email juga unik jika diisi.
   */
  if (parsed.data.email) {
    const existingEmail = await prisma.employee.findFirst({
      where: {
        email: {
          equals: parsed.data.email,

          mode: "insensitive",
        },
      },

      select: {
        id: true,
      },
    });

    if (existingEmail) {
      return NextResponse.json(
        {
          error: "Email sudah digunakan.",
        },
        {
          status: 409,
        },
      );
    }
  }

  try {
    const employee = await prisma.employee.create({
      data: {
        employeeCode,

        employmentType: parsed.data.employmentType,

        name: parsed.data.name,

        email: parsed.data.email ?? null,

        phone: parsed.data.phone ?? null,

        joinDate: parsed.data.joinDate
          ? new Date(`${parsed.data.joinDate}T00:00:00.000Z`)
          : null,

        leaveEligible:
          parsed.data.leaveEligible ??
          parsed.data.employmentType === "EMPLOYEE",

        active: true,
      },

      select: {
        id: true,
        employeeCode: true,
        name: true,
        active: true,
      },
    });

    return NextResponse.json(
      {
        ok: true,

        message:
          parsed.data.employmentType === "INTERN"
            ? "Magang berhasil ditambahkan."
            : "Karyawan berhasil ditambahkan.",

        employee,
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    console.error(error);

    /*
     * Backup protection kalau dua
     * request masuk bersamaan dan
     * mengenai unique constraint.
     */
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        {
          error: "Kode atau email sudah digunakan.",
        },
        {
          status: 409,
        },
      );
    }

    return NextResponse.json(
      {
        error: "Gagal menyimpan karyawan.",
      },
      {
        status: 500,
      },
    );
  }
}
