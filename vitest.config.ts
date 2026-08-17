import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const packagesDir = fileURLToPath(new URL("./packages/", import.meta.url));

export default defineConfig({
  resolve: {
    // 测试直接跑各包源码，不依赖 dist（改了源码不用先 build）
    alias: [{ find: /^@keel-code\/([^/]+)$/, replacement: `${packagesDir}$1/src/index.ts` }],
  },
  test: {
    projects: ["packages/*"],
    passWithNoTests: true,
    testTimeout: 30_000,
  },
});
