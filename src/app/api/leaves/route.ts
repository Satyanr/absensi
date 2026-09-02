import {
  NextRequest,
  NextResponse,
} from "next/server";

import { prisma } from "@/lib/prisma";

import {
  createPublicLeaveRequestSchema,
} from "@/lib/validation/leave";

export async function POST(
  request: NextRequest
) {
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
    createPublicLeaveRequestSchema.safeParse(
      body
    );

  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          "Data pengajuan tidak valid.",

        details:
          parsed.error.flatten(),
      },
      {
        status: 400,
      }
    );
  }

  /*
   * Cari employee dari kode.
   * Employee nonaktif tidak boleh
   * membuat pengajuan baru.
   */
  const employee =
    await prisma.employee.findFirst({
      where: {
        active: true,

        employeeCode: {
          equals:
            parsed.data.employeeCode,

          mode: "insensitive",
        },
      },

      select: {
        id: true,
        employeeCode: true,
        name: true,
        leaveEligible: true,
      },
    });

  if (!employee) {
    return NextResponse.json(
      {
        error:
          "Karyawan tidak ditemukan atau sudah nonaktif.",
      },
      {
        status: 404,
      }
    );
  }

  /*
   * Hanya employee yang punya
   * hak cuti boleh mengajukan
   * ANNUAL_LEAVE.
   */
  if (
    parsed.data.type ===
      "ANNUAL_LEAVE" &&
    !employee.leaveEligible
  ) {
    return NextResponse.json(
      {
        error:
          "Anda belum memiliki hak cuti.",
      },
      {
        status: 409,
      }
    );
  }

  const startDate =
    new Date(
      `${parsed.data.startDate}T00:00:00.000Z`
    );

  const endDate =
    new Date(
      `${parsed.data.endDate}T00:00:00.000Z`
    );

  /*
   * Cegah pengajuan bertumpuk.
   *
   * REJECTED dan CANCELLED
   * tidak dianggap aktif.
   */
  const overlapping =
    await prisma.leaveRequest.findFirst({
      where: {
        employeeId:
          employee.id,

        status: {
          in: [
            "PENDING",
            "APPROVED",
          ],
        },

        startDate: {
          lte: endDate,
        },

        endDate: {
          gte: startDate,
        },
      },

      select: {
        id: true,
      },
    });

  if (overlapping) {
    return NextResponse.json(
      {
        error:
          "Sudah ada pengajuan pada rentang tanggal tersebut.",
      },
      {
        status: 409,
      }
    );
  }

  try {
    const leaveRequest =
      await prisma.$transaction(
        async (tx) => {
          const created =
            await tx.leaveRequest.create({
              data: {
                employeeId:
                  employee.id,

                type:
                  parsed.data.type,

                startDate,
                endDate,

                reason:
                  parsed.data.reason,

                /*
                 * Pengajuan publik
                 * TIDAK PERNAH langsung
                 * approved.
                 */
                status:
                  "PENDING",
              },

              select: {
                id: true,
                type: true,
                startDate: true,
                endDate: true,
                reason: true,
                status: true,
                submittedAt: true,
              },
            });

          /*
           * Tetap simpan audit.
           *
           * actorId null karena
           * employee tidak login.
           */
          await tx.auditLog.create({
            data: {
              actorId: null,

              action:
                "CREATE",

              entityType:
                "LeaveRequest",

              entityId:
                created.id,

              after: {
                source:
                  "PUBLIC_EMPLOYEE",

                employeeId:
                  employee.id,

                employeeCode:
                  employee.employeeCode,

                employeeName:
                  employee.name,

                type:
                  created.type,

                startDate:
                  created.startDate
                    .toISOString()
                    .slice(0, 10),

                endDate:
                  created.endDate
                    .toISOString()
                    .slice(0, 10),

                reason:
                  created.reason,

                status:
                  created.status,
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

          return created;
        }
      );

    return NextResponse.json(
      {
        ok: true,

        message:
          "Pengajuan berhasil dikirim dan menunggu persetujuan.",

        leaveRequest,
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error:
          "Gagal mengirim pengajuan.",
      },
      {
        status: 500,
      }
    );
  }
}