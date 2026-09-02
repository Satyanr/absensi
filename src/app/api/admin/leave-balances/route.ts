import { NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";

import { prisma } from "@/lib/prisma";

const getBalanceSchema = z.object({
  employeeId: z.string().trim().min(1),

  year: z.coerce.number().int().min(2000).max(2100),
});

const updateBalanceSchema = z.object({
  employeeId: z.string().trim().min(1),

  year: z.number().int().min(2000).max(2100),

  entitlement: z.number().int().min(0).max(365),

  carriedOver: z.number().int().min(0).max(365),

  adjusted: z.number().int().min(-365).max(365),
});

async function requireAdmin() {
  const user = await getCurrentUser();

  if (!user) {
    return {
      error: NextResponse.json(
        {
          error: "Belum login.",
        },
        {
          status: 401,
        },
      ),
      user: null,
    };
  }

  if (user.role === "EMPLOYEE") {
    return {
      error: NextResponse.json(
        {
          error: "Tidak memiliki akses.",
        },
        {
          status: 403,
        },
      ),
      user: null,
    };
  }

  return {
    error: null,
    user,
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();

  if (auth.error) {
    return auth.error;
  }

  const parsed = getBalanceSchema.safeParse({
    employeeId: request.nextUrl.searchParams.get("employeeId"),

    year: request.nextUrl.searchParams.get("year"),
  });

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Parameter saldo cuti tidak valid.",
      },
      {
        status: 400,
      },
    );
  }

  const employee = await prisma.employee.findUnique({
    where: {
      id: parsed.data.employeeId,
    },

    select: {
      id: true,
      employeeCode: true,
      name: true,
      active: true,
      leaveEligible: true,
    },
  });

  if (!employee) {
    return NextResponse.json(
      {
        error: "Karyawan tidak ditemukan.",
      },
      {
        status: 404,
      },
    );
  }

  const balance = await prisma.leaveBalance.findUnique({
    where: {
      employeeId_year: {
        employeeId: employee.id,

        year: parsed.data.year,
      },
    },

    select: {
      id: true,
      year: true,
      entitlement: true,
      carriedOver: true,
      used: true,
      adjusted: true,
    },
  });

  if (!balance) {
    return NextResponse.json({
      employee,

      balance: {
        year: parsed.data.year,

        entitlement: 0,
        carriedOver: 0,
        used: 0,
        adjusted: 0,

        remaining: 0,
      },

      exists: false,
    });
  }

  const remaining =
    balance.entitlement + balance.carriedOver + balance.adjusted - balance.used;

  return NextResponse.json({
    employee,

    balance: {
      ...balance,
      remaining,
    },

    exists: true,
  });
}

