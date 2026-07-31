import type { NextConfig } from "next";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  output: "export",
  trailingSlash: true,
  basePath,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
