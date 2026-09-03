import {
  prisma,
} from "@/lib/prisma";

import {
  retryTrackedMailBestEffort,
} from "@/lib/notification/mailer";

import {
  getApprovedLeaveEmailAttachment,
} from "@/lib/notification/leave-document";

function leaveLabel(
  type: string,
) {
  switch (type) {
    case "PERMISSION":
      return "Izin";

    case "SICK":
      return "Sakit";

    case "ANNUAL_LEAVE":
      return "Cuti";

    default:
      return "Pengajuan";
  }
}

function formatDate(
  value: Date,
) {
  return new Intl.DateTimeFormat(
    "id-ID",
    {
      timeZone: "UTC",

      day: "2-digit",
      month: "long",
      year: "numeric",
    },
  ).format(value);
}

function escapeHtml(
  value: string,
) {
  return value
    .replace(
      /&/g,
      "&amp;",
    )
    .replace(
      /</g,
      "&lt;",
    )
    .replace(
      />/g,
      "&gt;",
    )
    .replace(
      /"/g,
      "&quot;",
    )
    .replace(
      /'/g,
      "&#039;",
    );
}

function getErrorMessage(
  error: unknown,
) {
  return error instanceof Error
    ? error.message.slice(
        0,
        2000,
      )
    : "Gagal mempersiapkan email.";
}

