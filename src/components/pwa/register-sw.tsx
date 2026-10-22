"use client";

// ============================================================
// Marsella ERP — Registro del Service Worker
// ------------------------------------------------------------
// Componente invisible que registra /sw.js en el cliente
// También elimina el badge "N" de Next.js DevTools que estorba
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

    // Eliminar el badge "N" de Next.js DevTools que aparece sobre el sidebar
    const removeDevToolsBadge = () => {
      // Buscar el botón del devtools por varios selectores
      const selectors = [
        'button[aria-label*="Next.js"]',
        'button[aria-label*="Open Next.js"]',
        'button[aria-label*="Open issues"]',
        '[data-nextjs-dev-tools-button]',
        'nextjs-dev-tools-button',
        'nextjs-portal',
        'div[class*="nextjs-dev-tools"]',
        'div[class*="next-devtools"]',
        // El badge flotante con la N
        'button[style*="position: fixed"]',
      ];
      selectors.forEach((sel) => {
        document.querySelectorAll(sel).forEach((el) => {
          el.remove();
        });
      });
      // También buscar dentro de shadow DOMs
      document.querySelectorAll('*').forEach((el) => {
        if (el.shadowRoot) {
          el.shadowRoot.querySelectorAll('button, [class*="devtools"], [class*="badge"]').forEach((child) => {
            if (child.textContent?.includes('N') || child.getAttribute('aria-label')?.includes('Next.js')) {
              child.remove();
            }
          });
        }
      });
    };

    // Ejecutar inmediatamente y después de un delay (el badge se inyecta tarde)
    removeDevToolsBadge();
    const interval = setInterval(removeDevToolsBadge, 500);
    // Detener después de 10 segundos (el badge ya no debería aparecer)
    setTimeout(() => clearInterval(interval), 10000);

    // Observer para eliminar el badge cuando aparezca
    const observer = new MutationObserver(() => {
      removeDevToolsBadge();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    // Detener el observer después de 10 segundos
    setTimeout(() => observer.disconnect(), 10000);
  }, []);

  return null;
}
