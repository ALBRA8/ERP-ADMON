"use client";

// ============================================================
// Marsella ERP — Registro del Service Worker
// ============================================================

import { useEffect } from "react";

export function RegisterSW() {
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      window.location.protocol.startsWith("http")
    ) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((reg) => {
          if (process.env.NODE_ENV !== "production") {
            console.info("[PWA] Service worker registrado:", reg.scope);
          }
        })
        .catch((err) => {
          console.warn("[PWA] No se pudo registrar el service worker:", err);
        });
    }
  }, []);

  return null;
}
