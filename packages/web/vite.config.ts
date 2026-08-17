import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// 开发时把 /api 与 /ws 代理到本地 keel 服务（keel serve --port 3131）
const KEEL_API = process.env.KEEL_API ?? "http://127.0.0.1:3131";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      "/api": { target: KEEL_API, changeOrigin: true },
      "/ws": { target: KEEL_API.replace(/^http/, "ws"), ws: true },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
