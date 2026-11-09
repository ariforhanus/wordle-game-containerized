import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { router } from "./router";
import { ToastProvider } from "./components/Toast";
import "./i18n"; // initialize i18next

// Purge sensitive responses retained by earlier service-worker versions.
if ("caches" in window) void caches.delete("api-cache");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ToastProvider>
      <RouterProvider router={router} />
    </ToastProvider>
  </StrictMode>
);
