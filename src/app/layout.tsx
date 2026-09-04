import type { Metadata } from "next";

import "./globals.css";

import { ToastProvider } from "@/components/ui/ToastProvider";

export const metadata: Metadata = {
  title: "Absensi Internal",

  description: "Sistem absensi internal",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
