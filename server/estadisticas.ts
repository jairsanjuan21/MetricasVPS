import { db, diaLocal, guardarAjuste, leerAjuste } from "./db.ts";
import { ultimaInstantanea } from "./metricas.ts";
import { CATEGORIA, eventosDesde, type Categoria, type Evento } from "./eventos.ts";

/**
 * Números de la vista general con su "comparación con lo normal":
 * no basta decir "38 visitas", sirve más "38 visitas, +20 % frente a tus jueves".
 */

db.exec("CREATE TABLE IF NOT EXISTS anm_barridos (inicio TEXT PRIMARY KEY, ts INTEGER NOT NULL, nuevas INTEGER NOT NULL, duracion INTEGER)");

const DIA = 864e5;
const BOGOTA = 5 * 3600_000; // Colombia es UTC-5 todo el año
const horaLocal = (ts: number) => new Date(ts - BOGOTA).getUTCHours();
const diaDe = (ts: number) => diaLocal(new Date(ts));
const inicioDia = (ts = Date.now()) => Math.floor((ts - BOGOTA) / DIA) * DIA + BOGOTA;

// ---------- Disco: un punto por día para estimar cuándo se llena ----------

db.exec("CREATE TABLE IF NOT EXISTS disco_dia (dia TEXT PRIMARY KEY, usado INTEGER NOT NULL, total INTEGER NOT NULL)");
const anotarDisco = db.prepare(
  "INSERT INTO disco_dia (dia, usado, total) VALUES (?, ?, ?) ON CONFLICT(dia) DO UPDATE SET usado = excluded.usado, total = excluded.total",
);
setInterval(() => {
  const m = ultimaInstantanea();
  if (m) anotarDisco.run(diaLocal(), m.disco.usadoB, m.disco.totalB);
}, 10 * 60_000).unref();
setTimeout(() => {
  const m = ultimaInstantanea();
  if (m) anotarDisco.run(diaLocal(), m.disco.usadoB, m.disco.totalB);
}, 15_000).unref();

function servidor() {
  const m = ultimaInstantanea();
  const hora = horaLocal(Date.now());
  // CPU normal a esta hora: promedio de la misma hora en los últimos 7 días (sin contar hoy)
  const filas = db
    .prepare("SELECT ts, cpu, ram FROM muestras_minuto WHERE ts >= ? AND ts < ?")
    .all(inicioDia() - 7 * DIA, inicioDia()) as { ts: number; cpu: number; ram: number }[];
  const mismaHora = filas.filter((f) => horaLocal(f.ts) === hora);
  const prom = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

  // Disco: crecimiento diario de las últimas 2 semanas -> días hasta llenarse
  const discos = db.prepare("SELECT dia, usado, total FROM disco_dia ORDER BY dia DESC LIMIT 15").all() as {
    dia: string;
    usado: number;
    total: number;
  }[];
  let discoDiasParaLlenarse: number | null = null;
  if (discos.length >= 3) {
    const nuevo = discos[0]!;
    const viejo = discos[discos.length - 1]!;
    const dias = (Date.parse(nuevo.dia) - Date.parse(viejo.dia)) / DIA;
    const porDia = dias > 0 ? (nuevo.usado - viejo.usado) / dias : 0;
    if (porDia > 0) discoDiasParaLlenarse = Math.round((nuevo.total - nuevo.usado) / porDia);
  }

  return {
    cpuNormal: prom(mismaHora.map((f) => f.cpu)),
    ramNormal: prom(mismaHora.map((f) => f.ram)),
    discoDiasParaLlenarse,
    sparkCpu: sparkline("cpu"),
    sparkRam: sparkline("ram"),
    tieneMetricas: !!m,
  };
}

/** Últimas 2 horas en 24 puntos (promedios de 5 min) para las mini-gráficas */
function sparkline(campo: "cpu" | "ram") {
  const filas = db.prepare(`SELECT ts, ${campo} AS v FROM muestras_minuto WHERE ts >= ?`).all(Date.now() - 2 * 3600_000) as {
    ts: number;
    v: number;
  }[];
  const cubos: number[][] = Array.from({ length: 24 }, () => []);
  for (const f of filas) {
    const i = Math.min(23, Math.floor((f.ts - (Date.now() - 2 * 3600_000)) / 300_000));
    if (i >= 0) cubos[i]!.push(f.v);
  }
  return cubos.map((c) => (c.length ? c.reduce((a, b) => a + b, 0) / c.length : null));
}

