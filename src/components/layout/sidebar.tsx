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
  ShoppingCart,
  Wallet,
  Calculator,
  Settings,
  ChevronLeft,
  ChevronRight,
  Moon,
  Sun,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type NavKey =
  | "dashboard"
  | "terceros"
  | "productos"
  | "inventario"
  | "facturas"
  | "compras"
  | "cartera"
  | "contabilidad"
  | "parametros";

const NAV: { key: NavKey; label: string; icon: React.ElementType; group: string }[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, group: "Principal" },
  { key: "terceros", label: "Terceros", icon: Users, group: "Catálogos" },
  { key: "productos", label: "Productos", icon: Package, group: "Catálogos" },
  { key: "inventario", label: "Inventarios", icon: Warehouse, group: "Operación" },
  { key: "facturas", label: "Facturación", icon: FileText, group: "Operación" },
  { key: "compras", label: "Compras", icon: ShoppingCart, group: "Operación" },
  { key: "cartera", label: "Cartera", icon: Wallet, group: "Financiero" },
  { key: "contabilidad", label: "Contabilidad", icon: Calculator, group: "Financiero" },
  { key: "parametros", label: "Parámetros", icon: Settings, group: "Sistema" },
];

interface SidebarProps {
  active: NavKey;
  onNavigate: (k: NavKey) => void;
  empresa?: any;
}

export function Sidebar({ active, onNavigate, empresa }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const { theme, setTheme } = useTheme();

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
                      collapsed && "justify-center",
                    )}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
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
