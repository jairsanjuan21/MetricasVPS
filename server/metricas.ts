import { readFile, statfs } from "node:fs/promises";
import { join } from "node:path";
import { config } from "./config.ts";
import { db, diaLocal } from "./db.ts";

/**
 * Recolector de métricas del VPS.
 *
 * Linux expone todo en archivos de texto dentro de /proc. En producción el contenedor monta
 * el /proc del VPS en /host/proc (solo lectura), así medimos el servidor completo y no solo el contenedor.
 * Muchos valores son contadores que solo crecen (bytes de red, tiempo de CPU): la métrica real
 * sale de la diferencia entre dos lecturas dividida por el tiempo transcurrido.
 */

const INTERVALO_MS = 2000;
const PUNTOS_RECIENTES = 450; // 15 min a 2 s

export type Muestra = { ts: number; cpu: number; ram: number; swap: number; redIn: number; redOut: number };

export type Instantanea = {
  ts: number;
  uptimeSeg: number;
  cpu: { pct: number; nucleos: number; carga: [number, number, number] };
  ram: { totalB: number; usadaB: number; cacheB: number; pct: number };
  swap: { totalB: number; usadaB: number; pct: number };
  disco: { totalB: number; usadoB: number; pct: number; lecturaBs: number; escrituraBs: number };
  red: {
    interfaz: string;
    inMbps: number;
    outMbps: number;
    hoyRxB: number;
    hoyTxB: number;
    mesB: number;
    limiteB: number;
    pct: number;
    diasParaCorte: number;
  };
};

// ---------- Lectura de /proc ----------

/**
 * Modo simulado: en Windows o macOS no existe /proc. Para poder desarrollar el frontend en tu PC,
 * se generan archivos /proc falsos con valores que se mueven. En el VPS (Linux) nunca se activa.
 */
const simulado = process.platform !== "linux" || process.env.SIMULAR === "1";
if (simulado) console.warn("[metricas] Sin /proc (no es Linux): usando datos SIMULADOS para desarrollo");

const falso = { cpuTotal: 0, cpuInactivo: 0, rx: 0, tx: 0, ram: 0.45, lectura: 0, escritura: 0 };
function procSimulado(ruta: string): string {
  const azar = (min: number, max: number) => min + Math.random() * (max - min);
  if (ruta === "stat") {
    const uso = azar(0.08, 0.45);
    falso.cpuTotal += 200;
    falso.cpuInactivo += 200 * (1 - uso);
    return `cpu  ${Math.round(falso.cpuTotal - falso.cpuInactivo)} 0 0 ${Math.round(falso.cpuInactivo)} 0 0 0 0\ncpu0 0\ncpu1 0\n`;
  }
  if (ruta === "meminfo") {
    falso.ram = Math.min(0.9, Math.max(0.3, falso.ram + azar(-0.01, 0.01)));
    const total = 8 * 1024 * 1024;
    return `MemTotal: ${total} kB\nMemAvailable: ${Math.round(total * (1 - falso.ram))} kB\nCached: 900000 kB\nBuffers: 60000 kB\nSReclaimable: 120000 kB\nSwapTotal: 2097152 kB\nSwapFree: 1966080 kB\n`;
  }
  if (ruta.endsWith("net/dev")) {
    falso.rx += azar(100_000, 1_500_000);
    falso.tx += azar(200_000, 3_000_000);
    return `cabecera\ncabecera\n  eth0: ${Math.round(falso.rx)} 0 0 0 0 0 0 0 ${Math.round(falso.tx)} 0 0 0 0 0 0 0\n`;
  }
  if (ruta === "diskstats") {
    falso.lectura += azar(0, 400);
    falso.escritura += azar(0, 900);
    return `   8 0 sda 0 0 ${Math.round(falso.lectura)} 0 0 0 ${Math.round(falso.escritura)} 0 0 0 0\n`;
  }
  if (ruta === "loadavg") return `${azar(0.1, 0.9).toFixed(2)} 0.35 0.30 1/200 1234\n`;
  if (ruta === "uptime") return `${Math.round(process.uptime() + 2_000_000)} 0\n`;
  return "";
}

