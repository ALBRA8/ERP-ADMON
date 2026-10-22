"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Package,
  ShoppingCart,
  Users,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Calculator,
} from "lucide-react";
import { formatCurrency } from "@/lib/currency-fn";
import { useRouter } from "next/navigation";

interface DashboardData {
  authenticated: boolean;
  usuario?: any;
  empresa?: any;
  kpis?: {
    ventasMes: number;
    ventasMesPasado: number;
    numFacturasMes: number;
    carteraTotal: number;
    carteraVencida: number;
    cartera30: number;
    cartera60: number;
    cartera90: number;
    carteraMas90: number;
    productosCriticosCount: number;
    comprasMes: number;
    totalProductos: number;
    totalClientes: number;
    totalProveedores: number;
    totalDebitosMes: number;
    totalCreditosMes: number;
  };
  stockCritico?: any[];
}

export function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-pulse text-neutral-500">Cargando dashboard...</div>
      </div>
    );
  }

  const k = data?.kpis;
  if (!k) return null;

  const variacion = k.ventasMesPasado
    ? ((k.ventasMes - k.ventasMesPasado) / k.ventasMesPasado) * 100
    : 0;

  const cards = [
    {
      title: "Ventas del mes",
      value: formatCurrency(k.ventasMes),
      sub: k.numFacturasMes === 1 ? "1 factura" : `${k.numFacturasMes} facturas`,
      icon: TrendingUp,
      change: variacion,
      tone: "emerald" as const,
    },
    {
      title: "Compras del mes",
      value: formatCurrency(k.comprasMes),
      sub: "Causadas",
      icon: ShoppingCart,
      change: 0,
      tone: "blue" as const,
    },
    {
      title: "Cartera total",
      value: formatCurrency(k.carteraTotal),
      sub: `Vencida: ${formatCurrency(k.carteraVencida)}`,
      icon: Wallet,
      change: 0,
      tone: "amber" as const,
    },
    {
      title: "Movimientos contables (mes)",
      value: formatCurrency(k.totalDebitosMes),
      sub: `Créditos: ${formatCurrency(k.totalCreditosMes)}`,
      icon: Calculator,
      change: 0,
      tone: "violet" as const,
    },
  ];

  const toneClasses: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300",
    blue: "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300",
    amber: "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300",
    violet: "bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-300",
    red: "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300",
  };

  const agingBars = [
    { label: "0-30 días", value: k.cartera30, color: "bg-emerald-500" },
    { label: "31-60 días", value: k.cartera60, color: "bg-amber-500" },
    { label: "61-90 días", value: k.cartera90, color: "bg-orange-500" },
    { label: "+90 días", value: k.carteraMas90, color: "bg-red-500" },
  ];
  const maxAging = Math.max(...agingBars.map((b) => b.value), 1);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-neutral-500">
          {data?.empresa?.razonSocial} · NIT {data?.empresa?.nit}
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.title}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${toneClasses[c.tone]}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  {c.change !== 0 && (
                    <div
                      className={`text-xs flex items-center gap-1 ${c.change > 0 ? "text-emerald-600" : "text-red-600"}`}
                    >
                      {c.change > 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                      {Math.abs(c.change).toFixed(1)}%
                    </div>
                  )}
                </div>
                <div className="text-2xl font-bold">{c.value}</div>
                <div className="text-sm text-neutral-500">{c.title}</div>
                <div className="text-xs text-neutral-400 mt-1">{c.sub}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Aging cartera */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Cartera por edades</CardTitle>
            <CardDescription>Cartera vencida de CXC segmentada por antigüedad</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {k.carteraTotal === 0 ? (
              <div className="text-sm text-neutral-500 py-8 text-center">
                No hay cartera pendiente 🎉
              </div>
            ) : (
              agingBars.map((b) => (
                <div key={b.label}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-neutral-600 dark:text-neutral-400">{b.label}</span>
                    <span className="font-medium">{formatCurrency(b.value)}</span>
                  </div>
                  <div className="h-2 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${b.color} rounded-full transition-all`}
                      style={{ width: `${(b.value / maxAging) * 100}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Resumen operacional */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resumen</CardTitle>
            <CardDescription>Operación actual</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-500" />
                Clientes
              </div>
              <span className="font-semibold">{k.totalClientes}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-blue-500" />
                Productos
              </div>
              <span className="font-semibold">{k.totalProductos}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-amber-500" />
                Proveedores
              </div>
              <span className="font-semibold">{k.totalProveedores}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                Productos stock crítico
              </div>
              <Badge variant={k.productosCriticosCount > 0 ? "destructive" : "secondary"}>
                {k.productosCriticosCount}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Stock crítico */}
      {data?.stockCritico && data.stockCritico.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Stock crítico</CardTitle>
            <CardDescription>
              Productos por debajo del nivel mínimo permitido
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {data.stockCritico.map((p: any) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between text-sm py-2 px-3 rounded-md bg-red-50 dark:bg-red-950/20"
                >
                  <div>
                    <span className="font-mono text-xs text-neutral-500 mr-2">
                      {p.codigo}
                    </span>
                    <span className="font-medium">{p.nombre}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-semibold text-red-600">
                      {p.stockTotal.toFixed(2)}
                    </span>
                    <span className="text-xs text-neutral-400 ml-2">
                      / min {p.stockMinimo}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
