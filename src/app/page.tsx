"use client";

// ============================================================
// ERP Marsella — SPA principal (single route /)
// Vista: dashboard | terceros | productos | inventario | facturas
//        | compras | cartera | contabilidad | parametros
// ============================================================

import { useEffect, useState } from "react";
import { Dashboard } from "@/components/dashboard/dashboard";
import { TercerosView } from "@/components/terceros/terceros-view";
import { ProductosView } from "@/components/productos/productos-view";
import { InventarioView } from "@/components/inventario/inventario-view";
import { FacturacionView } from "@/components/facturacion/facturacion-view";
import { ComprasView } from "@/components/compras/compras-view";
import { CarteraView } from "@/components/cartera/cartera-view";
import { ContabilidadView } from "@/components/contabilidad/contabilidad-view";
import { CreditosView } from "@/components/creditos/creditos-view";
import { PresupuestoView } from "@/components/presupuesto/presupuesto-view";
import { DianView } from "@/components/dian/dian-view";
import { RadianView } from "@/components/radian/radian-view";
import { NominaView } from "@/components/nomina/nomina-view";
import { ReportesView } from "@/components/reportes/reportes-view";
import { BancosView } from "@/components/bancos/bancos-view";
import { CajasView } from "@/components/cajas/cajas-view";
import { ParametrosView } from "@/components/parametros/parametros-view";
import { McpView } from "@/components/mcp/mcp-view";
import { RestauranteView } from "@/components/restaurante/restaurante-view";
import { HotelView } from "@/components/hotel/hotel-view";
import { CafeteroView } from "@/components/cafetero/cafetero-view";
import { ServiciosView } from "@/components/servicios-publicos/servicios-view";
import { TallerView } from "@/components/taller/taller-view";
import { VehiculosView } from "@/components/vehiculos/vehiculos-view";
import { NiifView } from "@/components/niif/niif-view";
import { MediosView } from "@/components/medios-magneticos/medios-view";
import { ImportacionesView } from "@/components/importaciones/importaciones-view";
import { ProduccionView } from "@/components/produccion/produccion-view";
import { AdminView } from "@/components/admin/admin-view";
import { LoginView } from "@/components/auth/login-view";
import { Sidebar, type NavKey } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";

type View =
  | "dashboard"
  | "terceros"
  | "productos"
  | "inventario"
  | "facturas"
  | "compras"
  | "cartera"
  | "contabilidad"
  | "creditos"
  | "presupuesto"
  | "dian"
  | "radian"
  | "nomina"
  | "reportes"
  | "bancos"
  | "cajas"
  | "niif"
  | "medios"
  | "parametros"
  | "admin"
  | "mcp"
  | "restaurante"
  | "hotel"
  | "cafetero"
  | "servicios"
  | "taller"
  | "vehiculos"
  | "importaciones"
  | "produccion";

export default function Home() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [usuario, setUsuario] = useState<any>(null);
  const [empresa, setEmpresa] = useState<any>(null);
  const [view, setView] = useState<View>("dashboard");

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const r = await fetch("/api/dashboard");
        const d = await r.json();
        if (!mounted) return;
        if (d.authenticated) {
          setAuthed(true);
          setUsuario(d.usuario);
          setEmpresa(d.empresa);
        } else {
          setAuthed(false);
        }
      } catch {
        if (mounted) setAuthed(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  if (authed === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-neutral-950">
        <div className="animate-pulse text-neutral-500">Cargando Marsella ERP...</div>
      </div>
    );
  }

  if (authed === false) {
    return (
      <>
        <LoginView onLogin={() => checkSession()} />
        <Toaster />
        <SonnerToaster />
      </>
    );
  }

  return (
    <div className="min-h-screen flex bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100">
      <Sidebar
        active={view as NavKey}
        onNavigate={(k) => setView(k as View)}
        empresa={empresa}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar usuario={usuario} empresa={empresa} onLogout={async () => {
          await fetch("/api/auth/logout", { method: "POST" });
          setAuthed(false);
        }} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {view === "dashboard" && <Dashboard />}
          {view === "terceros" && <TercerosView />}
          {view === "productos" && <ProductosView />}
          {view === "inventario" && <InventarioView />}
          {view === "facturas" && <FacturacionView />}
          {view === "compras" && <ComprasView />}
          {view === "cartera" && <CarteraView />}
          {view === "contabilidad" && <ContabilidadView />}
          {view === "creditos" && <CreditosView />}
          {view === "presupuesto" && <PresupuestoView />}
          {view === "dian" && <DianView />}
          {view === "radian" && <RadianView />}
          {view === "nomina" && <NominaView />}
          {view === "reportes" && <ReportesView />}
          {view === "bancos" && <BancosView />}
          {view === "cajas" && <CajasView />}
          {view === "niif" && <NiifView />}
          {view === "medios" && <MediosView />}
          {view === "parametros" && <ParametrosView empresa={empresa} usuario={usuario} onReload={checkSession} />}
          {view === "admin" && <AdminView />}
          {view === "mcp" && <McpView />}
          {view === "restaurante" && <RestauranteView />}
          {view === "hotel" && <HotelView />}
          {view === "cafetero" && <CafeteroView />}
          {view === "servicios" && <ServiciosView />}
          {view === "taller" && <TallerView />}
          {view === "vehiculos" && <VehiculosView />}
          {view === "importaciones" && <ImportacionesView />}
          {view === "produccion" && <ProduccionView />}
        </main>
      </div>
      <Toaster />
      <SonnerToaster />
    </div>
  );
}
