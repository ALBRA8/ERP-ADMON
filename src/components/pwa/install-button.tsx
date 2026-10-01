"use client";

// ============================================================
// Marsella ERP — Botón "Instalar app" (PWA)
// ------------------------------------------------------------
// Escucha beforeinstallprompt y muestra un botón flotante.
// Si ya está instalada o no soportada, no muestra nada.
// ============================================================

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function getStandaloneState(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function InstallButton() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null
  );
  // Lazy initializer: chequea si ya está instalada solo en cliente.
  // En SSR retorna false (no renderiza el botón).
  const [installed, setInstalled] = useState<boolean>(getStandaloneState);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Re-chequea standalone (por si cambió tras hidratación)
    const standalone = getStandaloneState();
    if (standalone) {
      // Already installed — no listeners needed
      return;
    }

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed || !deferred) return null;

  const onClick = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome === "accepted") {
      setInstalled(true);
    }
    setDeferred(null);
  };

  return (
    <Button
      onClick={onClick}
      size="sm"
      variant="outline"
      className="gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
      title="Instala Marsella POS como aplicación"
    >
      <Download className="size-4" />
      <span className="hidden sm:inline">Instalar POS</span>
    </Button>
  );
}
