import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite(WASM)와 postgres 드라이버는 번들하지 않고 Node에서 직접 불러온다.
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  outputFileTracingIncludes: {
    "/**": ["./drizzle/**/*"],
  },
};

export default nextConfig;
