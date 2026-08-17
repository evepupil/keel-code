import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const packagesDir = fileURLToPath(new URL("./packages/", import.meta.url));
const packageNames = readdirSync(packagesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

export default defineConfig({
  resolve: {
    // 测试直接跑各包源码，不依赖 dist（改了源码不用先 build）
    alias: [{ find: /^@keel-code\/([^/]+)$/, replacement: `${packagesDir}$1/src/index.ts` }],
  },
  test: {
    // 每个包一个项目，extends: true 继承上面的 alias
    projects: packageNames.map((name) => ({
      extends: true,
      test: {
        name: name === "cli" ? "keel-code" : `@keel-code/${name}`,
        root: `${packagesDir}${name}`,
      },
    })),
    passWithNoTests: true,
    testTimeout: 30_000,
  },
});
