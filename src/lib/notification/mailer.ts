import nodemailer, { type Transporter } from "nodemailer";

type SendMailInput = {
  to: string | string[];

  subject: string;

  text: string;

  html?: string;
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

export async function sendMailBestEffort(input: SendMailInput) {
  try {
    const config = getSmtpConfig();

    const mailer = getTransporter();

    if (!config || !mailer) {
      return false;
    }

    await mailer.sendMail({
      from: {
        name: config.fromName,

        address: config.fromEmail,
      },

      to: input.to,

      subject: input.subject,

      text: input.text,

      html: input.html,
    });

    return true;
  } catch (error) {
    /*
     * EMAIL TIDAK BOLEH
     * MEMBATALKAN TRANSAKSI CUTI.
     */
    console.error("Gagal mengirim email:", error);

    return false;
  }
}
