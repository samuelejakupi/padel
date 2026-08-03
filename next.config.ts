import { readFileSync } from "node:fs";
import type { NextConfig } from "next";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

// Legge la versione appena scritta da scripts/write-version.mjs (girato da
// "prebuild"), così il valore compilato nel client e quello servito in
// version.json coincidono sempre.
function readBuildId() {
  try {
    return JSON.parse(readFileSync("public/version.json", "utf8")).version as string;
  } catch {
    return "dev";
  }
}

const buildId = readBuildId();

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  output: "export",
  trailingSlash: true,
  basePath,
  env: {
    NEXT_PUBLIC_BUILD_ID: buildId,
  },
  generateBuildId: async () => buildId,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
