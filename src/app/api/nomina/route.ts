import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  ok,
  badRequest,
  serverError,
  unauthorized,
  notFound,
  getQuery,
  getQueryInt,
} from "@/lib/api";
import { getSession } from "@/lib/auth";
import { round } from "@/lib/currency";
import {
  liquidarEmpleado,
  generarXMLNomina,
  calcularCUNE,
  generarNumeroNomina,
  mapTipoDocumentoDIAN,
  type EmpleadoNominaInput,
  type EmpresaNominaInput,
  type RetencionFuenteTabla as RetencionTablaType,
} from "@/lib/nomina";

// ============================================================
// GET /api/nomina
// Lista nóminas con paginación y búsqueda por número/tipo/estado
// ============================================================
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const page = getQueryInt(req, "page", 1) ?? 1;
    const pageSize = getQueryInt(req, "pageSize", 50) ?? 50;
    const q = getQuery(req, "q");
    const estado = getQuery(req, "estado");

    const where: any = { empresaId: session.empresaId };
    if (q) {
      where.OR = [{ numero: { contains: q } }, { tipo: { contains: q } }];
    }
    if (estado) where.estado = estado;

    const [items, total] = await Promise.all([
      db.nomina.findMany({
        where,
        orderBy: { fechaPago: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { _count: { select: { detalles: true } } },
      }),
      db.nomina.count({ where }),
    ]);

    const itemsConConteo = items.map((n) => ({
      ...n,
      empleadosCount: (n as any)._count?.detalles ?? 0,
      _count: undefined,
    }));

    return ok({ items: itemsConConteo, total, page, pageSize });
  } catch (e) {
    return serverError("Error al listar nóminas", e);
  }
}

