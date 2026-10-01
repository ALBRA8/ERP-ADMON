// ============================================================
// niif-mapping.ts — Mapeo de códigos PUC colombianos a categorías NIIF
//
// El Plan Único de Cuentas (PUC) colombiano usa códigos jerárquicos
// por grupos de 2 dígitos:
//   Clase 1: Activo            (1xxx)
//   Clase 2: Pasivo            (2xxx)
//   Clase 3: Patrimonio        (3xxx)
//   Clase 4: Ingresos          (4xxx)
//   Clase 5: Gastos operativos (5xxx)
//   Clase 6: Costos de ventas  (6xxx)
//   Clase 7: Costos de producción (7xxx)
//
// Ejemplos jerárquicos:
//   1      (clase)    → Activo
//   11     (grupo)    → Disponible
//   1105   (cuenta)   → Caja            → efectivo
//   110505 (subcta)   → Caja general    → efectivo (hereda de 1105)
//   1110   (cuenta)   → Bancos          → efectivo
//   111005 (subcta)   → Bancos cta cte  → efectivo (hereda de 1110)
//   1305   (cuenta)   → Clientes        → clientes
//   130505 (subcta)   → Clientes nac.   → clientes (hereda de 1305)
//
// Para NIIF se agrupan en categorías que reflejan las partidas
// de los estados financieros bajo IFRS (NIC 1).
// ============================================================

export type NIIFCategory =
  | "activo_corriente"
  | "activo_no_corriente"
  | "inventarios"
  | "clientes"
  | "efectivo"
  | "pasivo_corriente"
  | "pasivo_no_corriente"
  | "patrimonio"
  | "ingresos"
  | "gastos_admin"
  | "costos_venta"
  | "costos_produccion"
  | "otros_ingresos"
  | "otros_gastos";

// ============================================================
// Tabla de mapeo PUC → NIIF.
//
// La clave es el código PUC (dígitos únicamente, sin puntos ni
// wildcards) y el valor es la categoría NIIF. El matcher busca
// el prefijo MÁS LARGO (más específico) que coincida con el
// código PUC.
//
// Importante: los códigos PUC son jerárquicos. Si un código de
// 6 dígitos no aparece en la tabla, se busca su prefijo de 4
// dígitos, luego de 2, luego de 1.
// ============================================================

