import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// In sviluppo /api/** va alla funzione "api" dell'emulatore (in produzione ci pensa Hosting).
const FUNCTIONS_EMULATOR = "http://127.0.0.1:5001";
const DEMO_PROJECT = "demo-fiscal-natale";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { target: "es2020", chunkSizeWarningLimit: 900 },
  server: {
    proxy: {
      "/api": {
        target: FUNCTIONS_EMULATOR,
        changeOrigin: true,
        rewrite: (p) => `/${DEMO_PROJECT}/europe-west1/api${p}`,
      },
    },
  },
});
