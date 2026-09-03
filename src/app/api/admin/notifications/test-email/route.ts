import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";

import {
  getSmtpStatus,
  sendTrackedMailBestEffort,
} from "@/lib/notification/mailer";

export async function POST() {
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

  /*
   * Diagnostic SMTP hanya ADMIN.
   */
  if (user.role !== "ADMIN") {
    return NextResponse.json(
      {
        error: "Hanya Admin yang dapat menguji email.",
      },
      {
        status: 403,
      },
    );
  }

  const email = user.email?.trim();

  if (!email) {
    return NextResponse.json(
      {
        error: "Akun Admin yang sedang digunakan belum memiliki email.",
      },
      {
        status: 409,
      },
    );
  }

  const smtp = getSmtpStatus();

  if (!smtp.configured) {
    return NextResponse.json(
      {
        error: "SMTP belum dikonfigurasi dengan lengkap.",
      },
      {
        status: 503,
      },
    );
  }

  const sent = await sendTrackedMailBestEffort({
    to: email,

    subject: "[Absensi] Test Notifikasi Email",

    text: [
      "Email test Sistem Absensi berhasil dikirim.",
      "",
      `Penerima: ${email}`,
      `Waktu: ${new Date().toISOString()}`,
      "",
      "Jika Anda menerima email ini, konfigurasi SMTP sudah berfungsi.",
    ].join("\n"),

    html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#222">
          <h2>Test Notifikasi Email</h2>

          <p>
            Email test Sistem Absensi berhasil dikirim.
          </p>

          <p>
            Jika Anda menerima email ini,
            konfigurasi SMTP sudah berfungsi.
          </p>

          <table style="border-collapse:collapse">
            <tr>
              <td style="padding:4px 12px 4px 0">
                <strong>Penerima</strong>
              </td>

              <td>${email}</td>
            </tr>

            <tr>
              <td style="padding:4px 12px 4px 0">
                <strong>Waktu</strong>
              </td>

              <td>${new Date().toISOString()}</td>
            </tr>
          </table>

          <p style="margin-top:20px;color:#666;font-size:12px">
            Email ini dikirim otomatis oleh Sistem Absensi.
          </p>
        </div>
      `,

    notificationType: "TEST_EMAIL",

    entityType: "User",

    entityId: user.id,

    metadata: {
      source: "ADMIN_SMTP_TEST",
    },
  });

  if (!sent) {
    return NextResponse.json(
      {
        error:
          "SMTP terkonfigurasi tetapi email gagal dikirim. Periksa log server dan kredensial SMTP.",
      },
      {
        status: 502,
      },
    );
  }

  return NextResponse.json({
    ok: true,

    message: `Email test berhasil dikirim ke ${email}.`,
  });
}