function fersautos() {
  const hoy = diaLocal();
  const ayer = diaDe(Date.now() - DIA);
  const porHora = (dia: string) => {
    const h = Array.from({ length: 24 }, () => 0);
    for (const f of db.prepare("SELECT ts FROM visitas WHERE dia = ?").all(dia) as { ts: number }[]) h[horaLocal(f.ts)]!++;
    return h;
  };
  const horaActual = horaLocal(Date.now());
  const hoyH = porHora(hoy);
  const visitasHoy = hoyH.reduce((a, b) => a + b, 0);

  // "Normal": mismo día de la semana en las 4 semanas anteriores, contando solo hasta esta hora
  const previos = [1, 2, 3, 4].map((s) => porHora(diaDe(Date.now() - s * 7 * DIA)));
  const conDatos = previos.filter((h) => h.some((n) => n > 0));
  const normalHastaAhora = conDatos.length
    ? conDatos.map((h) => h.slice(0, horaActual + 1).reduce((a, b) => a + b, 0)).reduce((a, b) => a + b, 0) / conDatos.length
    : null;

  const dia = (db.prepare("SELECT pico, enviados FROM catalogo_dia WHERE dia = ?").get(hoy) as
    | { pico: number; enviados: number }
    | undefined) ?? { pico: 0, enviados: 0 };
  const envAnt = db
    .prepare("SELECT AVG(enviados) AS p, COUNT(*) AS n FROM catalogo_dia WHERE dia < ? AND dia >= ?")
    .get(hoy, diaDe(Date.now() - 14 * DIA)) as { p: number | null; n: number };

  const vieronModelo = (db.prepare("SELECT COUNT(DISTINCT alias) AS n FROM vistas_modelo WHERE dia = ?").get(hoy) as { n: number }).n;
  const abrieron = (
    db.prepare("SELECT COUNT(*) AS n FROM eventos WHERE tipo = 'formulario_abierto' AND ts >= ?").get(inicioDia()) as { n: number }
  ).n;

  return {
    visitasHoy,
    normalHastaAhora,
    porHoraHoy: hoyH,
    porHoraAyer: porHora(ayer),
    horaActual,
    enviadosHoy: dia.enviados,
    enviadosNormal: envAnt.n >= 3 ? envAnt.p : null,
    pico: dia.pico,
    embudo: { entraron: visitasHoy, vieronModelo, abrieronFormulario: abrieron, enviaron: dia.enviados },
    origenes: db
      .prepare("SELECT origen, COUNT(*) AS n FROM visitas WHERE dia = ? GROUP BY origen ORDER BY n DESC")
      .all(hoy) as { origen: string; n: number }[],
    modelos: db
      .prepare("SELECT modelo, COUNT(*) AS n FROM vistas_modelo WHERE dia = ? GROUP BY modelo ORDER BY n DESC LIMIT 5")
      .all(hoy) as { modelo: string; n: number }[],
  };
}

// ---------- "Desde tu última visita" ----------
// La visita anterior es la última vez que el panel estuvo abierto, si fue hace más de 30 min.

type Visita = { anterior: number | null; actividad: number | null };
let visita = leerAjuste<Visita>("visita", { anterior: null, actividad: null });

export function marcarActividad(conectando = false) {
  const ahora = Date.now();
  if (conectando && visita.actividad && ahora - visita.actividad > 30 * 60_000) visita.anterior = visita.actividad;
  visita.actividad = ahora;
  guardarAjuste("visita", visita);
}

function desdeUltimaVisita() {
  const desde = visita.anterior;
  if (!desde) return null;
  const n = (sql: string, ...p: (number | string)[]) => (db.prepare(sql).get(...p) as { n: number | null }).n ?? 0;
  return {
    desde,
    visitas: n("SELECT COUNT(*) AS n FROM visitas WHERE ts >= ?", desde),
    formularios: n("SELECT COUNT(*) AS n FROM eventos WHERE tipo = 'formulario_enviado' AND ts >= ?", desde),
    anmNuevas: n("SELECT SUM(nuevas) AS n FROM anm_barridos WHERE ts >= ?", desde),
    alertas: (db.prepare("SELECT texto FROM eventos WHERE tipo IN ('alerta', 'error_nuevo') AND ts >= ? ORDER BY ts DESC LIMIT 3").all(
      desde,
    ) as { texto: string }[]).map((f) => f.texto),
  };
}

export function resumenGeneral() {
  return { servidor: servidor(), fersautos: fersautos(), desdeUltimaVisita: desdeUltimaVisita() };
}

// ---------- Línea de tiempo ----------

export type ItemLinea = Evento & { categoria: Categoria | "visitas"; hasta?: number };

/** Eventos de las últimas 48 h + las visitas agrupadas por hora ("12 visitantes entraron entre 6 y 7 p. m.") */
export function lineaDeTiempo(): ItemLinea[] {
  const desde = Date.now() - 2 * DIA;
  const eventos: ItemLinea[] = eventosDesde(desde, 250)
    // Abrir el formulario ya se ve en el grupo de visitas y en "enviado"; aquí sería ruido
    .filter((e) => e.tipo !== "formulario_abierto")
    .map((e) => ({ ...e, categoria: CATEGORIA[e.tipo] }));

  // Colombia está a 5 h exactas de UTC: las horas en punto coinciden, basta dividir
  const porHora = db
    .prepare("SELECT CAST(ts / 3600000 AS INTEGER) AS h, COUNT(*) AS n FROM visitas WHERE ts >= ? GROUP BY h")
    .all(desde) as { h: number; n: number }[];
  const grupos: ItemLinea[] = porHora.map((g) => {
    const ts = g.h * 3600_000;
    return {
      id: -ts,
      ts,
      hasta: ts + 3600_000,
      tipo: "formulario_abierto",
      categoria: "visitas",
      proyecto: "fersautos",
      texto: `${g.n} ${g.n === 1 ? "visitante entró" : "visitantes entraron"} al catálogo`,
    };
  });
  return [...eventos, ...grupos].sort((a, b) => b.ts - a.ts).slice(0, 120);
}
