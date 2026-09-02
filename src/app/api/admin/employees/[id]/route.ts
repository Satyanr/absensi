import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  getCurrentUser,
} from "@/lib/auth/session";

import {
  prisma,
} from "@/lib/prisma";

import {
  updateEmployeeSchema,
} from "@/lib/validation/admin-employee";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function employeeForAudit(employee: {
  employeeCode: string;
  name: string;
  email: string | null;
  phone: string | null;
  joinDate: Date | null;
  leaveEligible: boolean;
  active: boolean;
}) {
  return {
    employeeCode:
      employee.employeeCode,

    name:
      employee.name,

    email:
      employee.email,

    phone:
      employee.phone,

    joinDate:
      employee.joinDate
        ? employee.joinDate
            .toISOString()
        : null,

    leaveEligible:
      employee.leaveEligible,

    active:
      employee.active,
  };
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  const user =
    await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      {
        error: "Belum login.",
      },
      {
        status: 401,
      }
    );
  }

  if (
    user.role === "EMPLOYEE"
  ) {
    return NextResponse.json(
      {
        error:
          "Tidak memiliki akses.",
      },
      {
        status: 403,
      }
    );
  }

  const { id } =
    await context.params;

  const existing =
    await prisma.employee.findUnique({
      where: {
        id,
      },

      select: {
        id: true,
        employeeCode: true,
        name: true,
        email: true,
        phone: true,
        joinDate: true,
        leaveEligible: true,
        active: true,
      },
    });

  if (!existing) {
    return NextResponse.json(
      {
        error:
          "Karyawan tidak ditemukan.",
      },
      {
        status: 404,
      }
    );
  }

  let body: unknown;

  try {
    body =
      await request.json();
  } catch {
    return NextResponse.json(
      {
        error:
          "Request tidak valid.",
      },
      {
        status: 400,
      }
    );
  }

  const parsed =
    updateEmployeeSchema.safeParse(
      body
    );

  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          "Data karyawan tidak valid.",

        details:
          parsed.error.flatten(),
      },
      {
        status: 400,
      }
    );
  }

  try {
    const updated =
      await prisma.$transaction(
        async (tx) => {
          const employee =
            await tx.employee.update({
              where: {
                id,
              },

              data: {
                employeeCode:
                  parsed.data
                    .employeeCode,

                name:
                  parsed.data.name,

                email:
                  parsed.data.email,

                phone:
                  parsed.data.phone,

                joinDate:
                  parsed.data.joinDate ===
                  undefined
                    ? undefined
                    : parsed.data
                        .joinDate ===
                      null
                    ? null
                    : new Date(
                        `${parsed.data.joinDate}T00:00:00.000Z`
                      ),

                leaveEligible:
                  parsed.data
                    .leaveEligible,

                active:
                  parsed.data.active,
              },

              select: {
                id: true,
                employeeCode: true,
                name: true,
                email: true,
                phone: true,
                joinDate: true,
                leaveEligible: true,
                active: true,
              },
            });

          /*
           * Catat perubahan.
           */
          await tx.auditLog.create({
            data: {
              actorId:
                user.id,

              action:
                "UPDATE",

              entityType:
                "Employee",

              entityId:
                employee.id,

              before:
                employeeForAudit(
                  existing
                ),

              after:
                employeeForAudit(
                  employee
                ),

              ipAddress:
                request.headers.get(
                  "x-forwarded-for"
                ),

              userAgent:
                request.headers.get(
                  "user-agent"
                ),
            },
          });

          return employee;
        }
      );

    return NextResponse.json({
      ok: true,

      message:
        parsed.data.active ===
        false
          ? "Karyawan berhasil dinonaktifkan."
          : parsed.data.active ===
            true
          ? "Karyawan berhasil diaktifkan."
          : "Data karyawan berhasil diperbarui.",

      employee: updated,
    });
  } catch (error) {
    console.error(error);

    if (
      error &&
      typeof error ===
        "object" &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        {
          error:
            "Kode karyawan atau email sudah digunakan.",
        },
        {
          status: 409,
        }
      );
    }

    return NextResponse.json(
      {
        error:
          "Gagal memperbarui karyawan.",
      },
      {
        status: 500,
      }
    );
  }
}