// ============================================================
// POST /api/nomina
// Crea nueva liquidación de nómina para una lista de empleados.
// Para cada empleado: calcula devengos, deducciones, aportes
// patronales y provisiones; genera XML UBL y CUNE por empleado.
// Genera el comprobante contable (asiento) automático.
// ============================================================
const crearSchema = z.object({
  tipo: z
    .enum(["quincenal", "mensual", "vacaciones", "liquidacion_final"])
    .default("quincenal"),
  periodoInicio: z.string(),
  periodoFin: z.string(),
  fechaPago: z.string(),
  centroCostoId: z.string().optional(),
  empleadosIds: z.array(z.string()).min(1),
  observaciones: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const body = await req.json();
    const parsed = crearSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest("Datos inválidos", parsed.error.flatten());
    }
    const data = parsed.data;

    // 1. Cargar empresa
    const empresa = await db.empresa.findUnique({
      where: { id: session.empresaId },
    });
    if (!empresa) return badRequest("Empresa no encontrada");

    // 2. Cargar empleados (Tercero tipo=empleado)
    const empleados = await db.tercero.findMany({
      where: {
        id: { in: data.empleadosIds },
        empresaId: session.empresaId,
        tipo: "empleado",
      },
      include: { ciudad: true },
    });
    if (empleados.length === 0) {
      return badRequest(
        "No se encontraron empleados válidos para los IDs proporcionados",
      );
    }

    // 3. Tabla de retención DIAN vigente 2026
    const tablaRetencionDB = await db.retencionFuenteTabla.findMany({
      where: { empresaId: session.empresaId, vigencia: 2026, activa: true },
      orderBy: { desde: "asc" },
    });
    const tablaRetencion: RetencionTablaType[] = tablaRetencionDB.map((r) => ({
      desde: r.desde,
      hasta: r.hasta,
      porcentaje: r.porcentaje,
      baseUVT: r.baseUVT,
    }));

    // 4. Calcular días del período (default 30 si mensual, 15 si quincenal)
    const diasDefault =
      data.tipo === "quincenal" ? 15 : data.tipo === "mensual" ? 30 : 30;

    // 5. Generar número consecutivo: NOM-{año}-{consecutivo}
    const year = new Date(data.fechaPago).getFullYear();
    const consecutivo =
      (await db.nomina.count({
        where: {
          empresaId: session.empresaId,
          numero: { startsWith: `NOM-${year}-` },
        },
      })) + 1;
    const numero = generarNumeroNomina(consecutivo, year);

    // 6. Fecha de pago para timestamps de XML/CUNE
    const fechaPago = new Date(data.fechaPago);
    const fechaGen = fechaPago.toISOString().slice(0, 10);
    const horaGen = fechaPago.toISOString().slice(11, 19);

    // 7. Ambiente DIAN
    const resolucion = await db.resolucionDian.findFirst({
      where: { empresaId: session.empresaId, activa: true },
      orderBy: { createdAt: "desc" },
    });
    const ambiente = (resolucion?.ambiente ?? "pruebas") as
      | "pruebas"
      | "produccion";

    // 8. Empresa para XML/CUNE
    const empresaNomina: EmpresaNominaInput = {
      nit: empresa.nit,
      razonSocial: empresa.razonSocial,
      nombreComercial: empresa.nombreComercial ?? undefined,
      direccion: empresa.direccion ?? undefined,
      ciudad: empresa.ciudad ?? undefined,
      telefono: empresa.telefono ?? undefined,
      email: empresa.email ?? undefined,
      representanteLegal: empresa.representanteLegal ?? undefined,
      ambiente,
    };

    // 9. Liquidar cada empleado
    const detallesData: any[] = [];
    let totalDevengos = 0;
    let totalDeducciones = 0;
    let totalAportesPatronales = 0;
    let totalProvisiones = 0;
    let netoAPagarGlobal = 0;

    for (const emp of empleados) {
      const salario = emp.salario ?? 0;
      const empleadoInput: EmpleadoNominaInput = {
        terceroId: emp.id,
        nombre: emp.nombre,
        numeroDocumento: emp.numeroDocumento,
        tipoDocumento: emp.tipoDocumento,
        cargo: emp.cargo,
        salario,
        fechaIngreso: emp.fechaIngreso,
        epsId: emp.epsId,
        afpId: emp.afpId,
        arl: emp.arl,
        diasLaborados: diasDefault,
        direccion: emp.direccion,
        ciudad: emp.ciudad?.nombre ?? undefined,
        email: emp.email,
        telefono: emp.telefono,
      };

      const resultado = liquidarEmpleado(empleadoInput, tablaRetencion);

      const cuneEmpleado = calcularCUNE({
        numNom: `${numero}-${emp.numeroDocumento}`,
        fecGen: fechaGen,
        horGen: horaGen,
        valTotal: resultado.netoAPagar,
        codDoc: "102",
        nitEmpleador: empresa.nit,
        tipNotDev: "1",
        nitReceptor: emp.numeroDocumento,
        ambiente,
      });

      const xmlEmpleado = generarXMLNomina({
        empresa: empresaNomina,
        empleado: empleadoInput,
        resultado,
        nomina: {
          numero,
          tipo: data.tipo,
          periodoInicio: data.periodoInicio,
          periodoFin: data.periodoFin,
          fechaPago,
          totalDevengos: resultado.totalDevengado,
          totalDeducciones: resultado.totalDeducciones,
          totalAportesPatronales: resultado.totalAportesPatronales,
          totalProvisiones: resultado.totalProvisiones,
          netoAPagar: resultado.netoAPagar,
        },
        cune: cuneEmpleado,
        fechaGen,
        horaGen,
      });

      detallesData.push({ empleado: emp, resultado, cuneEmpleado, xmlEmpleado });

      totalDevengos = round(totalDevengos + resultado.totalDevengado, 2);
      totalDeducciones = round(totalDeducciones + resultado.totalDeducciones, 2);
      totalAportesPatronales = round(
        totalAportesPatronales + resultado.totalAportesPatronales,
        2,
      );
      totalProvisiones = round(
        totalProvisiones + resultado.totalProvisiones,
        2,
      );
      netoAPagarGlobal = round(netoAPagarGlobal + resultado.netoAPagar, 2);
    }

    // 10. CUNE global de la nómina
    const cuneGlobal = calcularCUNE({
      numNom: numero,
      fecGen: fechaGen,
      horGen: horaGen,
      valTotal: netoAPagarGlobal,
      codDoc: "102",
      nitEmpleador: empresa.nit,
      tipNotDev: "1",
      nitReceptor: empresa.nit,
      ambiente,
    });

    // 11. Crear la nómina cabecera (estado "causada" — ya con asiento)
    const nomina = await db.nomina.create({
      data: {
        empresaId: session.empresaId,
        numero,
        tipo: data.tipo,
        periodoInicio: new Date(data.periodoInicio),
        periodoFin: new Date(data.periodoFin),
        fechaPago,
        centroCostoId: data.centroCostoId ?? null,
        estado: "causada",
        totalDevengos,
        totalDeducciones,
        totalAportesPatronales,
        totalProvisiones,
        netoAPagar: netoAPagarGlobal,
        cune: cuneGlobal,
        estadoDIAN: "procesado",
      },
    });

    // 12. Crear detalles por empleado
    for (const d of detallesData) {
      await db.detalleNomina.create({
        data: {
          nominaId: nomina.id,
          empresaId: session.empresaId,
          terceroId: d.empleado.id,
          salarioBasico: d.empleado.salario ?? 0,
          diasLaborados: d.resultado.diasLaborados,
          ibc: d.resultado.ibc,
          devengos: JSON.stringify(d.resultado.devengos),
          deducciones: JSON.stringify(d.resultado.deducciones),
          aportesPatronales: JSON.stringify(d.resultado.aportesPatronales),
          provisiones: JSON.stringify(d.resultado.provisiones),
          totalDevengado: d.resultado.totalDevengado,
          totalDeducciones: d.resultado.totalDeducciones,
          netoAPagar: d.resultado.netoAPagar,
          cuneEmpleado: d.cuneEmpleado,
          xmlEmpleado: d.xmlEmpleado,
        },
      });
    }

    // 13. Generar comprobante contable (asiento automático)
    const comprobanteId = await generarAsientoNomina(
      nomina.id,
      session.empresaId,
      detallesData,
      numero,
      fechaPago,
      data.centroCostoId,
    );

    if (comprobanteId) {
      await db.nomina.update({
        where: { id: nomina.id },
        data: { comprobanteContableId: comprobanteId },
      });
    }

    const nominaFinal = await db.nomina.findUnique({
      where: { id: nomina.id },
      include: { detalles: true },
    });

    return ok(nominaFinal);
  } catch (e) {
    return serverError("Error al crear nómina", e);
  }
}

