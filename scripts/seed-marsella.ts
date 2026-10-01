// ============================================================
// seed-marsella.ts — Población inicial del ERP Marsella
// Crea: empresa Marsella S.A.S., 1 admin, 1 resolución DIAN,
// tipos de documento, ~46 cuentas PUC colombiano, 1 bodega,
// 5 clientes, 3 proveedores, 10 productos, 2 impuestos.
// ============================================================
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/crypto";

async function main() {
  console.log("[seed] Iniciando seed Marsella ERP...");

  // 1. Empresa
  let empresa = await db.empresa.findUnique({
    where: { nit: "900.123.456-7" },
  });
  if (!empresa) {
    empresa = await db.empresa.create({
      data: {
        nit: "900.123.456-7",
        razonSocial: "Marsella S.A.S.",
        nombreComercial: "Marsella ERP Demo",
        direccion: "Calle 50 # 45-67, El Poblado",
        telefono: "+57 604 555-1234",
        ciudad: "Medellín",
        email: "info@marsellasas.com",
        website: "https://marsellasas.com",
        representanteLegal: "Johan Marsella Pérez",
        regimenTributario: "comun",
        responsabilidad: "iva",
        moneda: "COP",
        decimales: 2,
        zonaHoraria: "America/Bogota",
      },
    });
    console.log("[seed] Empresa creada:", empresa.razonSocial);
  } else {
    console.log("[seed] Empresa ya existe");
  }

  // 2. Usuario admin
  const existingUser = await db.usuario.findUnique({
    where: { email: "demo@marsella.com" },
  });
  if (!existingUser) {
    await db.usuario.create({
      data: {
        empresaId: empresa.id,
        email: "demo@marsella.com",
        nombre: "Johan Marsella",
        passwordHash: await hashPassword("demo1234"),
        rol: "admin",
        cargo: "Gerente",
      },
    });
    console.log("[seed] Usuario admin creado: demo@marsella.com / demo1234");
  }

  // 3. Resolución DIAN
  const existingRes = await db.resolucionDian.findFirst({
    where: { empresaId: empresa.id, numeroResolucion: "187640" },
  });
  if (!existingRes) {
    await db.resolucionDian.create({
      data: {
        empresaId: empresa.id,
        numeroResolucion: "187640",
        fechaResolucion: new Date("2024-01-15"),
        fechaInicioVigencia: new Date("2024-02-01"),
        fechaFinVigencia: new Date("2027-01-31"),
        prefijo: "FEL",
        rangoinicio: 1,
        rangoFin: 50000,
        rangoinicioActual: 1,
        rangoFinActual: 50000,
        consecutivoSiguiente: 1,
        tipoOperacion: "estandar",
        ambiente: "pruebas",
        activa: true,
      },
    });
    console.log("[seed] Resolución DIAN FEL-1..50000 creada");
  }

  // 4. Tipos de documento
  const tipos = [
    { codigo: "FEL", nombre: "Factura Electrónica de Venta", naturaleza: "credito", afectaCartera: "cxc", afectaInventario: "salida" },
    { codigo: "FPOS", nombre: "Factura POS", naturaleza: "credito", afectaCartera: "cxc", afectaInventario: "salida" },
    { codigo: "COM", nombre: "Factura de Compra", naturaleza: "debito", afectaCartera: "cxp", afectaInventario: "entrada" },
    { codigo: "RC", nombre: "Recibo de Caja", naturaleza: "debito", afectaCartera: "cxc", afectaInventario: "none" },
    { codigo: "CE", nombre: "Comprobante de Egreso", naturaleza: "credito", afectaCartera: "cxp", afectaInventario: "none" },
    { codigo: "NDV", nombre: "Nota Débito Venta", naturaleza: "debito", afectaCartera: "cxc", afectaInventario: "none" },
    { codigo: "NCV", nombre: "Nota Crédito Venta", naturaleza: "credito", afectaCartera: "cxc", afectaInventario: "none" },
    { codigo: "CG", nombre: "Comprobante Contable", naturaleza: "debito", afectaCartera: "none", afectaInventario: "none" },
  ];
  for (const t of tipos) {
    const ex = await db.tipoDocumento.findUnique({
      where: { empresaId_codigo: { empresaId: empresa.id, codigo: t.codigo } },
    });
    if (!ex) {
      await db.tipoDocumento.create({
        data: { empresaId: empresa.id, ...t, afectaContabilidad: true, consecutivoSiguiente: 1 },
      });
    }
  }
  console.log("[seed] Tipos de documento creados:", tipos.length);

  // 5. Impuestos
  const impuestos = [
    { codigo: "01", nombre: "IVA 19%", tipo: "iva", tarifa: 19 },
    { codigo: "02", nombre: "IVA 5%", tipo: "iva", tarifa: 5 },
    { codigo: "03", nombre: "IVA Exento", tipo: "iva", tarifa: 0 },
    { codigo: "04", nombre: "Impoconsumo 4%", tipo: "impoconsumo", tarifa: 4 },
    { codigo: "06", nombre: "ReteFuente 2.5%", tipo: "retefuente", tarifa: 2.5 },
    { codigo: "07", nombre: "ReteICA 6.9 x 1000", tipo: "reteica", tarifa: 0.69 },
  ];
  for (const i of impuestos) {
    const ex = await db.impuesto.findUnique({
      where: { empresaId_codigo: { empresaId: empresa.id, codigo: i.codigo } },
    });
    if (!ex) {
      await db.impuesto.create({
        data: { empresaId: empresa.id, ...i, activo: true },
      });
    }
  }
  console.log("[seed] Impuestos creados:", impuestos.length);

  // 6. Unidades de medida
  const unidades = [
    { codigo: "UND", nombre: "Unidad", factor: 1 },
    { codigo: "KG", nombre: "Kilogramo", factor: 1 },
    { codigo: "GR", nombre: "Gramo", factor: 0.001 },
    { codigo: "LT", nombre: "Litro", factor: 1 },
    { codigo: "ML", nombre: "Mililitro", factor: 0.001 },
    { codigo: "MTR", nombre: "Metro", factor: 1 },
    { codigo: "CJA", nombre: "Caja", factor: 12 },
    { codigo: "PAR", nombre: "Par", factor: 2 },
  ];
  for (const u of unidades) {
    const ex = await db.unidadMedida.findUnique({ where: { codigo: u.codigo } });
    if (!ex) {
      await db.unidadMedida.create({ data: { empresaId: empresa.id, ...u } });
    }
  }
  console.log("[seed] Unidades creadas:", unidades.length);

  // 7. Líneas de clasificación
  const lineas = [
    { nivel: 1, codigo: "ELECT", nombre: "Electrodomésticos" },
    { nivel: 1, codigo: "FERRE", nombre: "Ferretería" },
    { nivel: 1, codigo: "OFIC", nombre: "Oficina" },
    { nivel: 1, codigo: "ALIM", nombre: "Alimentos" },
  ];
  const lineasCreadas: Record<string, string> = {};
  for (const l of lineas) {
    const ex = await db.lineaClasificacion.findUnique({
      where: { empresaId_codigo_nivel: { empresaId: empresa.id, codigo: l.codigo, nivel: l.nivel } },
    });
    if (!ex) {
      const created = await db.lineaClasificacion.create({
        data: { empresaId: empresa.id, ...l },
      });
      lineasCreadas[l.codigo] = created.id;
    } else {
      lineasCreadas[l.codigo] = ex.id;
    }
  }
  console.log("[seed] Líneas nivel 1 creadas:", Object.keys(lineasCreadas).length);

  // 8. Bodega principal
  let bodega = await db.bodega.findFirst({
    where: { empresaId: empresa.id, codigo: "PRIN" },
  });
  if (!bodega) {
    bodega = await db.bodega.create({
      data: {
        empresaId: empresa.id,
        codigo: "PRIN",
        nombre: "Bodega Principal",
        direccion: "Calle 50 # 45-67",
      },
    });
  }

  // 9. Ciudades
  const ciudades = [
    { codigoDane: "05001", nombre: "Medellín", departamento: "Antioquia" },
    { codigoDane: "11001", nombre: "Bogotá D.C.", departamento: "Cundinamarca" },
    { codigoDane: "08001", nombre: "Barranquilla", departamento: "Atlántico" },
    { codigoDane: "76001", nombre: "Cali", departamento: "Valle del Cauca" },
    { codigoDane: "68001", nombre: "Bucaramanga", departamento: "Santander" },
  ];
  for (const c of ciudades) {
    const ex = await db.ciudad.findUnique({ where: { codigoDane: c.codigoDane } });
    if (!ex) {
      await db.ciudad.create({ data: { empresaId: empresa.id, ...c } });
    }
  }

  // 10. PUC colombiano (subconjunto esencial)
  const pucCuentas = [
    { codigo: "1", nombre: "Activo", nivel: 1, naturaleza: "debito" },
    { codigo: "11", nombre: "Disponible", nivel: 2, naturaleza: "debito" },
    { codigo: "1105", nombre: "Caja", nivel: 3, naturaleza: "debito" },
    { codigo: "110505", nombre: "Caja general", nivel: 5, naturaleza: "debito" },
    { codigo: "1110", nombre: "Bancos", nivel: 3, naturaleza: "debito" },
    { codigo: "111005", nombre: "Bancos cuenta corriente", nivel: 5, naturaleza: "debito" },
    { codigo: "13", nombre: "Deudores", nivel: 2, naturaleza: "debito" },
    { codigo: "1305", nombre: "Clientes", nivel: 3, naturaleza: "debito" },
    { codigo: "130505", nombre: "Clientes nacionales", nivel: 5, naturaleza: "debito" },
    { codigo: "14", nombre: "Cuentas por cobrar", nivel: 2, naturaleza: "debito" },
    { codigo: "1435", nombre: "Cuentas por cobrar a trabajadores", nivel: 3, naturaleza: "debito" },
    { codigo: "15", nombre: "Inventarios", nivel: 2, naturaleza: "debito" },
    { codigo: "1505", nombre: "Mercancías no fabricadas por la empresa", nivel: 3, naturaleza: "debito" },
    { codigo: "150505", nombre: "Inventario general", nivel: 5, naturaleza: "debito" },
    { codigo: "1520", nombre: "Insumos y materiales", nivel: 3, naturaleza: "debito" },
    { codigo: "2", nombre: "Pasivo", nivel: 1, naturaleza: "credito" },
    { codigo: "21", nombre: "Obligaciones financieras", nivel: 2, naturaleza: "credito" },
    { codigo: "2105", nombre: "Bancos nacionales", nivel: 3, naturaleza: "credito" },
    { codigo: "22", nombre: "Proveedores", nivel: 2, naturaleza: "credito" },
    { codigo: "2205", nombre: "Proveedores nacionales", nivel: 3, naturaleza: "credito" },
    { codigo: "220505", nombre: "Proveedores del país", nivel: 5, naturaleza: "credito" },
    { codigo: "23", nombre: "Cuentas por pagar", nivel: 2, naturaleza: "credito" },
    { codigo: "2305", nombre: "Cuentas por pagar proveedores", nivel: 3, naturaleza: "credito" },
    { codigo: "24", nombre: "Impuestos, gravámenes y contribuciones", nivel: 2, naturaleza: "credito" },
    { codigo: "2408", nombre: "IVA por pagar", nivel: 3, naturaleza: "credito" },
    { codigo: "240805", nombre: "IVA generado", nivel: 5, naturaleza: "credito" },
    { codigo: "240802", nombre: "IVA descontable", nivel: 5, naturaleza: "debito" },
    { codigo: "2436", nombre: "ReteFuente", nivel: 3, naturaleza: "credito" },
    { codigo: "3", nombre: "Patrimonio", nivel: 1, naturaleza: "credito" },
    { codigo: "31", nombre: "Capital social", nivel: 2, naturaleza: "credito" },
    { codigo: "3105", nombre: "Aportes sociales", nivel: 3, naturaleza: "credito" },
    { codigo: "4", nombre: "Ingresos", nivel: 1, naturaleza: "credito" },
    { codigo: "41", nombre: "Operacionales", nivel: 2, naturaleza: "credito" },
    { codigo: "4135", nombre: "Comercio", nivel: 3, naturaleza: "credito" },
    { codigo: "413595", nombre: "Ingresos por ventas", nivel: 5, naturaleza: "credito" },
    { codigo: "5", nombre: "Gastos", nivel: 1, naturaleza: "debito" },
    { codigo: "51", nombre: "Operacionales de administración", nivel: 2, naturaleza: "debito" },
    { codigo: "5105", nombre: "Gastos de personal", nivel: 3, naturaleza: "debito" },
    { codigo: "510506", nombre: "Salarios básicos", nivel: 5, naturaleza: "debito" },
    { codigo: "52", nombre: "Operacionales de ventas", nivel: 2, naturaleza: "debito" },
    { codigo: "5205", nombre: "Gastos de personal (ventas)", nivel: 3, naturaleza: "debito" },
    { codigo: "6", nombre: "Costos de venta", nivel: 1, naturaleza: "debito" },
    { codigo: "61", nombre: "Costos de venta y prestación de servicios", nivel: 2, naturaleza: "debito" },
    { codigo: "6135", nombre: "Costos de mercancías vendidas", nivel: 3, naturaleza: "debito" },
    { codigo: "613595", nombre: "Costo de mercancías", nivel: 5, naturaleza: "debito" },
    { codigo: "7", nombre: "Costos de producción", nivel: 1, naturaleza: "debito" },
    { codigo: "71", nombre: "Materia prima", nivel: 2, naturaleza: "debito" },
    { codigo: "7205", nombre: "Compras de materia prima", nivel: 3, naturaleza: "debito" },
  ];

  for (const c of pucCuentas) {
    const ex = await db.cuentaPuc.findUnique({ where: { codigo: c.codigo } });
    if (ex) continue;
    let padreId: string | undefined;
    if (c.codigo.length > 1) {
      const padresCandidatos = pucCuentas
        .filter((p) => p.codigo.length < c.codigo.length && c.codigo.startsWith(p.codigo))
        .sort((a, b) => b.codigo.length - a.codigo.length);
      if (padresCandidatos.length > 0) {
        const padre = await db.cuentaPuc.findUnique({ where: { codigo: padresCandidatos[0].codigo } });
        padreId = padre?.id;
      }
    }
    await db.cuentaPuc.create({
      data: {
        empresaId: empresa.id,
        codigo: c.codigo,
        nombre: c.nombre,
        nivel: c.nivel,
        naturaleza: c.naturaleza as "debito" | "credito",
        esMovimiento: c.nivel >= 4,
        cuentaPadreId: padreId,
      },
    });
  }
  console.log("[seed] Plan Único de Cuentas (PUC) cargado:", pucCuentas.length, "cuentas");

  // 11. Clientes
  const clientes = [
    { tipoDocumento: "NIT", numeroDocumento: "901.456.789-0", nombre: "Comercializadora Andina S.A.S.", ciudadIdx: 0, cupoCredito: 5000000, diasPlazo: 30 },
    { tipoDocumento: "CC", numeroDocumento: "1020345678", nombre: "Carlos Andrés Gómez", ciudadIdx: 1, cupoCredito: 1500000, diasPlazo: 0 },
    { tipoDocumento: "NIT", numeroDocumento: "830987654", nombre: "Distribuciones El Sol Ltda.", ciudadIdx: 2, cupoCredito: 3000000, diasPlazo: 60 },
    { tipoDocumento: "CC", numeroDocumento: "70345678", nombre: "María Fernanda López", ciudadIdx: 3, cupoCredito: 800000, diasPlazo: 0 },
    { tipoDocumento: "CC", numeroDocumento: "43012567", nombre: "Juan Camilo Restrepo", ciudadIdx: 4, cupoCredito: 2000000, diasPlazo: 15 },
  ];
  const ciudadesRecords = await db.ciudad.findMany();
  for (const c of clientes) {
    const ex = await db.tercero.findUnique({
      where: {
        empresaId_tipoDocumento_numeroDocumento: {
          empresaId: empresa.id,
          tipoDocumento: c.tipoDocumento,
          numeroDocumento: c.numeroDocumento,
        },
      },
    });
    if (!ex) {
      await db.tercero.create({
        data: {
          empresaId: empresa.id,
          tipo: "cliente",
          tipoDocumento: c.tipoDocumento,
          numeroDocumento: c.numeroDocumento,
          nombre: c.nombre,
          direccion: `Calle ${100 + Math.floor(Math.random() * 900)}`,
          telefono: `+57 3${Math.floor(100000000 + Math.random() * 899999999)}`,
          email: `cliente${c.nombre.split(" ")[0].toLowerCase()}@example.com`,
          ciudadId: ciudadesRecords[c.ciudadIdx]?.id,
          regimenTributario: c.tipoDocumento === "NIT" ? "comun" : "simple",
          responsabilidad: "iva",
          cupoCredito: c.cupoCredito,
          diasPlazo: c.diasPlazo,
        },
      });
    }
  }
  console.log("[seed] Clientes creados:", clientes.length);

  // 12. Proveedores
  const proveedores = [
    { tipoDocumento: "NIT", numeroDocumento: "890303001", nombre: "Importadora del Caribe S.A." },
    { tipoDocumento: "NIT", numeroDocumento: "860045301", nombre: "Distribuidora Nacional S.A.S." },
    { tipoDocumento: "NIT", numeroDocumento: "799998001", nombre: "Mayorista Antioqueño Ltda." },
  ];
  for (const p of proveedores) {
    const ex = await db.tercero.findUnique({
      where: {
        empresaId_tipoDocumento_numeroDocumento: {
          empresaId: empresa.id,
          tipoDocumento: p.tipoDocumento,
          numeroDocumento: p.numeroDocumento,
        },
      },
    });
    if (!ex) {
      await db.tercero.create({
        data: {
          empresaId: empresa.id,
          tipo: "proveedor",
          tipoDocumento: p.tipoDocumento,
          numeroDocumento: p.numeroDocumento,
          nombre: p.nombre,
          direccion: "Vía principal",
          telefono: "+57 601 555-0000",
          email: `compras@${p.nombre.split(" ")[0].toLowerCase()}.com`,
          regimenTributario: "comun",
          responsabilidad: "iva",
        },
      });
    }
  }
  console.log("[seed] Proveedores creados:", proveedores.length);

  // 13. Productos
  const impIva19 = await db.impuesto.findUnique({
    where: { empresaId_codigo: { empresaId: empresa.id, codigo: "01" } },
  });
  const impIva5 = await db.impuesto.findUnique({
    where: { empresaId_codigo: { empresaId: empresa.id, codigo: "02" } },
  });
  const impIva0 = await db.impuesto.findUnique({
    where: { empresaId_codigo: { empresaId: empresa.id, codigo: "03" } },
  });
  const undMed = await db.unidadMedida.findUnique({ where: { codigo: "UND" } });
  const lineaFer = await db.lineaClasificacion.findUnique({
    where: { empresaId_codigo_nivel: { empresaId: empresa.id, codigo: "FERRE", nivel: 1 } },
  });
  const lineaElec = await db.lineaClasificacion.findUnique({
    where: { empresaId_codigo_nivel: { empresaId: empresa.id, codigo: "ELECT", nivel: 1 } },
  });
  const lineaOfi = await db.lineaClasificacion.findUnique({
    where: { empresaId_codigo_nivel: { empresaId: empresa.id, codigo: "OFIC", nivel: 1 } },
  });
  const lineaAli = await db.lineaClasificacion.findUnique({
    where: { empresaId_codigo_nivel: { empresaId: empresa.id, codigo: "ALIM", nivel: 1 } },
  });

  const productos = [
    { codigo: "P001", nombre: "Martillo de uña 16oz", costo: 18000, precio: 35000, iva: 19, linea: lineaFer },
    { codigo: "P002", nombre: "Destornillador plano 6mm", costo: 8500, precio: 16500, iva: 19, linea: lineaFer },
    { codigo: "P003", nombre: "Llave inglesa ajustable 10\"", costo: 32000, precio: 58000, iva: 19, linea: lineaFer },
    { codigo: "P004", nombre: "Taladro percutor 1/2\"", costo: 145000, precio: 245000, iva: 19, linea: lineaElec },
    { codigo: "P005", nombre: "Licuadora 3 velocidades", costo: 78000, precio: 145000, iva: 19, linea: lineaElec },
    { codigo: "P006", nombre: "Olla arrocera 1.5L", costo: 65000, precio: 119000, iva: 19, linea: lineaElec },
    { codigo: "P007", nombre: "Resma papel carta 500 hojas", costo: 12000, precio: 22000, iva: 5, linea: lineaOfi },
    { codigo: "P008", nombre: "Bolígrafo esfero azul x10", costo: 4500, precio: 9500, iva: 5, linea: lineaOfi },
    { codigo: "P009", nombre: "Café tostado 500g", costo: 14500, precio: 28500, iva: 5, linea: lineaAli },
    { codigo: "P010", nombre: "Panela triturada 1kg", costo: 5500, precio: 11000, iva: 0, linea: lineaAli },
  ];

  for (const p of productos) {
    const ex = await db.producto.findUnique({
      where: { empresaId_codigo: { empresaId: empresa.id, codigo: p.codigo } },
    });
    if (!ex) {
      const imp = p.iva === 19 ? impIva19 : p.iva === 5 ? impIva5 : impIva0;
      const producto = await db.producto.create({
        data: {
          empresaId: empresa.id,
          codigo: p.codigo,
          codigoBarras: "770" + Math.floor(1000000000 + Math.random() * 8999999999),
          nombre: p.nombre,
          tipo: "producto",
          inventariable: true,
          unidadMedidaId: undMed?.id,
          lineaId: p.linea?.id,
          costoPromedio: p.costo,
          ultimoCosto: p.costo,
          precio1: p.precio,
          precio2: Math.round(p.precio * 0.95),
          precio3: Math.round(p.precio * 0.9),
          impuestoId: imp?.id,
          tarifaIva: p.iva,
          stockMinimo: 10,
          stockMaximo: 200,
          activo: true,
        },
      });
      // Saldo inicial
      const cantInicial = Math.floor(Math.random() * 100) + 20;
      await db.saldoInventario.create({
        data: {
          empresaId: empresa.id,
          productoId: producto.id,
          bodegaId: bodega!.id,
          cantidad: cantInicial,
          costoTotal: cantInicial * p.costo,
          costoPromedio: p.costo,
        },
      });
      await db.movimientoInventario.create({
        data: {
          empresaId: empresa.id,
          productoId: producto.id,
          bodegaId: bodega!.id,
          tipo: "entrada",
          cantidad: cantInicial,
          costoUnitario: p.costo,
          costoTotal: cantInicial * p.costo,
          documentoTipo: "SALDO_INICIAL",
          fecha: new Date(),
        },
      });
    }
  }
  console.log("[seed] Productos creados:", productos.length);

  // 14. Centro de costo
  const exCc = await db.centroCosto.findUnique({
    where: { empresaId_codigo: { empresaId: empresa.id, codigo: "ADM" } },
  });
  if (!exCc) {
    await db.centroCosto.create({ data: { empresaId: empresa.id, codigo: "ADM", nombre: "Administración" } });
    await db.centroCosto.create({ data: { empresaId: empresa.id, codigo: "VEN", nombre: "Ventas" } });
  }

  console.log("[seed] ✅ Seed completado");
  console.log("[seed] Demo: demo@marsella.com / demo1234");
}

main()
  .catch((e) => {
    console.error("[seed] Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
