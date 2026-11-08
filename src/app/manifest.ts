import type { MetadataRoute } from "next";
import { az } from "@/i18n/dictionaries/az";

// One manifest for all languages. The home-screen name is Azerbaijani, the
// school's default language; inside the app each student sees their own language.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: az.meta.appName,
    short_name: "Gündəlik",
    description: az.meta.description,
    lang: "az",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#16794c",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
