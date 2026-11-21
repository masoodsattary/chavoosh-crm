import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chavoosh CRM | مدیریت ارتباط مشتریان",
  description: "سامانه داخلی مدیریت مشتریان، تعاملات و فرصت‌های فروش",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/chavoosh-crm-icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    shortcut: "/favicon-32.png",
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Chavoosh CRM",
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
