import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Phrabit",
    short_name: "Phrabit",
    description:
      "使うほど現地で話せるフレーズが増える翻訳・復習ドリル",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#151c2d",
    theme_color: "#151c2d",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/maskable-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
