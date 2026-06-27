import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    open: true, // автоматически открывать страницу в браузере
    port: 3000, // порт dev-сервера
  },
});