export const PUC_TO_NIIF: Record<string, NIIFCategory> = {
  // ---- Activo - Disponible (efectivo) ----
  // 1105 = Caja, 1110 = Bancos, 1115 = Inversiones corto plazo
  "1105": "efectivo",
  "1110": "efectivo",
  "1115": "efectivo",
  "1120": "efectivo", // Inversiones a largo plazo... pasa a no corriente abajo
  // 12 - Deudores
  "1205": "activo_corriente", // Anticipos impuestos
  "1215": "activo_corriente",
  "1220": "activo_corriente",
  "1225": "clientes", // Cuentas por cobrar
  "1230": "activo_corriente",
  // 13 - Clientes
  "1305": "clientes",
  "1310": "clientes",
  "1315": "clientes",
  "1320": "clientes", // Anticipos clientes
  // 14 - Cuentas por cobrar accionistas
  "1405": "activo_corriente",
  // 15 - Inventarios (mercancías)
  "1505": "inventarios",
  "1510": "inventarios",
  "1515": "inventarios", // Materias primas
  "1520": "inventarios", // Productos en proceso
  "1525": "inventarios", // Productos terminados
  "1530": "inventarios", // Mercancías en tránsito
  // 16 - Propiedades, planta y equipo (activo no corriente)
  "1605": "activo_no_corriente",
  "1610": "activo_no_corriente",
  "1615": "activo_no_corriente",
  "1620": "activo_no_corriente",
  "1625": "activo_no_corriente",
  "1630": "activo_no_corriente",
  "1635": "activo_no_corriente",
  "1640": "activo_no_corriente",
  // 17 - Deudores varios / largo plazo
  "1705": "activo_no_corriente",
  // 18 - Intangibles
  "1805": "activo_no_corriente",
  "1810": "activo_no_corriente",
  // 19 - Diferidos
  "1905": "activo_no_corriente",

  // ---- Pasivo ----
  // 21 - Obligaciones financieras (corriente por defecto)
  "2105": "pasivo_corriente",
  "2110": "pasivo_corriente",
  "2115": "pasivo_corriente",
  // 22 - Proveedores
  "2205": "pasivo_corriente",
  "2210": "pasivo_corriente",
  // 23 - Cuentas por pagar
  "2305": "pasivo_corriente",
  "2310": "pasivo_corriente",
  "2315": "pasivo_corriente",
  "2320": "pasivo_corriente",
  "2325": "pasivo_corriente",
  "2330": "pasivo_corriente",
  "2335": "pasivo_corriente",
  "2340": "pasivo_corriente",
  "2345": "pasivo_corriente",
  "2350": "pasivo_corriente",
  "2355": "pasivo_corriente",
  "2360": "pasivo_corriente",
  "2365": "pasivo_corriente",
  "2370": "pasivo_corriente", // Aportes EPS por pagar
  "2375": "pasivo_corriente",
  "2380": "pasivo_corriente",
  // 24 - Impuestos y gravámenes
  "2405": "pasivo_corriente",
  "2410": "pasivo_corriente",
  "2415": "pasivo_corriente",
  "2420": "pasivo_corriente",
  "2425": "pasivo_corriente",
  // 25 - Obligaciones laborales (largo plazo: cesantías, pensiones)
  "2505": "pasivo_no_corriente",
  "2510": "pasivo_no_corriente",
  "2515": "pasivo_no_corriente",
  "2520": "pasivo_no_corriente",
  "2525": "pasivo_no_corriente",
  "2530": "pasivo_no_corriente",
  "2535": "pasivo_no_corriente",
  // 26 - Pasivos estimados / provisiones
  "2605": "pasivo_no_corriente",
  "2610": "pasivo_no_corriente",
  "2615": "pasivo_no_corriente",
  "2620": "pasivo_no_corriente",
  // 27 - Diferidos pasivo
  "2705": "pasivo_no_corriente",
  "2710": "pasivo_no_corriente",
  "2715": "pasivo_no_corriente",
  "2720": "pasivo_no_corriente",
  "2725": "pasivo_no_corriente",
  // 28 - Otros pasivos
  "2805": "pasivo_corriente",
  "2810": "pasivo_corriente",
  // 29 - Pasivos por impuestos diferidos
  "2905": "pasivo_no_corriente",

  // ---- Patrimonio (clase 3) ----
  "3105": "patrimonio", // Capital social
  "3110": "patrimonio",
  "3115": "patrimonio",
  "3120": "patrimonio",
  "3125": "patrimonio",
  "3130": "patrimonio",
  "3135": "patrimonio",
  "3205": "patrimonio", // Superávit
  "3210": "patrimonio",
  "3215": "patrimonio",
  "3220": "patrimonio",
  "3225": "patrimonio",
  "3305": "patrimonio", // Reservas
  "3310": "patrimonio",
  "3315": "patrimonio",
  "3320": "patrimonio",
  "3325": "patrimonio",
  "3605": "patrimonio", // Utilidad / dividendos
  "3606": "patrimonio",
  "3610": "patrimonio",
  "3615": "patrimonio",
  "3705": "patrimonio", // Resultados de ejercicios anteriores
  "3710": "patrimonio",
  "3715": "patrimonio",
  "3720": "patrimonio",
  "3725": "patrimonio",
  "3730": "patrimonio",
  "3805": "patrimonio", // Revalorización
  "3810": "patrimonio",

  // ---- Ingresos (clase 4) ----
  "4105": "ingresos", // Comercial 41xx
  "4110": "ingresos",
  "4115": "ingresos",
  "4120": "ingresos",
  "4125": "ingresos",
  "4150": "ingresos",
  "4205": "ingresos", // Servicios 42xx
  "4210": "ingresos",
  "4215": "ingresos",
  "4220": "ingresos",
  "4225": "ingresos",
  "4250": "ingresos",
  "4255": "ingresos",
  "4305": "ingresos",
  "4310": "ingresos",
  "4405": "ingresos",
  "4505": "ingresos", // Otros ingresos 45xx
  "4510": "ingresos",
  "4515": "ingresos",
  "4520": "ingresos",
  "4525": "ingresos",
  "4530": "ingresos",
  "4540": "ingresos",
  "4550": "ingresos",
  "4605": "ingresos",
  "4705": "otros_ingresos", // Ingresos financieros 47xx
  "4710": "otros_ingresos",
  "4715": "otros_ingresos",
  "4720": "otros_ingresos",
  "4725": "otros_ingresos",
  "4805": "ingresos",
  "4905": "ingresos",

  // ---- Gastos administrativos (clase 5) ----
  "5105": "gastos_admin", // Gastos de personal 51xx
  "5110": "gastos_admin",
  "5115": "gastos_admin",
  "5120": "gastos_admin",
  "5195": "gastos_admin",
  "5205": "gastos_admin", // Servicios 52xx
  "5210": "gastos_admin",
  "5215": "gastos_admin",
  "5220": "gastos_admin",
  "5225": "gastos_admin",
  "5230": "gastos_admin",
  "5235": "gastos_admin",
  "5240": "gastos_admin",
  "5305": "gastos_admin", // Arrendamientos
  "5310": "gastos_admin",
  "5315": "gastos_admin",
  "5405": "gastos_admin", // Contribuciones
  "5410": "gastos_admin",
  "5505": "gastos_admin", // Gastos
  "5510": "gastos_admin",
  "5515": "gastos_admin",
  "5520": "gastos_admin",
  "5525": "gastos_admin",
  "5605": "gastos_admin", // Otros
  "5610": "gastos_admin",
  "5615": "gastos_admin",
  "5620": "gastos_admin",
  "5705": "gastos_admin", // Ajustes
  "5905": "gastos_admin", // Diferidos

  // ---- Costos de venta (clase 6) ----
  "6105": "costos_venta", // Costo de ventas y servicios
  "6110": "costos_venta",
  "6115": "costos_venta",
  "6120": "costos_venta",
  "6125": "costos_venta",
  "6130": "costos_venta",
  "6135": "costos_venta",
  "6140": "costos_venta",
  "6145": "costos_venta",
  "6150": "costos_venta",
  "6205": "costos_venta", // Compras 62xx
  "6210": "costos_venta",
  "6505": "costos_venta", // Otros costos
  "6510": "costos_venta",
  "6515": "costos_venta",
  "6520": "costos_venta",
  "6525": "costos_venta",
  "6530": "costos_venta",
  "6535": "costos_venta",
  "6540": "costos_venta",

  // ---- Costos de producción (clase 7) ----
  "7105": "costos_produccion", // Materia prima
  "7110": "costos_produccion",
  "7115": "costos_produccion",
  "7120": "costos_produccion",
  "7125": "costos_produccion",
  "7130": "costos_produccion",
  "7205": "costos_produccion", // Mano de obra directa
  "7210": "costos_produccion",
  "7215": "costos_produccion",
  "7220": "costos_produccion",
  "7225": "costos_produccion",
  "7305": "costos_produccion", // Costos indirectos
  "7310": "costos_produccion",
  "7315": "costos_produccion",
  "7320": "costos_produccion",
  "7325": "costos_produccion",
  "7330": "costos_produccion",
  "7335": "costos_produccion",
  "7340": "costos_produccion",
  "7395": "costos_produccion",

  // ---- Fallbacks por clase (1er dígito) ----
  // Se aplican cuando no hay match más específico
  "1": "activo_corriente",
  "2": "pasivo_corriente",
  "3": "patrimonio",
  "4": "ingresos",
  "5": "gastos_admin",
  "6": "costos_venta",
  "7": "costos_produccion",
};