// ============================================================
// generarAsientoNomina
// Débitos (gastos): 510506 Salarios, 510510 Aux transporte,
//   510515 Horas extras, 510520 Aportes patronales,
//   510525 Provisiones.
// Créditos (pasivos): 250505 Salarios x pagar,
//   237005/237010/237015/237020/237025/237030 aportes por pagar,
//   236505 Retención salarios, 261005/261505/262005/262505
//   provisiones por pagar.
// ============================================================
async function generarAsientoNomina(
  nominaId: string,
  empresaId: string,
  detallesData: any[],
  numeroNomina: string,
  fecha: Date,
  centroCostoId?: string | null,
): Promise<string | null> {
  const codigos = [
    "510506", "510510", "510515", "510520", "510525",
    "250505", "237005", "237010", "237015", "237020",
    "237025", "237030", "236505", "261005", "261505",
    "262005", "262505",
  ];
  const cuentas = await db.cuentaPuc.findMany({
    where: { codigo: { in: codigos } },
  });
  const cuentaMap = new Map(cuentas.map((c) => [c.codigo, c]));
  const req = ["510506", "250505"];
  if (req.some((c) => !cuentaMap.has(c))) {
    console.warn(
      "[nomina] Cuentas PUC mínimas no encontradas, no se genera asiento:",
      req,
    );
    return null;
  }

  const debitos: Record<string, number> = {};
  const creditos: Record<string, number> = {};
  const incr = (map: Record<string, number>, key: string, val: number) => {
    map[key] = round((map[key] ?? 0) + val, 2);
  };

  for (const d of detallesData) {
    const r = d.resultado;
    for (const dev of r.devengos as any[]) {
      if (dev.codigo === "SALARIO_BASICO") incr(debitos, "510506", dev.valor);
      else if (dev.codigo === "AUX_TRANSPORTE") incr(debitos, "510510", dev.valor);
      else incr(debitos, "510515", dev.valor);
    }
    for (const ded of r.deducciones as any[]) {
      if (ded.codigo === "EPS_TRABAJADOR") incr(creditos, "237005", ded.valor);
      else if (ded.codigo === "PENSION_TRABAJADOR") incr(creditos, "237010", ded.valor);
      else if (ded.codigo === "RETENCION_FUENTE") incr(creditos, "236505", ded.valor);
    }
    for (const ap of r.aportesPatronales as any[]) {
      incr(debitos, "510520", ap.valor);
      if (ap.codigo === "ARL_PATRONAL") incr(creditos, "237015", ap.valor);
      else if (ap.codigo === "ICBF_PATRONAL") incr(creditos, "237020", ap.valor);
      else if (ap.codigo === "CAJA_COMPENSACION") incr(creditos, "237030", ap.valor);
      else if (ap.codigo === "SENA_PATRONAL") incr(creditos, "237025", ap.valor);
      else if (ap.codigo === "PENSION_PATRONAL") incr(creditos, "237010", ap.valor);
    }
    for (const p of r.provisiones as any[]) {
      incr(debitos, "510525", p.valor);
      if (p.codigo === "CESANTIAS") incr(creditos, "261005", p.valor);
      else if (p.codigo === "INTERESES_CESANTIAS") incr(creditos, "261505", p.valor);
      else if (p.codigo === "PRIMA") incr(creditos, "262005", p.valor);
      else if (p.codigo === "VACACIONES") incr(creditos, "262505", p.valor);
    }
    incr(creditos, "250505", r.netoAPagar);
  }

  const totalDebito = round(
    Object.values(debitos).reduce((a, b) => a + b, 0),
    2,
  );
  let totalCredito = round(
    Object.values(creditos).reduce((a, b) => a + b, 0),
    2,
  );
  const diff = round(totalDebito - totalCredito, 2);
  if (Math.abs(diff) > 0.01) {
    creditos["250505"] = round((creditos["250505"] ?? 0) + diff, 2);
    totalCredito = round(
      Object.values(creditos).reduce((a, b) => a + b, 0),
      2,
    );
  }
  const diferencia = round(totalDebito - totalCredito, 2);

  const cnt = await db.comprobante.count({
    where: { empresaId },
  });
  const numero = `CG-${new Date().getFullYear()}-${String(cnt + 1).padStart(6, "0")}`;

  const comprobante = await db.comprobante.create({
    data: {
      empresaId,
      numero,
      tipo: "nomina",
      fecha,
      descripcion: `Nómina ${numeroNomina}`,
      totalDebito,
      totalCredito,
      diferencia,
      estado: "contabilizado",
      documentoOrigenId: nominaId,
      documentoOrigenTipo: "NOMINA",
      centroCostoId: centroCostoId ?? null,
    },
  });

  const movsData: any[] = [];
  for (const [codigo, valor] of Object.entries(debitos)) {
    const cuenta = cuentaMap.get(codigo);
    if (!cuenta || valor <= 0) continue;
    movsData.push({
      empresaId,
      comprobanteId: comprobante.id,
      cuentaId: cuenta.id,
      descripcion: `Nómina ${numeroNomina} — ${cuenta.nombre}`,
      debito: valor,
      credito: 0,
      fecha,
      centroCostoId: centroCostoId ?? null,
    });
  }
  for (const [codigo, valor] of Object.entries(creditos)) {
    const cuenta = cuentaMap.get(codigo);
    if (!cuenta || valor <= 0) continue;
    movsData.push({
      empresaId,
      comprobanteId: comprobante.id,
      cuentaId: cuenta.id,
      descripcion: `Nómina ${numeroNomina} — ${cuenta.nombre}`,
      debito: 0,
      credito: valor,
      fecha,
      centroCostoId: centroCostoId ?? null,
    });
  }
  if (movsData.length > 0) {
    await db.movimientoContable.createMany({ data: movsData });
  }

  return comprobante.id;
}
