import {
  NextRequest,
  NextResponse,
} from "next/server";

import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

const reviewLeaveRequestSchema = z.object({
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

type LeaveForAudit = {
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
};

function leaveRequestForAudit(
  leaveRequest: LeaveForAudit
) {
  return {
    employeeId: leaveRequest.employeeId,
    type: leaveRequest.type,

    startDate: leaveRequest.startDate
      .toISOString()
      .slice(0, 10),

    endDate: leaveRequest.endDate
      .toISOString()
      .slice(0, 10),

    reason: leaveRequest.reason,
    status: leaveRequest.status,

    approvedAt:
      leaveRequest.approvedAt?.toISOString() ??
      null,

    approvedBy:
      leaveRequest.approvedBy,
  };
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  const user = await getCurrentUser();

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

  if (user.role === "EMPLOYEE") {
    return NextResponse.json(
      {
        error: "Tidak memiliki akses.",
      },
      {
        status: 403,
      }
    );
  }

  const { id } = await context.params;

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
      }
    );
  }

  const parsed =
    reviewLeaveRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Aksi pengajuan tidak valid.",
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
      },
    });

  if (!existing) {
    return NextResponse.json(
      {
        error: "Pengajuan tidak ditemukan.",
      },
      {
        status: 404,
      }
    );
  }

  if (existing.status !== "PENDING") {
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
    parsed.data.action === "APPROVE";

  const reviewedAt = new Date();

  try {
    const updated =
      await prisma.$transaction(
        async (tx) => {
          const result =
            await tx.leaveRequest.updateMany({
              where: {
                id,
                status: "PENDING",
              },

              data: {
                status: isApprove
                  ? "APPROVED"
                  : "REJECTED",

                approvedAt: isApprove
                  ? reviewedAt
                  : null,

                approvedBy: isApprove
                  ? user.id
                  : null,
              },
            });

          // Proteksi double click / dua admin.
          if (result.count !== 1) {
            throw new Error(
              "LEAVE_ALREADY_REVIEWED"
            );
          }

          const leaveRequest =
            await tx.leaveRequest.findUniqueOrThrow({
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
              },
            });

          await tx.auditLog.create({
            data: {
              actorId: user.id,

              action:
                parsed.data.action,

              entityType:
                "LeaveRequest",

              entityId:
                leaveRequest.id,

              before:
                leaveRequestForAudit(
                  existing
                ),

              after:
                leaveRequestForAudit(
                  leaveRequest
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

          return leaveRequest;
        }
      );

    return NextResponse.json({
      ok: true,

      message: isApprove
        ? "Pengajuan berhasil disetujui."
        : "Pengajuan berhasil ditolak.",

      leaveRequest: updated,
    });
  } catch (error) {
    console.error(error);

    if (
      error instanceof Error &&
      error.message ===
        "LEAVE_ALREADY_REVIEWED"
    ) {
      return NextResponse.json(
        {
          error:
            "Pengajuan ini sudah diproses oleh admin lain.",
        },
        {
          status: 409,
        }
      );
    }

    return NextResponse.json(
      {
        error: isApprove
          ? "Gagal menyetujui pengajuan."
          : "Gagal menolak pengajuan.",
      },
      {
        status: 500,
      }
    );
  }
}