// ============================================================
// normalizarCodigoPUC
// Limpia un código PUC dejando solo dígitos (sin puntos).
// ============================================================
export function normalizarCodigoPUC(codigo: string): string {
  if (!codigo) return "";
  return (codigo ?? "").replace(/[^0-9]/g, "");
}

// ============================================================
// mapCuentaPUCtoNIIF(codigo: string): NIIFCategory
//
// Busca el mapeo MÁS ESPECÍFICO (más largo) que coincida con
// el código PUC dado. Devuelve la categoría NIIF asociada.
//
// Ejemplos:
//   "1105"        → "efectivo"        (match exacto de 4 dígitos)
//   "110505"      → "efectivo"        (no en tabla, pero "1105" es prefijo)
//   "111005"      → "efectivo"        (no en tabla, pero "1110" es prefijo)
//   "130505"      → "clientes"        ("1305" es prefijo)
//   "150505"      → "inventarios"     ("1505" es prefijo)
//   "237005"      → "pasivo_corriente" ("2370" es prefijo)
//   "3605"        → "patrimonio"
//   "4110"        → "ingresos"
//   "5110"        → "gastos_admin"
//   "6110"        → "costos_venta"
//   "7205"        → "costos_produccion"
//   "8905"        → null (no existe clase 8 en PUC estándar)
// ============================================================
export function mapCuentaPUCtoNIIF(codigo: string): NIIFCategory | null {
  const clean = normalizarCodigoPUC(codigo);
  if (!clean) return null;

  // Probar matches por longitud descendente (de más largo a más corto)
  // Longitudes válidas: 1, 2, 3, 4, 5, 6 dígitos (PUC estándar)
  for (let len = Math.min(clean.length, 8); len >= 1; len--) {
    const prefix = clean.slice(0, len);
    if (PUC_TO_NIIF[prefix]) {
      return PUC_TO_NIIF[prefix];
    }
  }

  // Último recurso: por clase principal (primer dígito)
  const clase = clean.slice(0, 1);
  const claseMap: Record<string, NIIFCategory> = {
    "1": "activo_corriente",
    "2": "pasivo_corriente",
    "3": "patrimonio",
    "4": "ingresos",
    "5": "gastos_admin",
    "6": "costos_venta",
    "7": "costos_produccion",
  };
  return claseMap[clase] ?? null;
}

