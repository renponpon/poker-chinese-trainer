import type { NextConfig } from "next";
import { assertPreviewEnvironment } from "./src/infrastructure/server/preview-environment";

assertPreviewEnvironment(process.env);

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.phrabit.com" }],
        destination: "https://phrabit.com/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
