import type { Metadata, Viewport } from "next";
import AuthSessionKeeper from "@/components/AuthSessionKeeper";
import "./globals.css";

export const metadata: Metadata = {
  title: "Phrabit",
  applicationName: "Phrabit",
  description:
    "使うほど現地で話せるフレーズが増える翻訳・復習ドリル",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    title: "Phrabit",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#151c2d",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body className="antialiased">
        <AuthSessionKeeper />
        {children}
      </body>
    </html>
  );
}
