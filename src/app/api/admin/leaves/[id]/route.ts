import {
  NextRequest,
  NextResponse,
} from "next/server";

import { z } from "zod";

import {
  getCurrentUser,
} from "@/lib/auth/session";

import {
  prisma,
} from "@/lib/prisma";

import {
  countLeaveDaysByYear,
} from "@/lib/leave/balance";

const reviewSchema = z.object({
  action: z.enum([
    "APPROVE",
    "REJECT",
  ]),
});

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function leaveForAudit(
  leave: {
    employeeId: string;

    type:
      | "PERMISSION"
      | "SICK"
      | "ANNUAL_LEAVE";

    startDate: Date;
    endDate: Date;
    reason: string;

    status:
      | "PENDING"
      | "APPROVED"
      | "REJECTED"
      | "CANCELLED";

    approvedAt: Date | null;
    approvedBy: string | null;
  }
) {
  return {
    employeeId:
      leave.employeeId,

    type:
      leave.type,

    startDate:
      leave.startDate
        .toISOString()
        .slice(0, 10),

    endDate:
      leave.endDate
        .toISOString()
        .slice(0, 10),

    reason:
      leave.reason,

    status:
      leave.status,

    approvedAt:
      leave.approvedAt
        ?.toISOString() ??
      null,

    approvedBy:
      leave.approvedBy,
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
    reviewSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          "Aksi tidak valid.",
      },
      {
        status: 400,
      }
    );
  }

  const existing =
    await prisma.leaveRequest.findUnique({
      where: {
        id,
      },

      select: {
        id: true,
        employeeId: true,
        type: true,
        startDate: true,
        endDate: true,
        reason: true,
        status: true,
        approvedAt: true,
        approvedBy: true,

        employee: {
          select: {
            employeeCode: true,
            name: true,
          },
        },
      },
    });

  if (!existing) {
    return NextResponse.json(
      {
        error:
          "Pengajuan tidak ditemukan.",
      },
      {
        status: 404,
      }
    );
  }

  if (
    existing.status !==
    "PENDING"
  ) {
    return NextResponse.json(
      {
        error:
          "Pengajuan ini sudah diproses.",
      },
      {
        status: 409,
      }
    );
  }

  const isApprove =
    parsed.data.action ===
    "APPROVE";

  /*
   * Hanya cuti yang
   * menggunakan saldo.
   */
  const leaveUsage =
    isApprove &&
    existing.type ===
      "ANNUAL_LEAVE"
      ? countLeaveDaysByYear(
          existing.startDate,
          existing.endDate
        )
      : [];

  try {
    const updated =
      await prisma.$transaction(
        async (tx) => {
          /*
           * Cek semua saldo SEBELUM
           * mengubah LeaveRequest.
           */
          for (
            const usage of
            leaveUsage
          ) {
            const balance =
              await tx.leaveBalance.findUnique({
                where: {
                  employeeId_year: {
                    employeeId:
                      existing.employeeId,

                    year:
                      usage.year,
                  },
                },
              });

            if (!balance) {
              throw new Error(
                `BALANCE_MISSING:${usage.year}`
              );
            }

            const available =
              balance.entitlement +
              balance.carriedOver +
              balance.adjusted -
              balance.used;

            if (
              available <
              usage.days
            ) {
              throw new Error(
                `BALANCE_INSUFFICIENT:${usage.year}:${available}:${usage.days}`
              );
            }
          }

          /*
           * Update hanya jika masih
           * PENDING.
           *
           * Melindungi dari double
           * click / dua admin.
           */
          const updateResult =
            await tx.leaveRequest.updateMany({
              where: {
                id:
                  existing.id,

                status:
                  "PENDING",
              },

              data: {
                status:
                  isApprove
                    ? "APPROVED"
                    : "REJECTED",

                approvedAt:
                  isApprove
                    ? new Date()
                    : null,

                approvedBy:
                  isApprove
                    ? user.id
                    : null,
              },
            });

          if (
            updateResult.count !==
            1
          ) {
            throw new Error(
              "ALREADY_REVIEWED"
            );
          }

          /*
           * Baru kurangi saldo
           * setelah approval berhasil.
           */
          for (
            const usage of
            leaveUsage
          ) {
            await tx.leaveBalance.update({
              where: {
                employeeId_year: {
                  employeeId:
                    existing.employeeId,

                  year:
                    usage.year,
                },
              },

              data: {
                used: {
                  increment:
                    usage.days,
                },
              },
            });
          }

          const leave =
            await tx.leaveRequest.findUniqueOrThrow({
              where: {
                id:
                  existing.id,
              },

              select: {
                id: true,
                employeeId: true,
                type: true,
                startDate: true,
                endDate: true,
                reason: true,
                status: true,
                approvedAt: true,
                approvedBy: true,
              },
            });

          await tx.auditLog.create({
            data: {
              actorId:
                user.id,

              action:
                isApprove
                  ? "APPROVE"
                  : "REJECT",

              entityType:
                "LeaveRequest",

              entityId:
                leave.id,

              before:
                leaveForAudit(
                  existing
                ),

              after: {
                ...leaveForAudit(
                  leave
                ),

                leaveBalanceUsage:
                  leaveUsage,
              },

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

          return leave;
        }
      );

    return NextResponse.json({
      ok: true,

      message:
        isApprove
          ? "Pengajuan berhasil disetujui."
          : "Pengajuan berhasil ditolak.",

      leaveRequest:
        updated,
    });
  } catch (error) {
    console.error(error);

    if (
      error instanceof Error
    ) {
      if (
        error.message ===
        "ALREADY_REVIEWED"
      ) {
        return NextResponse.json(
          {
            error:
              "Pengajuan sudah diproses oleh admin lain.",
          },
          {
            status: 409,
          }
        );
      }

      if (
        error.message.startsWith(
          "BALANCE_MISSING:"
        )
      ) {
        const year =
          error.message.split(
            ":"
          )[1];

        return NextResponse.json(
          {
            error:
              `Saldo cuti tahun ${year} belum diatur untuk karyawan ini.`,
          },
          {
            status: 409,
          }
        );
      }

      if (
        error.message.startsWith(
          "BALANCE_INSUFFICIENT:"
        )
      ) {
        const [
          ,
          year,
          available,
          needed,
        ] =
          error.message.split(
            ":"
          );

        return NextResponse.json(
          {
            error:
              `Saldo cuti tahun ${year} tidak cukup. Sisa ${available} hari, pengajuan membutuhkan ${needed} hari.`,
          },
          {
            status: 409,
          }
        );
      }
    }

    return NextResponse.json(
      {
        error:
          "Gagal memproses pengajuan.",
      },
      {
        status: 500,
      }
    );
  }
}