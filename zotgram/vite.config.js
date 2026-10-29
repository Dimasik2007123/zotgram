import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    open: true,
    port: 3000,
    strictPort: true,
    proxy: {
      "/admin/chat": { target: "http://127.0.0.1:8001", changeOrigin: true },
      "/admin": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/static/chat": { target: "http://127.0.0.1:8001", changeOrigin: true },
      "/static/core": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/api/core": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/api/chat": { target: "http://127.0.0.1:8001", changeOrigin: true },
      "/ws": { target: "ws://127.0.0.1:8001", ws: true },
      "/media/core": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
});
