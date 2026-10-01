"use client";

import { useState } from "react";
import { useTheme } from "next-themes";
import {
  Building2,
  LayoutDashboard,
  Users,
  Package,
  Warehouse,
  FileText,
  FileCheck2,
  ShoppingCart,
  Wallet,
  Calculator,
  HandCoins,
  PieChart,
  Settings,
  Plug,
  ChevronLeft,
  ChevronRight,
  Moon,
  Sun,
  UserCog,
  FileBarChart,
  Landmark,
  Store,
  UtensilsCrossed,
  BedDouble,
  BarChart3,
  FileSpreadsheet,
  Shield,
  Coffee,
  Zap,
  Wrench,
  Car,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useOfflinePos } from "@/hooks/use-offline-pos";

export type NavKey =
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
  | "vehiculos";

const NAV: { key: NavKey; label: string; icon: React.ElementType; group: string }[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, group: "Principal" },
  { key: "terceros", label: "Terceros", icon: Users, group: "Catálogos" },
  { key: "productos", label: "Productos", icon: Package, group: "Catálogos" },
  { key: "inventario", label: "Inventarios", icon: Warehouse, group: "Operación" },
  { key: "facturas", label: "Facturación", icon: FileText, group: "Operación" },
  { key: "dian", label: "Facturación DIAN", icon: FileCheck2, group: "Operación" },
  { key: "compras", label: "Compras", icon: ShoppingCart, group: "Operación" },
  { key: "cartera", label: "Cartera", icon: Wallet, group: "Financiero" },
  { key: "contabilidad", label: "Contabilidad", icon: Calculator, group: "Financiero" },
  { key: "creditos", label: "Créditos y Financiación", icon: HandCoins, group: "Financiero" },
  { key: "presupuesto", label: "Presupuesto", icon: PieChart, group: "Financiero" },
  { key: "nomina", label: "Nómina", icon: UserCog, group: "Financiero" },
  { key: "bancos", label: "Bancos y Conciliación", icon: Landmark, group: "Financiero" },
  { key: "cajas", label: "Cajas POS", icon: Store, group: "Financiero" },
  { key: "reportes", label: "Reportes PDF", icon: FileBarChart, group: "Financiero" },
  { key: "niif", label: "Estados NIIF", icon: BarChart3, group: "Financiero" },
  { key: "medios", label: "Medios Magnéticos", icon: FileSpreadsheet, group: "Financiero" },
  { key: "restaurante", label: "Restaurante", icon: UtensilsCrossed, group: "Verticales" },
  { key: "hotel", label: "Hotelería", icon: BedDouble, group: "Verticales" },
  { key: "cafetero", label: "Cafetero", icon: Coffee, group: "Verticales" },
  { key: "servicios", label: "Servicios Públicos", icon: Zap, group: "Verticales" },
  { key: "taller", label: "Taller", icon: Wrench, group: "Verticales" },
  { key: "vehiculos", label: "Vehículos y Mascotas", icon: Car, group: "Verticales" },
  { key: "parametros", label: "Parámetros", icon: Settings, group: "Sistema" },
  { key: "admin", label: "Administración", icon: Shield, group: "Sistema" },
  { key: "mcp", label: "MCP", icon: Plug, group: "Sistema" },
];

interface SidebarProps {
  active: NavKey;
  onNavigate: (k: NavKey) => void;
  empresa?: any;
}

export function Sidebar({ active, onNavigate, empresa }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const { theme, setTheme } = useTheme();
  const { pendingCount } = useOfflinePos();

  const grouped: Record<string, typeof NAV> = {};
  for (const n of NAV) {
    if (!grouped[n.group]) grouped[n.group] = [] as any;
    grouped[n.group].push(n);
  }

  return (
    <aside
      className={cn(
        "h-screen sticky top-0 flex flex-col border-r border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 transition-all",
        collapsed ? "w-16" : "w-64",
      )}
    >
      {/* Brand */}
      <div className="h-14 flex items-center gap-2 px-4 border-b border-neutral-200 dark:border-neutral-800">
        <div className="w-8 h-8 rounded-md bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold shrink-0">
          M
        </div>
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm truncate">Marsella ERP</div>
            <div className="text-xs text-neutral-500 truncate">
              {empresa?.razonSocial ?? "Cargando..."}
            </div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-2 space-y-3">
        {Object.entries(grouped).map(([group, items]) => (
          <div key={group}>
            {!collapsed && (
              <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-neutral-400">
                {group}
              </div>
            )}
            <div className="space-y-0.5">
              {items.map((item) => {
                const Icon = item.icon;
                const isActive = active === item.key;
                const showPendingBadge = item.key === "facturas" && pendingCount > 0;
                return (
                  <button
                    key={item.key}
                    onClick={() => onNavigate(item.key)}
                    title={item.label}
                    className={cn(
                      "w-full flex items-center gap-2 px-2 py-2 rounded-md text-sm transition-colors",
                      isActive
                        ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 font-medium"
                        : "text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800",
                      collapsed && "justify-center relative",
                    )}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    {!collapsed && <span className="truncate flex-1 text-left">{item.label}</span>}
                    {showPendingBadge && !collapsed && (
                      <Badge
                        variant="outline"
                        className="ml-auto border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300 text-[10px] px-1.5 py-0 h-5 min-w-[20px] justify-center"
                        title={`${pendingCount} factura(s) pendiente(s) de sincronización`}
                      >
                        {pendingCount}
                      </Badge>
                    )}
                    {showPendingBadge && collapsed && (
                      <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-500" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-neutral-200 dark:border-neutral-800 p-2 space-y-1">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          title="Cambiar tema"
        >
          {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          {!collapsed && <span className="ml-2">Tema</span>}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? "Expandir" : "Colapsar"}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          {!collapsed && <span className="ml-2">Colapsar</span>}
        </Button>
      </div>
    </aside>
  );
}
