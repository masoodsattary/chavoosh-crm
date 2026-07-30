import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "چاووش CRM | مدیریت ارتباط مشتریان",
  description: "سامانه داخلی مدیریت مشتریان، تعاملات و فرصت‌های فروش",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "چاووش CRM",
    statusBarStyle: "default",
  },
};

export const viewport = {
  themeColor: "#283980",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fa" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