const leer = async (ruta: string) => (simulado ? procSimulado(ruta) : readFile(join(config.hostProc, ruta), "utf8"));

async function leerCpu() {
  const texto = await leer("stat");
  const lineas = texto.split("\n");
  const campos = lineas[0]!.trim().split(/\s+/).slice(1).map(Number);
  // user nice system idle iowait irq softirq steal
  const inactivo = (campos[3] ?? 0) + (campos[4] ?? 0);
  const total = campos.slice(0, 8).reduce((a, b) => a + b, 0);
  const nucleos = lineas.filter((l) => /^cpu\d+ /.test(l)).length;
  return { inactivo, total, nucleos };
}

async function leerMemoria() {
  const mapa = new Map<string, number>();
  for (const linea of (await leer("meminfo")).split("\n")) {
    const m = /^(\w+):\s+(\d+)/.exec(linea);
    if (m) mapa.set(m[1]!, Number(m[2]) * 1024); // viene en kB
  }
  const v = (k: string) => mapa.get(k) ?? 0;
  const total = v("MemTotal");
  const disponible = v("MemAvailable"); // lo que realmente se puede usar sin hacer swap
  const swapTotal = v("SwapTotal");
  return {
    total,
    usada: total - disponible,
    cache: v("Cached") + v("Buffers") + v("SReclaimable"),
    swapTotal,
    swapUsada: swapTotal - v("SwapFree"),
  };
}

const INTERFAZ_IGNORADA = /^(lo|docker\d*|br-|veth|virbr|tun|tap|wg)/;
let avisoRed = false;

async function leerRed() {
  // /proc/1/net/dev = la red del proceso 1 del VPS, es decir, la red real del servidor.
  // /proc/net/dev apuntaría a la red del propio contenedor, que no es lo que queremos.
  let texto: string;
  try {
    texto = await leer("1/net/dev");
  } catch {
    if (!avisoRed) {
      console.warn("[metricas] No se pudo leer 1/net/dev; se usa net/dev (en Docker sería la red del contenedor)");
      avisoRed = true;
    }
    texto = await leer("net/dev");
  }
  const interfaces = texto
    .split("\n")
    .slice(2)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [nombre, resto] = l.split(":");
      const c = resto!.trim().split(/\s+/).map(Number);
      return { nombre: nombre!.trim(), rx: c[0] ?? 0, tx: c[8] ?? 0 };
    });

  const elegida = config.interfazRed
    ? interfaces.find((i) => i.nombre === config.interfazRed)
    : interfaces.filter((i) => !INTERFAZ_IGNORADA.test(i.nombre)).sort((a, b) => b.rx + b.tx - (a.rx + a.tx))[0];
  return elegida ?? { nombre: "?", rx: 0, tx: 0 };
}

async function leerDisco() {
  // Discos completos (no particiones): sda, vda, nvme0n1...
  let lectura = 0;
  let escritura = 0;
  for (const linea of (await leer("diskstats")).split("\n")) {
    const c = linea.trim().split(/\s+/);
    if (c.length < 10 || !/^(sd[a-z]+|vd[a-z]+|xvd[a-z]+|nvme\d+n\d+)$/.test(c[2]!)) continue;
    lectura += Number(c[5]) * 512;
    escritura += Number(c[9]) * 512;
  }
  // El volumen de datos vive en el disco del VPS, así que su statfs describe ese disco.
  const fs = await statfs(config.datosDir);
  const total = fs.blocks * fs.bsize;
  const libre = fs.bavail * fs.bsize;
  return { lectura, escritura, total, usado: total - libre };
}

async function leerSistema() {
  const [carga, uptime] = await Promise.all([leer("loadavg"), leer("uptime")]);
  const c = carga.split(" ").map(Number);
  return { carga: [c[0] ?? 0, c[1] ?? 0, c[2] ?? 0] as [number, number, number], uptimeSeg: Number(uptime.split(" ")[0]) };
}

// ---------- Estado en memoria ----------

let anterior: { ts: number; cpu: Awaited<ReturnType<typeof leerCpu>>; red: { rx: number; tx: number }; disco: { lectura: number; escritura: number } } | null =
  null;
let ultima: Instantanea | null = null;
const recientes: Muestra[] = [];
const oyentes = new Set<(i: Instantanea) => void>();

