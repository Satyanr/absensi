import { prisma } from "@/lib/prisma";

import { sendTrackedMailBestEffort } from "@/lib/notification/mailer";

type LeaveType = "PERMISSION" | "SICK" | "ANNUAL_LEAVE";

function leaveTypeLabel(type: LeaveType) {
  switch (type) {
    case "PERMISSION":
      return "Izin";

    case "SICK":
      return "Sakit";

    case "ANNUAL_LEAVE":
      return "Cuti";
  }
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "UTC",

    day: "2-digit",

    month: "long",

    year: "numeric",
  }).format(value);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getAdminLeaveUrl() {
  const baseUrl = process.env.APP_URL?.trim().replace(/\/+$/, "");

  if (!baseUrl) {
    return null;
  }

  return `${baseUrl}/admin/leaves`;
}

type NewLeaveInput = {
  leaveRequestId: string;

  employeeCode: string;

  employeeName: string;

  type: LeaveType;

  startDate: Date;

  endDate: Date;

  reason: string;
};

export async function notifyNewLeaveRequest(input: NewLeaveInput) {
  /*
   * Seluruh fungsi dijaga agar
   * tidak pernah melempar error
   * ke workflow pengajuan.
   */
  try {
    const users = await prisma.user.findMany({
      where: {
        active: true,

        role: {
          in: ["ADMIN", "LEADER"],
        },

        email: {
          not: null,
        },
      },

      select: {
        email: true,
      },
    });

    const recipients = users
      .map((user) => user.email?.trim())
      .filter((email): email is string => Boolean(email));

    if (recipients.length === 0) {
      console.warn(
        "Tidak ada Admin/Leader aktif dengan email untuk menerima notifikasi pengajuan.",
      );

      return;
    }

    const leaveLabel = leaveTypeLabel(input.type);

    const start = formatDate(input.startDate);

    const end = formatDate(input.endDate);

    const adminUrl = getAdminLeaveUrl();

    const subject = `[Absensi] Pengajuan ${leaveLabel} Baru - ${input.employeeName}`;

    const text = [
      `Ada pengajuan ${leaveLabel} baru yang menunggu persetujuan.`,
      "",
      `Karyawan: ${input.employeeName}`,
      `Kode: ${input.employeeCode}`,
      `Jenis: ${leaveLabel}`,
      `Tanggal: ${start} - ${end}`,
      `Alasan: ${input.reason}`,
      `Status: Menunggu Persetujuan`,
      "",
      ...(adminUrl ? [`Buka daftar pengajuan: ${adminUrl}`] : []),
      "",
      `ID Pengajuan: ${input.leaveRequestId}`,
    ].join("\n");

    const safeName = escapeHtml(input.employeeName);

    const safeCode = escapeHtml(input.employeeCode);

    const safeReason = escapeHtml(input.reason);

    const safeLeaveLabel = escapeHtml(leaveLabel);

    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#222">
        <h2>Pengajuan ${safeLeaveLabel} Baru</h2>

        <p>
          Ada pengajuan yang menunggu persetujuan.
        </p>

        <table style="border-collapse:collapse">
          <tr>
            <td style="padding:4px 12px 4px 0"><strong>Karyawan</strong></td>
            <td>${safeName}</td>
          </tr>

          <tr>
            <td style="padding:4px 12px 4px 0"><strong>Kode</strong></td>
            <td>${safeCode}</td>
          </tr>

          <tr>
            <td style="padding:4px 12px 4px 0"><strong>Jenis</strong></td>
            <td>${safeLeaveLabel}</td>
          </tr>

          <tr>
            <td style="padding:4px 12px 4px 0"><strong>Tanggal</strong></td>
            <td>${start} - ${end}</td>
          </tr>

          <tr>
            <td style="padding:4px 12px 4px 0"><strong>Alasan</strong></td>
            <td>${safeReason}</td>
          </tr>

          <tr>
            <td style="padding:4px 12px 4px 0"><strong>Status</strong></td>
            <td>Menunggu Persetujuan</td>
          </tr>
        </table>

        ${
          adminUrl
            ? `
              <p style="margin-top:20px">
                <a
                  href="${escapeHtml(adminUrl)}"
                  style="display:inline-block;background:#2563eb;color:white;text-decoration:none;padding:10px 16px;border-radius:8px"
                >
                  Buka Pengajuan
                </a>
              </p>
            `
            : ""
        }
      </div>
    `;

    /*
     * Kirim satu per satu supaya alamat
     * Admin/Leader tidak saling terlihat.
     */
    await Promise.all(
      recipients.map((email) =>
        sendTrackedMailBestEffort({
          to: email,

          subject,

          text,

          html,

          notificationType: "LEAVE_SUBMITTED",

          entityType: "LeaveRequest",

          entityId: input.leaveRequestId,

          metadata: {
            employeeCode: input.employeeCode,

            leaveType: input.type,
          },
        }),
      ),
    );
  } catch (error) {
    console.error("Notifikasi pengajuan baru gagal:", error);
  }
}

type DecisionInput = {
  employeeEmail: string | null;

  employeeCode: string;

  employeeName: string;

  type: LeaveType;

  startDate: Date;

  endDate: Date;

  reason: string;

  status: "APPROVED" | "REJECTED";

  reviewerName: string;

  leaveRequestId:
  string;
};

export async function notifyLeaveDecision(input: DecisionInput) {
  try {
    const email = input.employeeEmail?.trim();

    if (!email) {
      console.warn(
        `Karyawan ${input.employeeCode} tidak memiliki email. Notifikasi hasil pengajuan dilewati.`,
      );

      return;
    }

    const leaveLabel = leaveTypeLabel(input.type);

    const approved = input.status === "APPROVED";

    const statusLabel = approved ? "Disetujui" : "Ditolak";

    const start = formatDate(input.startDate);

    const end = formatDate(input.endDate);

    const subject = `[Absensi] Pengajuan ${leaveLabel} ${statusLabel}`;

    const text = [
      `Halo ${input.employeeName},`,
      "",
      `Pengajuan ${leaveLabel} Anda telah ${statusLabel.toLowerCase()}.`,
      "",
      `Tanggal: ${start} - ${end}`,
      `Alasan: ${input.reason}`,
      `Status: ${statusLabel}`,
      `Diproses oleh: ${input.reviewerName}`,
      "",
      "Email ini dikirim otomatis oleh Sistem Absensi.",
    ].join("\n");

    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#222">
        <h2>
          Pengajuan ${escapeHtml(leaveLabel)}
          ${escapeHtml(statusLabel)}
        </h2>

        <p>
          Halo <strong>${escapeHtml(input.employeeName)}</strong>,
        </p>

        <p>
          Pengajuan ${escapeHtml(leaveLabel)} Anda telah
          <strong>${escapeHtml(statusLabel.toLowerCase())}</strong>.
        </p>

        <table style="border-collapse:collapse">
          <tr>
            <td style="padding:4px 12px 4px 0"><strong>Tanggal</strong></td>
            <td>${start} - ${end}</td>
          </tr>

          <tr>
            <td style="padding:4px 12px 4px 0"><strong>Alasan</strong></td>
            <td>${escapeHtml(input.reason)}</td>
          </tr>

          <tr>
            <td style="padding:4px 12px 4px 0"><strong>Status</strong></td>
            <td>${escapeHtml(statusLabel)}</td>
          </tr>

          <tr>
            <td style="padding:4px 12px 4px 0"><strong>Diproses Oleh</strong></td>
            <td>${escapeHtml(input.reviewerName)}</td>
          </tr>
        </table>

        <p style="margin-top:20px;color:#666;font-size:12px">
          Email ini dikirim otomatis oleh Sistem Absensi.
        </p>
      </div>
    `;

    await sendTrackedMailBestEffort({
  to:
    email,

  subject,

  text,

  html,

  notificationType:
    input.status ===
    "APPROVED"
      ? "LEAVE_APPROVED"
      : "LEAVE_REJECTED",

  entityType:
    "LeaveRequest",

  entityId:
    input.leaveRequestId,

  metadata: {
    employeeCode:
      input.employeeCode,

    leaveType:
      input.type,

    leaveStatus:
      input.status,
  },
});
  } catch (error) {
    console.error("Notifikasi hasil pengajuan gagal:", error);
  }
}
