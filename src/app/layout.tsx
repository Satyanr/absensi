import type { Metadata } from "next";

import "./globals.css";

import { ToastProvider } from "@/components/ui/ToastProvider";

export const metadata: Metadata = {
  title: "Absensi Visitiga Media",

  description: "Sistem absensi internal",
   icons: {
    icon: "/branding/icon.svg", // Sesuaikan dengan ekstensi file Anda (.png, .svg, dll)
  },
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
