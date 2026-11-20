import { db } from "./db.ts";
import { alRefrescarDocker, dockerActivo, urlDocker, type Servicio } from "./docker.ts";
import { publicar } from "./eventos.ts";

/**
 * Consola de logs en vivo de todos los contenedores del VPS.
 *
 * Por cada contenedor encendido se abre una petición de Docker con follow=1: la conexión queda
 * abierta y Docker va mandando cada línea nueva. Las líneas se guardan en memoria (las últimas
 * 3000) y se reparten por SSE al panel. Si la conexión se corta (reinicio, despliegue, el proxy
 * cierra por tiempo) se vuelve a abrir pidiendo solo lo posterior a la última línea recibida.
 *
 * Además, los WARN/ERROR se agrupan por "huella" (el mensaje sin números ni ids) para saber
 * cuáles son nuevos y cuántas veces se repiten.
 */

export type Nivel = "info" | "warn" | "error";
export type LineaLog = {
  id: number;
  ts: number; // ms
  fuente: string; // nombre del contenedor
  grupo: string; // proyecto del panel
  nivel: Nivel;
  texto: string;
};

const MAX_LINEAS = 3000;
const lineas: LineaLog[] = [];
let siguienteId = 1;
const oyentes = new Set<(l: LineaLog) => void>();

// ---------- Nivel de cada línea ----------

