import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Keys live in ../.env.local (outside this public repo). Only VITE_* values reach the browser bundle.
export default defineConfig({
  base: "./",
  envDir: "..",
  plugins: [react()],
  build: {
    target: "baseline-widely-available",
    sourcemap: true,
    outDir: "dist",
    emptyOutDir: true
  },
  test: {
    globals: true,
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"]
  }
});
