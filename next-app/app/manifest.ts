import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DOODLY — Fresh A2 Buffalo Milk",
    short_name: "DOODLY",
    description: "Pure A2 buffalo milk in returnable glass bottles, delivered to your door by 7 AM.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#FBFCFA",
    theme_color: "#1FAE66",
    categories: ["food", "shopping", "lifestyle"],
    lang: "en-IN",
    icons: [
      { src: "/icon", sizes: "32x32", type: "image/png", purpose: "any" },
      { src: "/icon-192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png", purpose: "any" },
    ],
  };
}
