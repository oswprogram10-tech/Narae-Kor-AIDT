import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite(WASM)와 postgres 드라이버는 번들하지 않고 Node에서 직접 불러온다.
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  outputFileTracingIncludes: {
    "/**": ["./drizzle/**/*"],
  },
  // 내장 AI가 여러 CPU 코어(WASM 스레드)를 쓰려면 페이지가 '교차 출처 격리' 상태여야 한다.
  // 모든 자원을 같은 출처에서 주므로 영향이 없다. 호스트 프로그램도 내장 AI 화면에 같은 헤더를 보내야 한다.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
    ];
  },
};

export default nextConfig;
