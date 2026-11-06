import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // 모듈 핵심부는 어떤 호스트(웹·안드로이드 WebView·윈도우)에도 병합할 수 있어야 하므로
    // Next.js, 서버 전용 코드, Node 내장 모듈, DB, 레퍼런스 호스트 코드에 의존하지 않는다.
    files: ["src/core/**/*.ts", "src/core/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["next", "next/*", "server-only", "react-dom/server"], message: "src/core는 Next.js·서버 전용 코드에 의존할 수 없어요." },
            { group: ["node:*", "fs", "path", "crypto", "os"], message: "src/core는 Node 내장 모듈을 쓸 수 없어요(브라우저에서도 돌아야 함)." },
            { group: ["drizzle-orm", "drizzle-orm/*", "postgres", "@electric-sql/*"], message: "저장소는 호스트 어댑터로만 접근해요." },
            { group: ["@/lib/*", "@/app/*", "@/components/*"], message: "src/core는 레퍼런스 호스트 코드를 불러올 수 없어요." },
          ],
        },
      ],
    },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
];

export default eslintConfig;