export async function retryNotificationLog(
  id: string,
) {
  const log =
    await prisma.notificationLog.findUnique({
      where: {
        id,
      },
    });

  if (!log) {
    return {
      ok: false,
      status: 404,
      message:
        "Log notifikasi tidak ditemukan.",
    };
  }

  if (
    log.channel !==
    "EMAIL"
  ) {
    return {
      ok: false,
      status: 409,
      message:
        "Retry saat ini hanya mendukung email.",
    };
  }

  if (
    log.status !==
    "FAILED"
  ) {
    return {
      ok: false,
      status: 409,
      message:
        "Hanya notifikasi gagal yang dapat dikirim ulang.",
    };
  }

  /*
   * Claim atomik agar dua Admin
   * tidak melakukan retry bersamaan.
   */
  const claim =
    await prisma.notificationLog.updateMany({
      where: {
        id,
        status:
          "FAILED",
      },

      data: {
        status:
          "PENDING",

        lastError:
          null,
      },
    });

  if (
    claim.count !== 1
  ) {
    return {
      ok: false,
      status: 409,
      message:
        "Notifikasi sedang diproses oleh Admin lain.",
    };
  }

  try {
    /*
     * ======================
     * TEST EMAIL
     * ======================
     */
    if (
      log.type ===
      "TEST_EMAIL"
    ) {
      const sent =
        await retryTrackedMailBestEffort(
          log.id,
          {
            to:
              log.recipient,

            subject:
              log.subject ??
              "[Absensi] Test Notifikasi Email",

            text:
              "Ini adalah pengiriman ulang email test Sistem Absensi.",

            html: `
              <div style="font-family:Arial,sans-serif">
                <h2>Test Notifikasi Email</h2>

                <p>
                  Ini adalah pengiriman ulang email test Sistem Absensi.
                </p>
              </div>
            `,
          },
        );

      return {
        ok:
          sent,

        status:
          sent
            ? 200
            : 502,

        message:
          sent
            ? "Email berhasil dikirim ulang."
            : "Email masih gagal dikirim.",
      };
    }

    if (
      log.entityType !==
        "LeaveRequest" ||
      !log.entityId
    ) {
      throw new Error(
        "Notifikasi tidak memiliki referensi pengajuan.",
      );
    }

    const leave =
      await prisma.leaveRequest.findUnique({
        where: {
          id:
            log.entityId,
        },

        select: {
          id: true,
          type: true,
          status: true,
          startDate: true,
          endDate: true,
          reason: true,

          employee: {
            select: {
              employeeCode:
                true,

              name:
                true,

              email:
                true,
            },
          },
        },
      });

    if (!leave) {
      throw new Error(
        "Pengajuan sudah tidak ditemukan.",
      );
    }

    const typeLabel =
      leaveLabel(
        leave.type,
      );

    const start =
      formatDate(
        leave.startDate,
      );

    const end =
      formatDate(
        leave.endDate,
      );

    /*
     * ======================
     * SUBMITTED
     * ======================
     */
    if (
      log.type ===
      "LEAVE_SUBMITTED"
    ) {
      if (
        leave.status !==
        "PENDING"
      ) {
        throw new Error(
          "Pengajuan sudah tidak berstatus menunggu sehingga notifikasi pengajuan baru tidak boleh dikirim ulang.",
        );
      }

      const baseUrl =
        process.env.APP_URL
          ?.trim()
          .replace(
            /\/+$/,
            "",
          );

      const adminUrl =
        baseUrl
          ? `${baseUrl}/admin/leaves`
          : null;

      const sent =
        await retryTrackedMailBestEffort(
          log.id,
          {
            to:
              log.recipient,

            subject:
              log.subject ??
              `[Absensi] Pengajuan ${typeLabel} Baru - ${leave.employee.name}`,

            text: [
              `Ada pengajuan ${typeLabel} yang menunggu persetujuan.`,
              "",
              `Karyawan: ${leave.employee.name}`,
              `Kode: ${leave.employee.employeeCode}`,
              `Tanggal: ${start} - ${end}`,
              `Alasan: ${leave.reason}`,
              "",
              ...(adminUrl
                ? [
                    `Buka pengajuan: ${adminUrl}`,
                  ]
                : []),
            ].join(
              "\n",
            ),

            html: `
              <div style="font-family:Arial,sans-serif;line-height:1.6">
                <h2>Pengajuan ${escapeHtml(typeLabel)} Baru</h2>

                <p>
                  <strong>${escapeHtml(leave.employee.name)}</strong>
                  mengajukan ${escapeHtml(typeLabel)}.
                </p>

                <p>
                  ${start} - ${end}
                </p>

                <p>
                  ${escapeHtml(leave.reason)}
                </p>

                ${
                  adminUrl
                    ? `<p><a href="${escapeHtml(adminUrl)}">Buka Pengajuan</a></p>`
                    : ""
                }
              </div>
            `,
          },
        );

      return {
        ok:
          sent,

        status:
          sent
            ? 200
            : 502,

        message:
          sent
            ? "Email berhasil dikirim ulang."
            : "Email masih gagal dikirim.",
      };
    }

    /*
     * ======================
     * APPROVED / REJECTED
     * ======================
     */
    const expectedStatus =
      log.type ===
      "LEAVE_APPROVED"
        ? "APPROVED"
        : log.type ===
            "LEAVE_REJECTED"
          ? "REJECTED"
          : null;

    if (!expectedStatus) {
      throw new Error(
        "Jenis notifikasi belum mendukung retry.",
      );
    }

    if (
      leave.status !==
      expectedStatus
    ) {
      throw new Error(
        "Status pengajuan sudah berubah sehingga notifikasi lama tidak boleh dikirim ulang.",
      );
    }

    /*
     * Jika email karyawan sudah
     * diperbaiki oleh Admin, retry
     * memakai email terbaru.
     */
    const recipient =
      leave.employee.email
        ?.trim() ||
      log.recipient;

    const approved =
      expectedStatus ===
      "APPROVED";

    const statusLabel =
      approved
        ? "Disetujui"
        : "Ditolak";

    const finalDocument =
      approved &&
      leave.type ===
        "ANNUAL_LEAVE"
        ? await getApprovedLeaveEmailAttachment(
            leave.id,
          )
        : null;

    /*
     * Jika email karyawan berubah,
     * update recipient pada log.
     */
    if (
      recipient !==
      log.recipient
    ) {
      await prisma.notificationLog.update({
        where: {
          id:
            log.id,
        },

        data: {
          recipient,
        },
      });
    }

    const sent =
      await retryTrackedMailBestEffort(
        log.id,
        {
          to:
            recipient,

          subject:
            log.subject ??
            `[Absensi] Pengajuan ${typeLabel} ${statusLabel}`,

          text: [
            `Halo ${leave.employee.name},`,
            "",
            `Pengajuan ${typeLabel} Anda telah ${statusLabel.toLowerCase()}.`,
            "",
            `Tanggal: ${start} - ${end}`,
            `Alasan: ${leave.reason}`,
            `Status: ${statusLabel}`,

            ...(finalDocument
              ? [
                  "",
                  "Dokumen final Cuti terlampir pada email ini.",
                ]
              : []),

            "",
            "Email ini dikirim otomatis oleh Sistem Absensi.",
          ].join(
            "\n",
          ),

          html: `
            <div style="font-family:Arial,sans-serif;line-height:1.6">
              <h2>
                Pengajuan ${escapeHtml(typeLabel)}
                ${escapeHtml(statusLabel)}
              </h2>

              <p>
                Halo
                <strong>${escapeHtml(leave.employee.name)}</strong>,
              </p>

              <p>
                Pengajuan Anda telah
                <strong>${escapeHtml(statusLabel.toLowerCase())}</strong>.
              </p>

              <p>
                ${start} - ${end}
              </p>

              ${
                finalDocument
                  ? `
                    <p>
                      Dokumen final Cuti yang telah disetujui
                      terlampir pada email ini.
                    </p>
                  `
                  : ""
              }
            </div>
          `,

          attachments:
            finalDocument
              ? [
                  finalDocument,
                ]
              : undefined,
        },
      );

    return {
      ok:
        sent,

      status:
        sent
          ? 200
          : 502,

      message:
        sent
          ? "Email berhasil dikirim ulang."
          : "Email masih gagal dikirim.",
    };
  } catch (error) {
    const message =
      getErrorMessage(
        error,
      );

    /*
     * Claim PENDING harus
     * dikembalikan menjadi FAILED.
     */
    await prisma.notificationLog
      .update({
        where: {
          id:
            log.id,
        },

        data: {
          status:
            "FAILED",

          attempts: {
            increment: 1,
          },

          lastAttemptAt:
            new Date(),

          lastError:
            message,
        },
      })
      .catch(
        (updateError) =>
          console.error(
            updateError,
          ),
      );

    return {
      ok: false,

      status: 409,

      message,
    };
  }
}