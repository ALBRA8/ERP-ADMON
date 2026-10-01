"use client";

import { LogOut, User as UserIcon, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { InstallButton } from "@/components/pwa/install-button";
import { useOfflinePos } from "@/hooks/use-offline-pos";

interface TopbarProps {
  usuario: any;
  empresa: any;
  onLogout: () => void;
}

export function Topbar({ usuario, empresa, onLogout }: TopbarProps) {
  const { isOnline, pendingCount } = useOfflinePos();

  return (
    <header className="h-14 sticky top-0 z-30 flex items-center justify-between gap-4 px-4 md:px-6 bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <Building2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <div className="min-w-0">
            <span className="font-semibold text-sm truncate block">
              {empresa?.razonSocial}
            </span>
            <span className="text-xs text-neutral-500 truncate block">
              NIT {empresa?.nit} · {empresa?.ciudad}
            </span>
          </div>
        </div>
        {pendingCount > 0 && (
          <Badge
            variant="outline"
            className="hidden md:inline-flex border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300 ml-2"
            title={`${pendingCount} factura(s) pendientes de sincronización`}
          >
            {pendingCount} pendiente(s)
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Badge
          variant="outline"
          className={`hidden md:inline-flex ${
            isOnline
              ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
              : "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
          }`}
          title={isOnline ? "Conexión activa" : "Sin conexión — modo POS local"}
        >
          {isOnline ? "🟢 Online" : "🔴 Offline"}
        </Badge>
        <InstallButton />
        <Badge variant="outline" className="text-xs">
          {usuario?.rol ?? "user"}
        </Badge>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-2">
              <div className="w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center">
                <UserIcon className="w-4 h-4 text-emerald-700 dark:text-emerald-300" />
              </div>
              <span className="hidden sm:inline">{usuario?.nombre}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>
              <div className="font-medium">{usuario?.nombre}</div>
              <div className="text-xs text-neutral-500 font-normal">
                {usuario?.email}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onLogout} className="text-red-600 dark:text-red-400 cursor-pointer">
              <LogOut className="w-4 h-4 mr-2" />
              Cerrar sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