export async function PUT(request: NextRequest) {
  const auth = await requireAdmin();

  if (auth.error || !auth.user) {
    return auth.error;
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

  const parsed = updateBalanceSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Data saldo cuti tidak valid.",

        details: parsed.error.flatten(),
      },
      {
        status: 400,
      },
    );
  }

  const employee = await prisma.employee.findUnique({
    where: {
      id: parsed.data.employeeId,
    },

    select: {
      id: true,
      employeeCode: true,
      name: true,
      active: true,
      leaveEligible: true,
    },
  });

  if (!employee) {
    return NextResponse.json(
      {
        error: "Karyawan tidak ditemukan.",
      },
      {
        status: 404,
      },
    );
  }

  if (!employee.active) {
    return NextResponse.json(
      {
        error: "Karyawan sudah nonaktif.",
      },
      {
        status: 409,
      },
    );
  }

  if (!employee.leaveEligible) {
    return NextResponse.json(
      {
        error: "Karyawan ini tidak memiliki hak cuti.",
      },
      {
        status: 409,
      },
    );
  }

  const latest = await prisma.leaveBalance.findUnique({
    where: {
      employeeId_year: {
        employeeId: employee.id,

        year: parsed.data.year,
      },
    },

    select: {
      id: true,
      year: true,
      entitlement: true,
      carriedOver: true,
      used: true,
      adjusted: true,
    },
  });

  /*
   * used tidak pernah diterima
   * dari browser.
   *
   * Nilai ini hanya berubah lewat
   * approval cuti.
   */
  const currentUsed = latest?.used ?? 0;

  const totalEntitlement =
    parsed.data.entitlement + parsed.data.carriedOver + parsed.data.adjusted;

  /*
   * Admin tidak boleh menurunkan
   * total hak sampai lebih kecil
   * dari cuti yang sudah dipakai.
   */
  if (totalEntitlement < currentUsed) {
    return NextResponse.json(
      {
        error: `Total hak cuti tidak boleh lebih kecil dari ${currentUsed} hari yang sudah terpakai.`,
      },
      {
        status: 409,
      },
    );
  }

  try {
    const balance = await prisma.$transaction(async (tx) => {
      /*
       * Ambil saldo terbaru DI DALAM
       * transaction.
       */
      const latest = await tx.leaveBalance.findUnique({
        where: {
          employeeId_year: {
            employeeId: employee.id,

            year: parsed.data.year,
          },
        },

        select: {
          id: true,
          year: true,
          entitlement: true,
          carriedOver: true,
          used: true,
          adjusted: true,
        },
      });

      const saved = latest
        ? await (async () => {
            /*
             * Jangan izinkan admin
             * mengubah total hak menjadi
             * lebih kecil dari used
             * TERBARU.
             */
            const result = await tx.leaveBalance.updateMany({
              where: {
                id: latest.id,

                used: {
                  lte: totalEntitlement,
                },
              },

              data: {
                entitlement: parsed.data.entitlement,

                carriedOver: parsed.data.carriedOver,

                adjusted: parsed.data.adjusted,
              },
            });

            if (result.count !== 1) {
              const refreshed = await tx.leaveBalance.findUnique({
                where: {
                  id: latest.id,
                },

                select: {
                  used: true,
                },
              });

              throw new Error(
                `BALANCE_USED_CHANGED:${refreshed?.used ?? latest.used}`,
              );
            }

            return tx.leaveBalance.findUniqueOrThrow({
              where: {
                id: latest.id,
              },

              select: {
                id: true,
                year: true,
                entitlement: true,
                carriedOver: true,
                used: true,
                adjusted: true,
              },
            });
          })()
        : await tx.leaveBalance.create({
            data: {
              employeeId: employee.id,

              year: parsed.data.year,

              entitlement: parsed.data.entitlement,

              carriedOver: parsed.data.carriedOver,

              adjusted: parsed.data.adjusted,

              used: 0,
            },

            select: {
              id: true,
              year: true,
              entitlement: true,
              carriedOver: true,
              used: true,
              adjusted: true,
            },
          });

      await tx.auditLog.create({
        data: {
          actorId: auth.user.id,

          action: latest ? "UPDATE" : "CREATE",

          entityType: "LeaveBalance",

          entityId: saved.id,

          before: latest
            ? {
                employeeId: employee.id,

                year: latest.year,

                entitlement: latest.entitlement,

                carriedOver: latest.carriedOver,

                used: latest.used,

                adjusted: latest.adjusted,
              }
            : undefined,

          after: {
            employeeId: employee.id,

            employeeCode: employee.employeeCode,

            employeeName: employee.name,

            year: saved.year,

            entitlement: saved.entitlement,

            carriedOver: saved.carriedOver,

            used: saved.used,

            adjusted: saved.adjusted,
          },

          ipAddress: request.headers.get("x-forwarded-for"),

          userAgent: request.headers.get("user-agent"),
        },
      });

      return saved;
    });

    const remaining =
      balance.entitlement +
      balance.carriedOver +
      balance.adjusted -
      balance.used;

    return NextResponse.json({
      ok: true,

      message: "Saldo cuti berhasil disimpan.",

      balance: {
        ...balance,
        remaining,
      },
    });
  } catch (error) {
    console.error(error);

    if (
      error instanceof Error &&
      error.message.startsWith("BALANCE_USED_CHANGED:")
    ) {
      const used = error.message.split(":")[1];

      return NextResponse.json(
        {
          error: `Saldo berubah saat disimpan. Cuti yang sudah terpakai sekarang ${used} hari. Muat ulang saldo lalu coba lagi.`,
        },
        {
          status: 409,
        },
      );
    }

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        {
          error:
            "Saldo cuti baru saja dibuat atau diubah oleh admin lain. Muat ulang lalu coba lagi.",
        },
        {
          status: 409,
        },
      );
    }

    return NextResponse.json(
      {
        error: "Gagal menyimpan saldo cuti.",
      },
      {
        status: 500,
      },
    );
  }
}
