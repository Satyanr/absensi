"use client";

import {
  useState,
} from "react";

type Props = {
  configured: boolean;

  recipientEmail:
    string | null;

  host:
    string | null;

  port:
    number | null;

  secure:
    boolean | null;

  fromEmail:
    string | null;
};

export default function EmailNotificationTest({
  configured,
  recipientEmail,
  host,
  port,
  secure,
  fromEmail,
}: Props) {
  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  const [success, setSuccess] =
    useState("");

  async function sendTest() {
    if (
      loading ||
      !configured ||
      !recipientEmail
    ) {
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const response =
        await fetch(
          "/api/admin/notifications/test-email",
          {
            method: "POST",
          },
        );

      const data =
        await response.json();

      if (!response.ok) {
        setError(
          data.error ??
            "Email test gagal dikirim.",
        );

        return;
      }

      setSuccess(
        data.message ??
          "Email test berhasil dikirim.",
      );
    } catch {
      setError(
        "Terjadi masalah jaringan.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold">
            Notifikasi Email
          </h2>

          <p className="mt-1 text-sm text-neutral-500">
            Status konfigurasi SMTP
            untuk notifikasi pengajuan.
          </p>
        </div>

        {configured ? (
          <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
            Siap
          </span>
        ) : (
          <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
            Belum Siap
          </span>
        )}
      </div>

      <div className="mt-4 space-y-2 text-sm">
        <InfoRow
          label="SMTP"
          value={
            configured
              ? `${host}:${port}`
              : "Belum dikonfigurasi"
          }
        />

        <InfoRow
          label="Keamanan"
          value={
            secure === null
              ? "—"
              : secure
                ? "TLS / SSL"
                : "STARTTLS"
          }
        />

        <InfoRow
          label="Pengirim"
          value={
            fromEmail ?? "—"
          }
        />

        <InfoRow
          label="Email Test"
          value={
            recipientEmail ??
            "Email Admin belum diatur"
          }
        />
      </div>

      {error && (
        <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="mt-4 rounded-xl bg-green-50 p-3 text-sm text-green-700">
          {success}
        </div>
      )}

      <button
        type="button"
        onClick={sendTest}
        disabled={
          loading ||
          !configured ||
          !recipientEmail
        }
        className="mt-5 w-full rounded-xl bg-blue-600 py-3 font-semibold text-white disabled:bg-neutral-300 disabled:text-neutral-500"
      >
        {loading
          ? "Mengirim..."
          : "Kirim Email Test"}
      </button>

      {!configured && (
        <p className="mt-3 text-xs text-neutral-500">
          Lengkapi SMTP_HOST,
          SMTP_PORT, SMTP_USER,
          SMTP_PASSWORD, dan
          MAIL_FROM_EMAIL pada file
          .env server.
        </p>
      )}
    </section>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;

  value: string;
}) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-neutral-500">
        {label}
      </span>

      <span className="text-right font-medium">
        {value}
      </span>
    </div>
  );
}