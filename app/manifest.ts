import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Chavoosh CRM",
    short_name: "Chavoosh CRM",
    description: "سامانه داخلی مدیریت ارتباط مشتریان و فروش",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f5f6fa",
    theme_color: "#283980",
    lang: "fa",
    dir: "rtl",
    icons: [
      { src: "/chavoosh-crm-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/chavoosh-crm-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/chavoosh-crm-icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
