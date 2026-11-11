import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { createHash } from "node:crypto";

// Cache only an explicit list of public files. API responses never enter this cache.
function offlinePublicAssets(): Plugin {
  return {
    name: "wordle-public-offline",
    apply: "build",
    generateBundle(_options, bundle) {
      const files = [
        "/",
        ...Object.keys(bundle)
          .filter((name) => !name.endsWith(".map"))
          .map((name) => `/${name}`),
        "/manifest.json",
        "/icons/icon-192.svg",
        "/words_en_possible.txt",
        "/words_tr_possible.txt",
        "/themes/marvel.json",
        "/themes/football.json",
      ];
      const version = createHash("sha256")
        .update(JSON.stringify(bundle))
        .digest("hex")
        .slice(0, 16);
      const source = `const CACHE="wordle-static-${version}";
const FILES=${JSON.stringify(files)};
self.addEventListener("install",event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting()));});
self.addEventListener("activate",event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE&&(key.startsWith("wordle-static-")||key.startsWith("workbox-precache-")||key==="api-cache")).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener("fetch",event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=="GET"||url.origin!==self.location.origin||url.pathname.startsWith("/api/"))return;
 if(event.request.mode==="navigate"){
  event.respondWith(fetch(event.request).catch(()=>caches.match("/").then(response=>response||Response.error())));return;
 }
 if(!FILES.includes(url.pathname))return;
 event.respondWith(caches.match(event.request).then(response=>response||fetch(event.request)));
});`;
      this.emitFile({ type: "asset", fileName: "sw.js", source });
    },
  };
}
export default defineConfig({
  plugins: [react(), offlinePublicAssets()],
  server: {
    port: 3000,
    proxy: { "/api": { target: "http://localhost:8091", changeOrigin: true } },
  },
  build: { outDir: "dist", sourcemap: false, minify: "esbuild" },
});
