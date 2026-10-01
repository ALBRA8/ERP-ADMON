"use client";

// Wrapper para usar currency desde componentes cliente
import { formatCurrency as fmt } from "@/lib/currency";
export const formatCurrency = (amount: number) => fmt(amount);
