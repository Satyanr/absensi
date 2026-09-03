import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

import { createLeaveRequestSchema } from "@/lib/validation/leave";

export async function POST(request: NextRequest) {
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
        error: "Tidak memiliki akses.",
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

  const parsed = createLeaveRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Data pengajuan tidak valid.",

        details: parsed.error.flatten(),
      },
      {
        status: 400,
      },
    );
  }

  /*
   * Cuti wajib menggunakan
   * workflow pemohon.
   *
   * Jangan izinkan pembuatan
   * ANNUAL_LEAVE manual dari
   * endpoint admin.
   */
  if (parsed.data.type === "ANNUAL_LEAVE") {
    return NextResponse.json(
      {
        error: "Cuti harus diajukan oleh pemohon melalui Form Pengajuan Cuti.",
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

  if (parsed.data.type === "ANNUAL_LEAVE" && !employee.leaveEligible) {
    return NextResponse.json(
      {
        error: "Karyawan ini tidak memiliki hak cuti.",
      },
      {
        status: 409,
      },
    );
  }

  const startDate = new Date(`${parsed.data.startDate}T00:00:00.000Z`);

  const endDate = new Date(`${parsed.data.endDate}T00:00:00.000Z`);

  try {
    const leaveRequest = await prisma.$transaction(
      async (tx) => {
        const overlapping = await tx.leaveRequest.findFirst({
          where: {
            employeeId: employee.id,

            status: {
              in: ["PENDING", "APPROVED"],
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
          throw new Error("LEAVE_OVERLAP");
        }

        const created = await tx.leaveRequest.create({
          data: {
            employeeId: employee.id,

            type: parsed.data.type,

            startDate,

            endDate,

            reason: parsed.data.reason,

            /*
             * Selalu masuk PENDING dulu.
             */
            status: "PENDING",
          },

          select: {
            id: true,
            type: true,
            startDate: true,
            endDate: true,
            reason: true,
            status: true,
          },
        });

        await tx.auditLog.create({
          data: {
            actorId: user.id,

            action: "CREATE",

            entityType: "LeaveRequest",

            entityId: created.id,

            after: {
              employeeId: employee.id,

              employeeCode: employee.employeeCode,

              employeeName: employee.name,

              type: created.type,

              startDate: created.startDate.toISOString().slice(0, 10),

              endDate: created.endDate.toISOString().slice(0, 10),

              reason: created.reason,

              status: created.status,
            },

            ipAddress: request.headers.get("x-forwarded-for"),

            userAgent: request.headers.get("user-agent"),
          },
        });

        return created;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    return NextResponse.json(
      {
        ok: true,

        message: "Pengajuan berhasil dibuat.",

        leaveRequest,
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "LEAVE_OVERLAP") {
      return NextResponse.json(
        {
          error: "Sudah ada pengajuan lain pada rentang tanggal tersebut.",
        },
        {
          status: 409,
        },
      );
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034"
    ) {
      return NextResponse.json(
        {
          error: "Data pengajuan berubah bersamaan. Silakan coba kembali.",
        },
        {
          status: 409,
        },
      );
    }
    console.error(error);

    return NextResponse.json(
      {
        error: "Gagal membuat pengajuan.",
      },
      {
        status: 500,
      },
    );
  }
}
