import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "چاووش CRM",
    short_name: "چاووش",
    description: "سامانه داخلی مدیریت ارتباط مشتریان و فروش",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f6fa",
    theme_color: "#283980",
    lang: "fa",
    dir: "rtl",
    icons: [{ src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