const RE_ERROR =
  /\b(ERROR|CRITICAL|FATAL|PANIC)\b|"level"\s*:\s*"(error|fatal|panic)"|Traceback \(most recent|Unhandled|\b[A-Z]\w*(Error|Exception):|" 5\d\d\b| 5\d\d in \d/;
const RE_WARN = /\bWARN(ING)?\b|"level"\s*:\s*"warn(ing)?"|⚠/i;

function nivelDe(texto: string): Nivel {
  // Líneas de continuación de un traceback ("  File ..."): son contexto, no un error aparte
  if (/^\s+(File |at |\^)/.test(texto)) return "info";
  if (RE_ERROR.test(texto)) return "error";
  if (RE_WARN.test(texto)) return "warn";
  return "info";
}

// ---------- Errores agrupados ----------

db.exec(`
  CREATE TABLE IF NOT EXISTS errores (
    huella   TEXT PRIMARY KEY,
    fuente   TEXT NOT NULL,
    grupo    TEXT NOT NULL,
    nivel    TEXT NOT NULL,
    ejemplo  TEXT NOT NULL,
    primera  INTEGER NOT NULL,
    ultima   INTEGER NOT NULL,
    total    INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS errores_hora (
    huella  TEXT NOT NULL,
    hora    INTEGER NOT NULL,
    n       INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (huella, hora)
  );
`);

/** "Brevo 429 at 12:03:44 id=8f3a…" y "Brevo 429 at 12:05:10 id=1b2c…" son el mismo error */
function huellaDe(fuente: string, texto: string) {
  const limpio = texto
    .replace(/^\S*\d{4}-\d\d-\d\d[T ][\d:.,]+Z?\S*\s*/, "") // marca de tiempo propia de la app
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<id>")
    .replace(/\b[0-9a-f]{10,}\b/gi, "<hex>")
    .replace(/(["'])(?:(?!\1).){0,200}\1/g, "$1…$1")
    .replace(/\d+([.,]\d+)?/g, "#")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180)
    .toLowerCase();
  return `${fuente}|${limpio}`;
}

const sumarError = db.prepare(`
  INSERT INTO errores (huella, fuente, grupo, nivel, ejemplo, primera, ultima, total) VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  ON CONFLICT(huella) DO UPDATE SET ultima = excluded.ultima, total = total + 1, ejemplo = excluded.ejemplo,
    nivel = CASE WHEN excluded.nivel = 'error' THEN 'error' ELSE nivel END
`);
const sumarHora = db.prepare(
  "INSERT INTO errores_hora (huella, hora, n) VALUES (?, ?, 1) ON CONFLICT(huella, hora) DO UPDATE SET n = n + 1",
);
const existe = db.prepare("SELECT 1 FROM errores WHERE huella = ?");
let cargaInicial = true; // las líneas viejas que llegan al arrancar no cuentan como "nuevas"

function registrarProblema(l: LineaLog) {
  const huella = huellaDe(l.fuente, l.texto);
  const nueva = !existe.get(huella);
  sumarError.run(huella, l.fuente, l.grupo, l.nivel, l.texto.slice(0, 500), l.ts, l.ts);
  sumarHora.run(huella, Math.floor(l.ts / 3600_000) * 3600_000);
  if (nueva && !cargaInicial && l.nivel === "error") {
    publicar("error_nuevo", `Error nuevo en ${l.fuente}: ${l.texto.slice(0, 140)}`, { proyecto: l.grupo, logs: l.texto.slice(0, 60) });
  }
}

setInterval(() => {
  db.prepare("DELETE FROM errores_hora WHERE hora < ?").run(Date.now() - 30 * 864e5);
}, 3600_000).unref();

/** WARN/ERROR agrupados de las últimas `horas`, los nuevos primero. */
export function erroresAgrupados(horas = 24) {
  const desde = Date.now() - horas * 3600_000;
  const filas = db
    .prepare(
      `SELECT e.huella, e.fuente, e.grupo, e.nivel, e.ejemplo, e.primera, e.ultima, e.total, SUM(h.n) AS recientes
       FROM errores e JOIN errores_hora h ON h.huella = e.huella
       WHERE h.hora >= ? GROUP BY e.huella ORDER BY e.ultima DESC LIMIT 50`,
    )
    .all(Math.floor(desde / 3600_000) * 3600_000) as {
    huella: string;
    fuente: string;
    grupo: string;
    nivel: Nivel;
    ejemplo: string;
    primera: number;
    ultima: number;
    total: number;
    recientes: number;
  }[];
  return filas
    .map((f) => ({ ...f, nuevo: f.primera >= desde }))
    .sort((a, b) => Number(b.nuevo) - Number(a.nuevo) || (a.nivel === b.nivel ? b.ultima - a.ultima : a.nivel === "error" ? -1 : 1));
}

// ---------- Seguir los logs de cada contenedor ----------

type Seguidor = { servicio: Servicio; ultimoTs: string; ultimoNs: bigint; cancelar: AbortController; vivo: boolean };

/** Docker manda RFC3339 con nanosegundos y quita ceros finales: se compara como número, no como texto */
function nsDe(ts: string): bigint {
  const m = /^(.+?)(?:\.(\d+))?Z$/.exec(ts);
  if (!m) return 0n;
  const seg = Date.parse(m[1] + "Z");
  if (Number.isNaN(seg)) return 0n;
  return BigInt(seg) * 1_000_000n + BigInt((m[2] ?? "").padEnd(9, "0").slice(0, 9));
}
const seguidores = new Map<string, Seguidor>();

/** El proxy de Docker escribe una línea por petición: incluirlo crearía un bucle de logs */
const IGNORAR = (s: Servicio) => /socket-proxy/.test(s.imagen) || s.contenedor.endsWith("docker-proxy-1");

function agregar(s: Servicio, tsTexto: string, texto: string) {
  const ts = Date.parse(tsTexto) || Date.now();
  const l: LineaLog = { id: siguienteId++, ts, fuente: s.contenedor, grupo: s.grupo, nivel: nivelDe(texto), texto: texto.slice(0, 4000) };
  lineas.push(l);
  if (lineas.length > MAX_LINEAS) lineas.splice(0, lineas.length - MAX_LINEAS);
  if (l.nivel !== "info") registrarProblema(l);
  for (const fn of oyentes) fn(l);
}

/**
 * Lee el cuerpo que Docker va mandando. Sin TTY viene en "tramas" de 8 bytes de cabecera
 * (byte 0 = stdout/stderr, bytes 4–7 = largo) + texto; con TTY viene texto plano.
 */
async function leerFlujo(seg: Seguidor, cuerpo: ReadableStream<Uint8Array>) {
  const lector = cuerpo.getReader();
  let pendiente = Buffer.alloc(0);
  let texto = "";
  let conTramas: boolean | null = null;

  const procesarTexto = (fragmento: string) => {
    texto += fragmento;
    let corte: number;
    while ((corte = texto.indexOf("\n")) >= 0) {
      const linea = texto.slice(0, corte).replace(/\r$/, "");
      texto = texto.slice(corte + 1);
      const espacio = linea.indexOf(" ");
      if (espacio < 0) continue;
      const tsTexto = linea.slice(0, espacio);
      // Al reconectar, Docker repite las líneas del mismo segundo: se descartan las ya vistas
      const ns = nsDe(tsTexto);
      if (ns <= seg.ultimoNs) continue;
      seg.ultimoNs = ns;
      seg.ultimoTs = tsTexto;
      agregar(seg.servicio, tsTexto, linea.slice(espacio + 1));
    }
  };

  for (;;) {
    const { value, done } = await lector.read();
    if (done) break;
    pendiente = Buffer.concat([pendiente, Buffer.from(value)]);
    if (conTramas === null && pendiente.length >= 8) {
      conTramas = (pendiente[0] === 1 || pendiente[0] === 2) && pendiente[1] === 0 && pendiente[2] === 0 && pendiente[3] === 0;
    }
    if (conTramas === null) continue;
    if (!conTramas) {
      procesarTexto(pendiente.toString("utf8"));
      pendiente = Buffer.alloc(0);
      continue;
    }
    while (pendiente.length >= 8) {
      const largo = pendiente.readUInt32BE(4);
      if (pendiente.length < 8 + largo) break;
      procesarTexto(pendiente.subarray(8, 8 + largo).toString("utf8"));
      pendiente = pendiente.subarray(8 + largo);
    }
  }
}

async function seguir(seg: Seguidor) {
  while (seg.vivo) {
    try {
      // Primera vez: las últimas 150 líneas. Al reconectar: solo lo posterior a la última recibida.
      const desde = seg.ultimoTs ? `&since=${Math.floor(Date.parse(seg.ultimoTs) / 1000)}` : "&tail=150";
      const r = await fetch(
        urlDocker(`/containers/${seg.servicio.idCompleto}/logs?follow=1&stdout=1&stderr=1&timestamps=1${desde}`),
        { signal: seg.cancelar.signal },
      );
      if (!r.ok || !r.body) throw new Error(`Docker respondió ${r.status}`);
      await leerFlujo(seg, r.body);
    } catch {
      // Es normal que el proxy cierre conexiones largas o que el contenedor se reinicie: se reintenta
    }
    if (seg.vivo) await new Promise((r) => setTimeout(r, 3000));
  }
}

function sincronizar(servicios: Servicio[]) {
  const encendidos = new Map(servicios.filter((s) => s.estado === "running" && !IGNORAR(s)).map((s) => [s.idCompleto, s]));
  for (const [id, seg] of seguidores) {
    if (!encendidos.has(id)) {
      seg.vivo = false;
      seg.cancelar.abort();
      seguidores.delete(id);
    }
  }
  for (const [id, s] of encendidos) {
    if (seguidores.has(id)) {
      seguidores.get(id)!.servicio = s;
      continue;
    }
    const seg: Seguidor = { servicio: s, ultimoTs: "", ultimoNs: 0n, cancelar: new AbortController(), vivo: true };
    seguidores.set(id, seg);
    seguir(seg);
  }
}

export function iniciarLogs() {
  if (!dockerActivo()) return () => {};
  const quitar = alRefrescarDocker(sincronizar);
  // Las primeras líneas de cada contenedor (tail=150) llegan en los primeros segundos
  const t = setTimeout(() => {
    cargaInicial = false;
    lineas.sort((a, b) => a.ts - b.ts);
  }, 20_000);
  return () => {
    quitar();
    clearTimeout(t);
    for (const seg of seguidores.values()) {
      seg.vivo = false;
      seg.cancelar.abort();
    }
  };
}

export const lineasRecientes = (n = 800) => lineas.slice(-n);

export function alLineaNueva(fn: (l: LineaLog) => void) {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}

export function lineasAlrededor(ts: number, fuente?: string, n = 40) {
  const de = fuente ? lineas.filter((l) => l.fuente === fuente) : lineas;
  const i = de.findIndex((l) => l.ts >= ts);
  const centro = i < 0 ? de.length - 1 : i;
  return de.slice(Math.max(0, centro - n), centro + n);
}