// Acumuladores para el promedio por minuto y el tráfico del día
let minutoActual = 0;
let sumaMinuto = { n: 0, cpu: 0, ram: 0, swap: 0, redIn: 0, redOut: 0 };
let traficoPendiente = { dia: diaLocal(), rx: 0, tx: 0 };

const guardarMinuto = db.prepare(
  "INSERT OR REPLACE INTO muestras_minuto (ts, cpu, ram, swap, red_in, red_out) VALUES (?, ?, ?, ?, ?, ?)",
);
const sumarTrafico = db.prepare(
  "INSERT INTO trafico_dia (dia, rx, tx) VALUES (?, ?, ?) ON CONFLICT(dia) DO UPDATE SET rx = rx + excluded.rx, tx = tx + excluded.tx",
);

function volcarTrafico() {
  const t = traficoPendiente;
  if (t.rx || t.tx) sumarTrafico.run(t.dia, t.rx, t.tx);
  traficoPendiente = { dia: diaLocal(), rx: 0, tx: 0 };
}

function cerrarMinuto() {
  const s = sumaMinuto;
  if (s.n > 0) guardarMinuto.run(minutoActual, s.cpu / s.n, s.ram / s.n, s.swap / s.n, s.redIn / s.n, s.redOut / s.n);
  sumaMinuto = { n: 0, cpu: 0, ram: 0, swap: 0, redIn: 0, redOut: 0 };
  volcarTrafico();
  // Una vez por hora se borra lo de más de 8 días
  if (new Date(minutoActual).getMinutes() === 0) db.prepare("DELETE FROM muestras_minuto WHERE ts < ?").run(Date.now() - 8 * 864e5);
}

/** Primer día del ciclo de facturación actual (AAAA-MM-DD). */
function inicioDelCiclo(hoy = new Date()) {
  const [a, m, d] = diaLocal(hoy).split("-").map(Number) as [number, number, number];
  const corte = config.bandaDiaCorte;
  const inicio = d >= corte ? new Date(Date.UTC(a, m - 1, corte)) : new Date(Date.UTC(a, m - 2, corte));
  const siguiente = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth() + 1, corte));
  const hoyUtc = Date.UTC(a, m - 1, d);
  return { desde: inicio.toISOString().slice(0, 10), dias: Math.ceil((siguiente.getTime() - hoyUtc) / 864e5) };
}

const consultaMes = db.prepare("SELECT COALESCE(SUM(rx + tx), 0) AS total FROM trafico_dia WHERE dia >= ?");
const consultaDia = db.prepare("SELECT rx, tx FROM trafico_dia WHERE dia = ?");

