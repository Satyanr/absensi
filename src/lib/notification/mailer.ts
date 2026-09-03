import nodemailer, { type Transporter } from "nodemailer";
import {
  prisma,
} from "@/lib/prisma";

type SendMailInput = {
  to: string | string[];

  subject: string;

  text: string;

  html?: string;
};

type NotificationType =
  | "LEAVE_SUBMITTED"
  | "LEAVE_APPROVED"
  | "LEAVE_REJECTED"
  | "TEST_EMAIL";

type SendTrackedMailInput =
  SendMailInput & {
    notificationType:
      NotificationType;

    entityType?: string;

    entityId?: string;

    metadata?: Record<
      string,
      string |
        number |
        boolean |
        null
    >;
  };

let transporter: Transporter | null = null;

let warnedMissingConfig = false;

function getSmtpConfig() {
  const host = process.env.SMTP_HOST?.trim();

  const rawPort = process.env.SMTP_PORT?.trim() ?? "465";

  const port = Number(rawPort);

  const user = process.env.SMTP_USER?.trim();

  const password = process.env.SMTP_PASSWORD?.trim();

  const fromEmail = process.env.MAIL_FROM_EMAIL?.trim() || user;

  if (
    !host ||
    !Number.isInteger(port) ||
    port <= 0 ||
    port > 65535 ||
    !user ||
    !password ||
    !fromEmail
  ) {
    if (!warnedMissingConfig) {
      console.warn("SMTP belum dikonfigurasi. Notifikasi email dinonaktifkan.");

      warnedMissingConfig = true;
    }

    return null;
  }

  const secureValue = process.env.SMTP_SECURE?.trim().toLowerCase();

  const secure =
    secureValue === undefined ? port === 465 : secureValue === "true";

  const fromName = process.env.MAIL_FROM_NAME?.trim() || "Sistem Absensi";

  return {
    host,
    port,
    secure,
    user,
    password,
    fromEmail,
    fromName,
  };
}

export function getSmtpStatus() {
  const config = getSmtpConfig();

  if (!config) {
    return {
      configured: false,
      host: null,
      port: null,
      secure: null,
      fromEmail: null,
    };
  }

  return {
    configured: true,
    host: config.host,
    port: config.port,
    secure: config.secure,
    fromEmail: config.fromEmail,
  };
}

function getTransporter() {
  if (transporter) {
    return transporter;
  }

  const config = getSmtpConfig();

  if (!config) {
    return null;
  }

  transporter = nodemailer.createTransport({
    pool: true,

    maxConnections: 3,

    host: config.host,

    port: config.port,

    secure: config.secure,

    auth: {
      user: config.user,

      pass: config.password,
    },

    /*
     * Jangan biarkan request
     * absensi menggantung lama
     * kalau SMTP sedang bermasalah.
     */
    connectionTimeout: 8000,

    greetingTimeout: 8000,

    socketTimeout: 10000,
  });

  return transporter;
}

function getErrorMessage(
  error: unknown,
) {
  if (error instanceof Error) {
    return error.message.slice(
      0,
      2000,
    );
  }

  return "Kesalahan SMTP tidak diketahui.";
}

async function sendMailInternal(
  input: SendMailInput,
): Promise<
  | {
      ok: true;
    }
  | {
      ok: false;

      error: string;
    }
> {
  const config =
    getSmtpConfig();

  const mailer =
    getTransporter();

  if (
    !config ||
    !mailer
  ) {
    return {
      ok: false,

      error:
        "SMTP belum dikonfigurasi.",
    };
  }

  try {
    await mailer.sendMail({
      from: {
        name:
          config.fromName,

        address:
          config.fromEmail,
      },

      to:
        input.to,

      subject:
        input.subject,

      text:
        input.text,

      html:
        input.html,
    });

    return {
      ok: true,
    };
  } catch (error) {
    return {
      ok: false,

      error:
        getErrorMessage(
          error,
        ),
    };
  }
}

export async function sendMailBestEffort(
  input: SendMailInput,
) {
  const result =
    await sendMailInternal(
      input,
    );

  if (!result.ok) {
    console.error(
      "Gagal mengirim email:",
      result.error,
    );
  }

  return result.ok;
}

export async function sendTrackedMailBestEffort(
  input: SendTrackedMailInput,
) {
  /*
   * Logging tidak boleh membuat
   * email utama gagal dikirim.
   */
  let logId:
    string | null = null;

  try {
    const log =
      await prisma.notificationLog.create({
        data: {
          channel:
            "EMAIL",

          type:
            input.notificationType,

          status:
            "PENDING",

          recipient:
            Array.isArray(
              input.to,
            )
              ? input.to.join(
                  ", ",
                )
              : input.to,

          subject:
            input.subject,

          entityType:
            input.entityType ??
            null,

          entityId:
            input.entityId ??
            null,

          metadata:
            input.metadata,
        },

        select: {
          id: true,
        },
      });

    logId =
      log.id;
  } catch (error) {
    console.error(
      "Gagal membuat NotificationLog:",
      error,
    );
  }

  const attemptedAt =
    new Date();

  const result =
    await sendMailInternal(
      input,
    );

  if (!result.ok) {
    console.error(
      "Gagal mengirim email:",
      result.error,
    );
  }

  if (logId) {
    try {
      await prisma.notificationLog.update({
        where: {
          id:
            logId,
        },

        data: {
          attempts: {
            increment: 1,
          },

          lastAttemptAt:
            attemptedAt,

          status:
            result.ok
              ? "SENT"
              : "FAILED",

          sentAt:
            result.ok
              ? attemptedAt
              : null,

          lastError:
            result.ok
              ? null
              : result.error,
        },
      });
    } catch (error) {
      /*
       * Email mungkin sudah terkirim,
       * jadi kegagalan update log
       * tidak boleh dilempar.
       */
      console.error(
        "Gagal memperbarui NotificationLog:",
        error,
      );
    }
  }

  return result.ok;
}
