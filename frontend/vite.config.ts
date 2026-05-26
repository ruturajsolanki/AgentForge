import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import path from "path";

const frontendPort = Number(process.env.FORGEOS_FRONTEND_PORT || "5173");
const apiPort = process.env.FORGEOS_API_PORT || "8000";
const apiTarget = process.env.FORGEOS_API_TARGET || `http://localhost:${apiPort}`;
const wsTarget = process.env.FORGEOS_WS_TARGET || `ws://localhost:${apiPort}`;

export default defineConfig({
  plugins: [react(), tailwind()],
  build: {
    outDir: path.resolve(__dirname, "../backend/static"),
    emptyOutDir: true,
  },
  server: {
    port: frontendPort,
    proxy: {
      "/api": apiTarget,
      "/ws": { target: wsTarget, ws: true },
    },
  },
});
