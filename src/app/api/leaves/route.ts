import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

import { createPublicLeaveRequestSchema } from "@/lib/validation/leave";

import {
  allowedLeaveAttachmentMimeTypes,
  getLeaveAttachmentMaxBytes,
  isAnnualLeaveForm,
  removeLeaveAttachment,
  saveLeaveAttachment,
} from "@/lib/storage/leave-attachment";

import { Prisma } from "@/generated/prisma/client";

export async function POST(request: NextRequest) {
  let form: FormData;

  try {
    form = await request.formData();
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

  const parsed = createPublicLeaveRequestSchema.safeParse({
    employeeCode: form.get("employeeCode"),

    type: form.get("type"),

    startDate: form.get("startDate"),

    endDate: form.get("endDate"),

    reason: form.get("reason"),
  });

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
   * =========================
   * ATTACHMENT
   * =========================
   */

  const attachmentValue = form.get("attachment");

  const attachment =
    attachmentValue instanceof File && attachmentValue.size > 0
      ? attachmentValue
      : null;

  /*
   * =========================
   * VALIDASI DOKUMEN
   * =========================
   */

  if (parsed.data.type === "ANNUAL_LEAVE") {
    /*
     * Cuti wajib mengupload kembali
     * Form Pengajuan Cuti DOCX.
     */
    if (!attachment) {
      return NextResponse.json(
        {
          error: "Form Pengajuan Cuti yang sudah dilengkapi wajib diupload.",
        },
        {
          status: 400,
        },
      );
    }

    if (!isAnnualLeaveForm(attachment)) {
      return NextResponse.json(
        {
          error: "Form Pengajuan Cuti harus berupa file Word .docx.",
        },
        {
          status: 400,
        },
      );
    }
  } else if (attachment) {
    /*
     * Izin / Sakit:
     * attachment tetap opsional
     * dan berupa bukti foto/PDF.
     */
    if (!allowedLeaveAttachmentMimeTypes.includes(attachment.type)) {
      return NextResponse.json(
        {
          error:
            "Format lampiran tidak didukung. Gunakan JPG, PNG, WEBP, HEIC, HEIF, atau PDF.",
        },
        {
          status: 400,
        },
      );
    }
  }

  /*
   * Semua attachment maksimal
   * memakai limit yang sama.
   */
  if (attachment && attachment.size > getLeaveAttachmentMaxBytes()) {
    return NextResponse.json(
      {
        error: "Ukuran dokumen maksimal 5 MB.",
      },
      {
        status: 413,
      },
    );
  }

  /*
   * =========================
   * EMPLOYEE
   * =========================
   */

  const employee = await prisma.employee.findFirst({
    where: {
      active: true,

      employeeCode: {
        equals: parsed.data.employeeCode,

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
        error: "Karyawan tidak ditemukan atau sudah nonaktif.",
      },
      {
        status: 404,
      },
    );
  }

  if (parsed.data.type === "ANNUAL_LEAVE" && !employee.leaveEligible) {
    return NextResponse.json(
      {
        error: "Anda belum memiliki hak cuti.",
      },
      {
        status: 409,
      },
    );
  }

  const startDate = new Date(`${parsed.data.startDate}T00:00:00.000Z`);

  const endDate = new Date(`${parsed.data.endDate}T00:00:00.000Z`);

  /*
   * File disimpan setelah semua
   * validasi awal lolos.
   */
  let storedAttachment: Awaited<ReturnType<typeof saveLeaveAttachment>> | null =
    null;

  try {
    if (attachment) {
      storedAttachment = await saveLeaveAttachment(attachment);
    }

    const leaveRequest = await prisma.$transaction(
      async (tx) => {
        /*
         * =========================
         * CEK OVERLAP ATOMIC
         * =========================
         */
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

        let attachmentId: string | null = null;

        if (storedAttachment) {
          const createdAttachment = await tx.attachment.create({
            data: {
              storageDisk: "local",

              storagePath: storedAttachment.storagePath,

              originalFilename: storedAttachment.originalFilename,

              mimeType: storedAttachment.mimeType,

              fileSize: storedAttachment.fileSize,

              checksum: storedAttachment.checksum,
            },

            select: {
              id: true,
            },
          });

          attachmentId = createdAttachment.id;
        }

        const created = await tx.leaveRequest.create({
          data: {
            employeeId: employee.id,

            type: parsed.data.type,

            startDate,
            endDate,

            reason: parsed.data.reason,

            attachmentId,

            /*
             * Public submission
             * SELALU PENDING.
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
            attachmentId: true,
            submittedAt: true,
          },
        });

        await tx.auditLog.create({
          data: {
            actorId: null,

            action: "CREATE",

            entityType: "LeaveRequest",

            entityId: created.id,

            after: {
              source: "PUBLIC_EMPLOYEE",

              employeeId: employee.id,

              employeeCode: employee.employeeCode,

              employeeName: employee.name,

              type: created.type,

              startDate: created.startDate.toISOString().slice(0, 10),

              endDate: created.endDate.toISOString().slice(0, 10),

              reason: created.reason,

              status: created.status,

              attachmentId: created.attachmentId,

              attachment: storedAttachment
                ? {
                    originalFilename: storedAttachment.originalFilename,

                    mimeType: storedAttachment.mimeType,

                    fileSize: Number(storedAttachment.fileSize),
                  }
                : null,
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

        message: "Pengajuan berhasil dikirim dan menunggu persetujuan.",

        leaveRequest,
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    /*
     * Jangan tinggalkan orphan
     * file jika DB gagal.
     */
    if (storedAttachment) {
      await removeLeaveAttachment(storedAttachment.absolutePath);
    }

    if (error instanceof Error && error.message === "LEAVE_OVERLAP") {
      return NextResponse.json(
        {
          error: "Sudah ada pengajuan pada rentang tanggal tersebut.",
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
          error:
            "Data pengajuan berubah bersamaan. Silakan coba kirim kembali.",
        },
        {
          status: 409,
        },
      );
    }

    console.error(error);

    return NextResponse.json(
      {
        error: "Gagal mengirim pengajuan.",
      },
      {
        status: 500,
      },
    );
  }
}
