import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    target: "baseline-widely-available",
    sourcemap: true,
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: "app.html",
      output: {
        entryFileNames: "assets/reps-app.js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: (asset) => asset.names.some((name) => name.endsWith(".css")) ? "assets/reps-app.css" : "assets/[name][extname]"
      }
    }
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"]
  }
});