async function tomarMuestra() {
  const ts = Date.now();
  const [cpu, mem, red, disco, sis] = await Promise.all([leerCpu(), leerMemoria(), leerRed(), leerDisco(), leerSistema()]);

  let cpuPct = 0;
  let inMbps = 0;
  let outMbps = 0;
  let lecturaBs = 0;
  let escrituraBs = 0;

  if (anterior) {
    const seg = (ts - anterior.ts) / 1000;
    const dTotal = cpu.total - anterior.cpu.total;
    const dInactivo = cpu.inactivo - anterior.cpu.inactivo;
    cpuPct = dTotal > 0 ? ((dTotal - dInactivo) / dTotal) * 100 : 0;

    // Si el contador bajó (reinicio de la interfaz) la diferencia es negativa: se descarta esa vuelta.
    const dRx = red.rx - anterior.red.rx;
    const dTx = red.tx - anterior.red.tx;
    if (dRx >= 0 && dTx >= 0) {
      inMbps = (dRx * 8) / seg / 1e6;
      outMbps = (dTx * 8) / seg / 1e6;
      if (traficoPendiente.dia !== diaLocal()) volcarTrafico();
      traficoPendiente.rx += dRx;
      traficoPendiente.tx += dTx;
    }
    lecturaBs = Math.max(0, disco.lectura - anterior.disco.lectura) / seg;
    escrituraBs = Math.max(0, disco.escritura - anterior.disco.escritura) / seg;
  }
  anterior = { ts, cpu, red, disco };

  const ramPct = mem.total ? (mem.usada / mem.total) * 100 : 0;
  const swapPct = mem.swapTotal ? (mem.swapUsada / mem.swapTotal) * 100 : 0;

  // Historial reciente y promedio por minuto
  const muestra: Muestra = { ts, cpu: cpuPct, ram: ramPct, swap: swapPct, redIn: inMbps, redOut: outMbps };
  recientes.push(muestra);
  if (recientes.length > PUNTOS_RECIENTES) recientes.shift();

  const minuto = Math.floor(ts / 60000) * 60000;
  if (minuto !== minutoActual) {
    if (minutoActual) cerrarMinuto();
    minutoActual = minuto;
  }
  sumaMinuto.n++;
  sumaMinuto.cpu += cpuPct;
  sumaMinuto.ram += ramPct;
  sumaMinuto.swap += swapPct;
  sumaMinuto.redIn += inMbps;
  sumaMinuto.redOut += outMbps;

  // Tráfico: lo guardado + lo que aún está en memoria
  const ciclo = inicioDelCiclo();
  const hoyDb = (consultaDia.get(diaLocal()) as { rx: number; tx: number } | undefined) ?? { rx: 0, tx: 0 };
  const mesB = Number((consultaMes.get(ciclo.desde) as { total: number }).total) + traficoPendiente.rx + traficoPendiente.tx;
  const limiteB = config.bandaLimiteGb * 1e9;

  ultima = {
    ts,
    uptimeSeg: sis.uptimeSeg,
    cpu: { pct: cpuPct, nucleos: cpu.nucleos, carga: sis.carga },
    ram: { totalB: mem.total, usadaB: mem.usada, cacheB: mem.cache, pct: ramPct },
    swap: { totalB: mem.swapTotal, usadaB: mem.swapUsada, pct: swapPct },
    disco: { totalB: disco.total, usadoB: disco.usado, pct: disco.total ? (disco.usado / disco.total) * 100 : 0, lecturaBs, escrituraBs },
    red: {
      interfaz: red.nombre,
      inMbps,
      outMbps,
      hoyRxB: hoyDb.rx + traficoPendiente.rx,
      hoyTxB: hoyDb.tx + traficoPendiente.tx,
      mesB,
      limiteB,
      pct: (mesB / limiteB) * 100,
      diasParaCorte: ciclo.dias,
    },
  };
  for (const fn of oyentes) fn(ultima);
}

// ---------- API pública del módulo ----------

export function iniciarRecolector() {
  const vuelta = () =>
    tomarMuestra().catch((e) => console.error("[metricas] Error leyendo /proc:", e instanceof Error ? e.message : e));
  vuelta();
  const t = setInterval(vuelta, INTERVALO_MS);
  const cerrar = () => {
    clearInterval(t);
    cerrarMinuto();
  };
  return cerrar;
}

export const ultimaInstantanea = () => ultima;

export function alNuevaMuestra(fn: (i: Instantanea) => void) {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}

export type Rango = "15m" | "1h" | "24h";

/** Serie para las gráficas, con ~150–300 puntos sin importar el rango. */
export function historial(rango: Rango): Muestra[] {
  if (rango === "15m") return recientes.filter((_, i) => i % 3 === 0 || i === recientes.length - 1);

  const minutos = rango === "1h" ? 60 : 1440;
  const filas = db
    .prepare("SELECT ts, cpu, ram, swap, red_in AS redIn, red_out AS redOut FROM muestras_minuto WHERE ts >= ? ORDER BY ts")
    .all(Date.now() - minutos * 60000) as Muestra[];
  if (rango === "1h") return filas;

  // 24 h: promedios de 5 minutos
  const grupos = new Map<number, Muestra[]>();
  for (const f of filas) {
    const clave = Math.floor(f.ts / 300000) * 300000;
    (grupos.get(clave) ?? grupos.set(clave, []).get(clave)!).push(f);
  }
  return [...grupos].map(([ts, g]) => {
    const prom = (k: keyof Muestra) => g.reduce((a, m) => a + m[k], 0) / g.length;
    return { ts, cpu: prom("cpu"), ram: prom("ram"), swap: prom("swap"), redIn: prom("redIn"), redOut: prom("redOut") };
  });
}