// ============================================================
// Tipos y helpers para agrupación de saldos por categoría NIIF
// ============================================================

export interface SaldoLine {
  codigo: string;
  nombre: string;
  saldo: number;
  naturaleza?: string;
}

export type SaldosPorCategoria = Partial<
  Record<NIIFCategory, SaldoLine[]>
>;

// ============================================================
// agruparSaldosPorCategoria(movs): SaldosPorCategoria
//
// Toma una lista de movimientos contables (cada uno con
// cuenta.codigo + cuenta.nombre + cuenta.naturaleza + debito + credito)
// y los agrupa por categoría NIIF según el código PUC de la cuenta
// asociada.
//
// Para cada cuenta suma débito - crédito (si naturaleza=debito) o
// crédito - débito (si naturaleza=credito), igual que el balance de
// prueba estándar.
// ============================================================
export function agruparSaldosPorCategoria(movs: any[]): SaldosPorCategoria {
  const result: SaldosPorCategoria = {};

  const porCuenta: Record<
    string,
    SaldoLine & { _debito: number; _credito: number; naturaleza: string }
  > = {};

  for (const m of movs) {
    const cuenta = m.cuenta ?? m;
    const codigo = cuenta.codigo ?? m.codigo ?? "";
    const nombre = cuenta.nombre ?? m.nombre ?? "";
    const naturaleza = cuenta.naturaleza ?? m.naturaleza ?? "debito";
    const debito = Number(m.debito ?? 0);
    const credito = Number(m.credito ?? 0);

    if (!porCuenta[codigo]) {
      porCuenta[codigo] = {
        codigo,
        nombre,
        naturaleza,
        saldo: 0,
        _debito: 0,
        _credito: 0,
      };
    }
    porCuenta[codigo]._debito += debito;
    porCuenta[codigo]._credito += credito;
  }

  for (const codigo of Object.keys(porCuenta)) {
    const pc = porCuenta[codigo];
    const saldo =
      pc.naturaleza === "credito"
        ? pc._credito - pc._debito
        : pc._debito - pc._credito;
    const saldoRedondeado = Math.round(saldo * 100) / 100;
    if (Math.abs(saldoRedondeado) < 0.005) continue; // omitir saldos 0

    const categoria = mapCuentaPUCtoNIIF(codigo) ?? "activo_corriente";
    if (!result[categoria]) result[categoria] = [];
    result[categoria]!.push({
      codigo: pc.codigo,
      nombre: pc.nombre,
      saldo: saldoRedondeado,
      naturaleza: pc.naturaleza,
    });
  }

  // Ordenar cada categoría por código
  for (const cat of Object.keys(result) as NIIFCategory[]) {
    const arr = result[cat];
    if (arr) arr.sort((a, b) => a.codigo.localeCompare(b.codigo));
  }

  return result;
}

// ============================================================
// Helper: sumar saldos de un grupo
// ============================================================
export function sumarSaldos(lineas: SaldoLine[] | undefined): number {
  if (!lineas) return 0;
  return Math.round(lineas.reduce((a, l) => a + l.saldo, 0) * 100) / 100;
}
