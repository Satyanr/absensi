import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  Prisma,
} from "@/generated/prisma/client";

import {
  z,
} from "zod";

import {
  getCurrentUser,
} from "@/lib/auth/session";

import {
  countLeaveDaysByYear,
} from "@/lib/leave/balance";

import {
  prisma,
} from "@/lib/prisma";

const schema = z.object({
  startDate: z
    .string()
    .regex(
      /^\d{4}-\d{2}-\d{2}$/,
      "Tanggal mulai tidak valid.",
    ),

  endDate: z
    .string()
    .regex(
      /^\d{4}-\d{2}-\d{2}$/,
      "Tanggal selesai tidak valid.",
    ),

  reason: z
    .string()
    .trim()
    .min(
      3,
      "Alasan koreksi minimal 3 karakter.",
    )
    .max(500),
});

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function parseDate(
  value: string,
) {
  const date =
    new Date(
      `${value}T00:00:00.000Z`,
    );

  if (
    Number.isNaN(
      date.getTime(),
    ) ||
    date
      .toISOString()
      .slice(0, 10) !==
      value
  ) {
    return null;
  }

  return date;
}

export async function PATCH(
  request: NextRequest,
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
    user.role !== "ADMIN" &&
    user.role !== "LEADER"
  ) {
    return NextResponse.json(
      {
        error:
          "Hanya Admin atau Leader yang dapat mengoreksi Cuti.",
      },
      {
        status: 403,
      },
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
      },
    );
  }

  const parsed =
    schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          "Data koreksi tidak valid.",

        details:
          parsed.error.flatten(),
      },
      {
        status: 400,
      },
    );
  }

  const newStart =
    parseDate(
      parsed.data.startDate,
    );

  const newEnd =
    parseDate(
      parsed.data.endDate,
    );

  if (
    !newStart ||
    !newEnd
  ) {
    return NextResponse.json(
      {
        error:
          "Tanggal tidak valid.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    newStart.getTime() >
    newEnd.getTime()
  ) {
    return NextResponse.json(
      {
        error:
          "Tanggal mulai tidak boleh melewati tanggal selesai.",
      },
      {
        status: 400,
      },
    );
  }

  try {
    const result =
      await prisma.$transaction(
        async (tx) => {
          const leave =
            await tx.leaveRequest.findUnique({
              where: {
                id,
              },

              select: {
                id: true,
                employeeId: true,
                type: true,
                status: true,
                startDate: true,
                endDate: true,

                employee: {
                  select: {
                    employeeCode:
                      true,

                    name:
                      true,
                  },
                },
              },
            });

          if (!leave) {
            throw new Error(
              "NOT_FOUND",
            );
          }

          if (
            leave.type !==
            "ANNUAL_LEAVE"
          ) {
            throw new Error(
              "NOT_ANNUAL_LEAVE",
            );
          }

          /*
           * Koreksi ini khusus Cuti
           * yang sudah resmi disetujui.
           */
          if (
            leave.status !==
            "APPROVED"
          ) {
            throw new Error(
              "NOT_APPROVED",
            );
          }

          /*
           * Koreksi hanya boleh
           * MEMPERPENDEK periode.
           *
           * Tidak boleh menambah hari
           * di luar approval sebelumnya.
           */
          if (
            newStart.getTime() <
              leave.startDate.getTime() ||
            newEnd.getTime() >
              leave.endDate.getTime()
          ) {
            throw new Error(
              "EXPANSION_NOT_ALLOWED",
            );
          }

          if (
            newStart.getTime() ===
              leave.startDate.getTime() &&
            newEnd.getTime() ===
              leave.endDate.getTime()
          ) {
            throw new Error(
              "NO_CHANGE",
            );
          }

          /*
           * Hitung penggunaan lama
           * dengan helper yang sama
           * seperti approval.
           */
          const oldUsage =
            countLeaveDaysByYear(
              leave.startDate,
              leave.endDate,
            );

          const newUsage =
            countLeaveDaysByYear(
              newStart,
              newEnd,
            );

          const newUsageMap =
            new Map(
              newUsage.map(
                (item) => [
                  item.year,
                  item.days,
                ],
              ),
            );

          const released =
            oldUsage
              .map(
                (item) => ({
                  year:
                    item.year,

                  days:
                    item.days -
                    (
                      newUsageMap.get(
                        item.year,
                      ) ?? 0
                    ),
                }),
              )
              .filter(
                (item) =>
                  item.days > 0,
              );

          /*
           * Kembalikan saldo secara
           * atomik per tahun.
           */
          for (
            const item
            of released
          ) {
            const balance =
              await tx.leaveBalance.findUnique({
                where: {
                  employeeId_year: {
                    employeeId:
                      leave.employeeId,

                    year:
                      item.year,
                  },
                },

                select: {
                  id: true,
                  used: true,
                },
              });

            if (!balance) {
              throw new Error(
                `BALANCE_MISSING:${item.year}`,
              );
            }

            /*
             * Jangan sampai used
             * menjadi negatif.
             */
            const updatedBalance =
              await tx.leaveBalance.updateMany({
                where: {
                  id:
                    balance.id,

                  used: {
                    gte:
                      item.days,
                  },
                },

                data: {
                  used: {
                    decrement:
                      item.days,
                  },
                },
              });

            if (
              updatedBalance.count !==
              1
            ) {
              throw new Error(
                `BALANCE_INVALID:${item.year}`,
              );
            }
          }

          /*
           * Update hanya jika data belum
           * berubah sejak dibaca.
           */
          const updatedLeave =
            await tx.leaveRequest.updateMany({
              where: {
                id:
                  leave.id,

                status:
                  "APPROVED",

                type:
                  "ANNUAL_LEAVE",

                startDate:
                  leave.startDate,

                endDate:
                  leave.endDate,
              },

              data: {
                startDate:
                  newStart,

                endDate:
                  newEnd,
              },
            });

          if (
            updatedLeave.count !==
            1
          ) {
            throw new Error(
              "LEAVE_CHANGED",
            );
          }

          await tx.auditLog.create({
            data: {
              actorId:
                user.id,

              action:
                "UPDATE",

              entityType:
                "LeaveRequest",

              entityId:
                leave.id,

              before: {
                type:
                  leave.type,

                status:
                  leave.status,

                startDate:
                  leave.startDate
                    .toISOString()
                    .slice(
                      0,
                      10,
                    ),

                endDate:
                  leave.endDate
                    .toISOString()
                    .slice(
                      0,
                      10,
                    ),
              },

              after: {
                type:
                  leave.type,

                status:
                  leave.status,

                startDate:
                  newStart
                    .toISOString()
                    .slice(
                      0,
                      10,
                    ),

                endDate:
                  newEnd
                    .toISOString()
                    .slice(
                      0,
                      10,
                    ),

                balanceReturned:
                  released,

                correctionReason:
                  parsed.data.reason,
              },

              reason:
                parsed.data.reason,

              ipAddress:
                request.headers
                  .get(
                    "x-forwarded-for",
                  )
                  ?.split(",")[0]
                  ?.trim() ??
                null,

              userAgent:
                request.headers.get(
                  "user-agent",
                ),
            },
          });

          return {
            id:
              leave.id,

            employeeName:
              leave.employee.name,

            employeeCode:
              leave.employee
                .employeeCode,

            oldStartDate:
              leave.startDate,

            oldEndDate:
              leave.endDate,

            startDate:
              newStart,

            endDate:
              newEnd,

            balanceReturned:
              released.reduce(
                (
                  total,
                  item,
                ) =>
                  total +
                  item.days,
                0,
              ),
          };
        },
        {
          isolationLevel:
            Prisma
              .TransactionIsolationLevel
              .Serializable,
        },
      );

    return NextResponse.json({
      ok: true,

      message:
        result.balanceReturned >
        0
          ? `Cuti berhasil dikoreksi. ${result.balanceReturned} hari dikembalikan ke saldo cuti.`
          : "Cuti berhasil dikoreksi.",

      leaveRequest:
        result,
    });
  } catch (error) {
    console.error(error);

    if (
      error instanceof Error
    ) {
      switch (
        error.message
      ) {
        case "NOT_FOUND":
          return NextResponse.json(
            {
              error:
                "Pengajuan tidak ditemukan.",
            },
            {
              status: 404,
            },
          );

        case "NOT_ANNUAL_LEAVE":
          return NextResponse.json(
            {
              error:
                "Fitur koreksi ini hanya untuk Cuti.",
            },
            {
              status: 409,
            },
          );

        case "NOT_APPROVED":
          return NextResponse.json(
            {
              error:
                "Hanya Cuti yang sudah disetujui yang dapat dikoreksi.",
            },
            {
              status: 409,
            },
          );

        case "EXPANSION_NOT_ALLOWED":
          return NextResponse.json(
            {
              error:
                "Koreksi hanya boleh memperpendek periode Cuti. Untuk menambah hari, buat pengajuan baru.",
            },
            {
              status: 409,
            },
          );

        case "NO_CHANGE":
          return NextResponse.json(
            {
              error:
                "Tanggal Cuti tidak berubah.",
            },
            {
              status: 409,
            },
          );

        case "LEAVE_CHANGED":
          return NextResponse.json(
            {
              error:
                "Pengajuan berubah bersamaan. Muat ulang halaman dan coba kembali.",
            },
            {
              status: 409,
            },
          );
      }

      if (
        error.message.startsWith(
          "BALANCE_MISSING:",
        )
      ) {
        const year =
          error.message.split(
            ":",
          )[1];

        return NextResponse.json(
          {
            error:
              `Saldo cuti tahun ${year} tidak ditemukan.`,
          },
          {
            status: 409,
          },
        );
      }

      if (
        error.message.startsWith(
          "BALANCE_INVALID:",
        )
      ) {
        const year =
          error.message.split(
            ":",
          )[1];

        return NextResponse.json(
          {
            error:
              `Saldo cuti tahun ${year} tidak konsisten. Koreksi dibatalkan.`,
          },
          {
            status: 409,
          },
        );
      }
    }

    if (
      error instanceof
        Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034"
    ) {
      return NextResponse.json(
        {
          error:
            "Data berubah bersamaan. Silakan coba koreksi kembali.",
        },
        {
          status: 409,
        },
      );
    }

    return NextResponse.json(
      {
        error:
          "Gagal mengoreksi Cuti.",
      },
      {
        status: 500,
      },
    );
  }
}