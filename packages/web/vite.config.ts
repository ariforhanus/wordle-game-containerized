import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "words_en_possible.txt",
        "words_tr_possible.txt",
        "themes/*.json",
      ],
      manifest: {
        name: "Wordle Game",
        short_name: "Wordle",
        description: "Daily word guessing game with multiple languages",
        start_url: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#f7f8fa",
        theme_color: "#22c1c3",
        icons: [
          {
            src: "/icons/icon-192.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
          {
            src: "/icons/icon-192.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        sourcemap: false,
        // Avoid terser by disabling SW minification
        mode: "development",
        // Include word lists and theme data in precache
        globPatterns: [
          "**/*.{js,css,html,svg,png,ico,json,txt}",
        ],
        // Runtime caching for API calls: try network first, fall back to cache
        runtimeCaching: [
          {
            urlPattern: /^https?:\/\/.*\/api\//,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60, // 1 hour
              },
              networkTimeoutSeconds: 5,
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 3000,
    proxy: {
      "/api": {
        target: "http://localhost:8091",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    minify: "esbuild",
  },
});
