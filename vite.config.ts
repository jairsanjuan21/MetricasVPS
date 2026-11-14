import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// El frontend vive en web/ y se compila a dist/web, que es lo que sirve el servidor en producción.
// En desarrollo, Vite corre en :5173 y reenvía /api al servidor de Node en :4000.
export default defineConfig({
  root: "web",
  plugins: [react()],
  // assetsInlineLimit 0: nada se incrusta como data: URI (la CSP solo permite fuentes del propio servidor)
  build: { outDir: "../dist/web", emptyOutDir: true, assetsInlineLimit: 0 },
  server: {
    port: 5173,
    proxy: { "/api": { target: "http://localhost:4000", changeOrigin: false } },
  },
});
