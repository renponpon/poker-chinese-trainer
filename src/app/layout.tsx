import type { Metadata, Viewport } from "next";
import AuthSessionKeeper from "@/components/AuthSessionKeeper";
import "./globals.css";

export const metadata: Metadata = {
  title: "Phrabit",
  description:
    "使うほど現地で話せるフレーズが増える翻訳・復習ドリル",
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
