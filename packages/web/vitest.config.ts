import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "html", "lcov", "json-summary"],
      include: [
        "src/**/*.{ts,tsx}",
        "../engine/src/**/*.ts",
        "../api/src/**/*.ts",
      ],
      exclude: ["**/*.test.*", "**/*.d.ts"],
    },
  },
});
