import type { Metadata, Viewport } from "next";
import AnalyticsTracker from "@/components/AnalyticsTracker";
import AuthSessionKeeper from "@/components/AuthSessionKeeper";
import "./globals.css";

const description =
  "言えなかった一言を、次に話せる形へ。日本語を中国語・ピンイン・使い方に変えて、保存とドリルで反復できるWebアプリ。";

export const metadata: Metadata = {
  metadataBase: new URL("https://phrabit.com"),
  title: "Phrabit",
  applicationName: "Phrabit",
  description,
  manifest: "/manifest.webmanifest",
  openGraph: {
    title: "Phrabit",
    description,
    url: "/",
    siteName: "Phrabit",
    images: [
      {
        url: "/launch/phrabit-og-release.png",
        width: 1200,
        height: 630,
        alt: "Phrabit - 言えなかった一言を、次に話せる形へ。",
      },
    ],
    locale: "ja_JP",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Phrabit",
    description,
    images: ["/launch/phrabit-og-release.png"],
  },
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
        <AnalyticsTracker />
        <AuthSessionKeeper />
        {children}
      </body>
    </html>
  );
}
