import type { MetadataRoute } from "next";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const { business } = await getSettings();
  return {
    name: business.name,
    short_name: business.name.split(" ")[0] ?? business.name,
    description: business.tagline,
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#faf8f3",
    theme_color: "#1d5531",
    categories: ["shopping", "food", "business"],
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png" },
      { src: "/pwa-icon/512?maskable=1", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Shop", url: "/shop" },
      { name: "Track order", url: "/track" },
      { name: "Admin", url: "/admin" },
    ],
  };
}
